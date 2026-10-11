/**
 * Me endpoints (spec 2.7): profile, password change, data export and self-deletion (4.10).
 */
import type { ExportResponse } from '../../../src/api/types.ts';
import { iso, isoOrNull } from '../clock.ts';
import type { AppRoute, RequestContext } from '../context.ts';
import { authOf } from '../context.ts';
import { isUniqueViolation, many, run, tx } from '../db/database.ts';
import { devicesOfUser } from '../domain/devices.ts';
import { passwordPolicyError } from '../domain/passwords.ts';
import { allEntitlements, effectivePlan } from '../domain/plans.ts';
import { deleteSubscribersWithRetry } from '../domain/revenuecat-api.ts';
import { activeSessionsOfUser, deleteUserSessions } from '../domain/sessions.ts';
import {
  countActiveAdmins, deleteUser, getUser, getUserByEmail, renewingStoreSubscription, toUser,
} from '../domain/users.ts';
import { ApiError, invalidCredentials, validationFailed } from '../http/errors.ts';
import { json, noContent, type Reply } from '../http/response.ts';
import { route } from '../http/router.ts';
import { Fields, hasOwn, readBool, readCountry, readDisplayName, readEmail, readLanguage, readPassword } from '../http/validate.ts';
import { maskEmail } from '../log.ts';
import { meResponse, reloadUser } from './shared.ts';

const notAnAccount = (): ApiError => new ApiError(409, 'not_an_account', 'Only accounts have an email and a password; sign up first');
const emailTaken = (): ApiError => new ApiError(409, 'email_taken', 'An account with this email already exists');

function getMe(ctx: RequestContext): Reply {
  const auth = authOf(ctx);
  return json(200, meResponse(ctx, reloadUser(ctx, auth.user.id), auth.session));
}

/** PATCH /v1/me: displayName, language, country; email needs an account and the current password. */
async function patchMe(ctx: RequestContext): Promise<Reply> {
  const { db, hasher, mailer } = ctx.app;
  const auth = authOf(ctx);
  const user = auth.user;
  const v = new Fields();
  const displayName = readDisplayName(v, ctx.body, 'displayName');
  const language = readLanguage(v, ctx.body, 'language', { nullable: true });
  const country = readCountry(v, ctx.body, 'country', { nullable: true });
  const wantsEmail = hasOwn(ctx.body, 'email');
  if (wantsEmail && user.email === null) throw notAnAccount();
  const email = wantsEmail ? readEmail(v, ctx.body, 'email', { required: true }) : undefined;
  const currentPassword = wantsEmail ? readPassword(v, ctx.body, 'currentPassword', { required: true }) : undefined;
  v.throwIfAny();

  const changesEmail = email !== undefined && email !== user.email;
  if (changesEmail) {
    if (!(await hasher.verify(currentPassword!, user.password_hash ?? ''))) throw invalidCredentials();
    const other = getUserByEmail(db, email);
    if (other && other.id !== user.id) throw emailTaken();
  }
  const now = ctx.now;
  const updated = tx(db, () => {
    const sets: string[] = [];
    const params: Array<string | number | null> = [];
    const set = (column: string, value: string | number | null): void => {
      sets.push(`${column} = ?`);
      params.push(value);
    };
    if (displayName !== undefined) set('display_name', displayName);
    if (language !== undefined) set('language', language);
    if (country !== undefined) set('country', country);
    if (changesEmail) {
      set('email', email);
      set('email_verified_at', null);
    }
    if (sets.length > 0) {
      set('updated_at', now);
      try {
        run(db, `UPDATE users SET ${sets.join(', ')} WHERE id = ?`, ...params, user.id);
      } catch (err) {
        if (isUniqueViolation(err, 'users.email')) throw emailTaken();
        throw err;
      }
    }
    return getUser(db, user.id)!;
  });
  if (changesEmail && user.email) {
    mailer.queue({
      kind: 'email_changed', to: user.email, lang: updated.language,
      vars: { supportEmail: ctx.app.settings()['support.email'], newEmailMasked: maskEmail(email) },
    });
  }
  return json(200, { user: toUser(updated) });
}

/** POST /v1/me/password: deletes the other sessions; the current one stays. */
async function changePassword(ctx: RequestContext): Promise<Reply> {
  const { db, hasher, mailer } = ctx.app;
  const auth = authOf(ctx);
  const user = auth.user;
  const v = new Fields();
  const currentPassword = readPassword(v, ctx.body, 'currentPassword', { required: true });
  const newPassword = readPassword(v, ctx.body, 'newPassword', { required: true });
  v.throwIfAny();
  if (!(await hasher.verify(currentPassword!, user.password_hash ?? ''))) throw invalidCredentials();
  const policy = passwordPolicyError(newPassword!, user.email, { admin: user.role === 'admin' });
  if (policy) throw validationFailed({ newPassword: policy });
  const hash = await hasher.hash(newPassword!);
  const now = ctx.now;
  const revokedSessions = tx(db, () => {
    const u = getUser(db, user.id);
    if (!u || u.password_hash !== user.password_hash) throw invalidCredentials();
    run(db, 'UPDATE users SET password_hash = ?, password_changed_at = ?, updated_at = ? WHERE id = ?', hash, now, now, user.id);
    return deleteUserSessions(db, user.id, { exceptId: auth.session.id });
  });
  mailer.queue({ kind: 'password_changed', to: user.email!, lang: user.language, vars: { supportEmail: ctx.app.settings()['support.email'] } });
  return json(200, { revokedSessions });
}

/** GET /v1/me/export: everything the server stores about the user (access and portability). */
function exportMe(ctx: RequestContext): Reply {
  const { db } = ctx.app;
  const auth = authOf(ctx);
  const user = reloadUser(ctx, auth.user.id);
  const now = ctx.now;
  const body: ExportResponse = {
    exportedAt: iso(now),
    user: toUser(user),
    plan: effectivePlan(db, user, now, ctx.app.planView()),
    entitlements: allEntitlements(db, user.id, now, ctx.app.planOptions),
    devices: devicesOfUser(db, user.id).map((d) => ({
      platform: d.platform, appVersion: d.app_version, osVersion: d.os_version, country: d.country, language: d.language,
      createdAt: iso(d.created_at), lastSeenAt: iso(d.last_seen_at),
    })),
    promoRedemptions: many<{ code: string; redeemed_at: number }>(
      db,
      `SELECT p.code, r.redeemed_at FROM promo_redemptions r JOIN promo_codes p ON p.id = r.promo_code_id
       WHERE r.user_id = ? ORDER BY r.redeemed_at, r.id`,
      user.id,
    ).map((r) => ({ code: r.code, redeemedAt: iso(r.redeemed_at) })),
    sessions: activeSessionsOfUser(db, user.id, now).map((s) => ({
      createdAt: iso(s.created_at), lastUsedAt: iso(s.last_used_at), expiresAt: iso(s.expires_at),
    })),
  };
  return json(200, body, { 'Content-Disposition': `attachment; filename="stopwake-${user.public_id}.json"` });
}

/** DELETE /v1/me (4.10). Accounts confirm with their password; a renewing store subscription needs acknowledgeSubscription. */
async function deleteMe(ctx: RequestContext): Promise<Reply> {
  const { db, hasher, revenuecat, log } = ctx.app;
  const auth = authOf(ctx);
  const user = auth.user;
  const v = new Fields();
  const password = user.email !== null ? readPassword(v, ctx.body, 'password', { required: true }) : undefined;
  const acknowledged = readBool(v, ctx.body, 'acknowledgeSubscription') === true;
  v.throwIfAny();
  if (user.email !== null && !(await hasher.verify(password!, user.password_hash ?? ''))) throw invalidCredentials();
  const now = ctx.now;
  const result = tx(db, () => {
    const sub = renewingStoreSubscription(db, user.id, now);
    if (sub && !acknowledged) {
      const end = sub.expires_at === null ? null : Math.max(sub.expires_at, sub.grace_until ?? 0);
      throw new ApiError(409, 'subscription_active', 'A store subscription is still renewing; cancel it in Google Play', {
        details: { store: sub.store, productId: sub.product_id, expiresAt: isoOrNull(end) },
      });
    }
    const current = getUser(db, user.id);
    if (current?.role === 'admin' && current.status === 'active' && countActiveAdmins(db) <= 1) {
      throw new ApiError(409, 'last_admin', 'The last admin cannot delete the account; make someone else admin first');
    }
    return deleteUser(db, user.id, {
      by: 'self', actor: { id: user.id, label: user.public_id }, now, ip: null, requestId: ctx.requestId,
    });
  });
  if (revenuecat) void deleteSubscribersWithRetry(revenuecat, result.subscriberIds, log);
  return noContent();
}

export const meRoutes: AppRoute[] = [
  route({ method: 'GET', path: '/v1/me', auth: 'session', handler: getMe }),
  route({ method: 'PATCH', path: '/v1/me', auth: 'session', limits: ['account'], handler: patchMe }),
  route({ method: 'POST', path: '/v1/me/password', auth: 'account', limits: ['account'], handler: changePassword }),
  route({ method: 'GET', path: '/v1/me/export', auth: 'session', limits: ['account'], handler: exportMe }),
  route({ method: 'DELETE', path: '/v1/me', auth: 'session', limits: ['account'], handler: deleteMe }),
];
