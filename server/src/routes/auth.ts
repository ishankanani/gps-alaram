/**
 * Auth endpoints (spec 2.6): guest, sign-up (the guest becomes the account), sign-in (with the
 * guest merge of 3.6), sign-out, sign-out-all, forgot and reset password.
 *
 * Password hashing happens before or after a transaction, never inside it (1.4).
 */
import type { SignInResponse } from '../../../src/api/types.ts';
import type { AppRoute, RequestContext } from '../context.ts';
import { authOf } from '../context.ts';
import { isUniqueViolation, one, run, tx } from '../db/database.ts';
import { writeAudit, SYSTEM_ACTOR } from '../domain/audit.ts';
import { findDeviceByInstallId, upsertDevice } from '../domain/devices.ts';
import { passwordPolicyError } from '../domain/passwords.ts';
import { countResetAttempt, issueResetCode, newestResetToken, resetCodeMatches, RESET_MAX_ATTEMPTS } from '../domain/reset-codes.ts';
import { createSession, deleteDeviceSessions, deleteSession, deleteUserSessions } from '../domain/sessions.ts';
import { createGuest, getUser, getUserByEmail, mergeGuestIntoAccount, type UserRow } from '../domain/users.ts';
import { resolveAuth } from '../http/auth.ts';
import { accountDisabled, ApiError, invalidCredentials, unauthorized, validationFailed } from '../http/errors.ts';
import { json, noContent, type Reply } from '../http/response.ts';
import { route } from '../http/router.ts';
import { Fields, readBool, readDisplayName, readEmail, readPassword, readString } from '../http/validate.ts';
import { authResponse, readInstallId } from './shared.ts';

const emailTaken = (): ApiError => new ApiError(409, 'email_taken', 'An account with this email already exists');
const alreadySignedUp = (): ApiError => new ApiError(409, 'already_signed_up', 'This session already belongs to an account');
const invalidResetCode = (): ApiError => new ApiError(400, 'invalid_reset_code', 'The reset code is wrong, used or expired');

const supportEmail = (ctx: RequestContext): string => ctx.app.settings()['support.email'];

/** POST /v1/auth/guest: reuse the install's active guest (200) or create one (201). */
function guest(ctx: RequestContext): Reply {
  const v = new Fields();
  const installId = readInstallId(v, ctx.body);
  v.throwIfAny();
  const { db, config } = ctx.app;
  const { now, locale } = ctx;
  const client = ctx.client!;
  const result = tx(db, () => {
    const device = findDeviceByInstallId(db, installId);
    const owner = device ? getUser(db, device.user_id) : undefined;
    let user: UserRow;
    let created = false;
    if (device && owner && owner.email === null && owner.status === 'active') {
      user = owner;
      run(db, 'UPDATE users SET last_seen_at = ? WHERE id = ?', now, user.id);
    } else if (device && owner && owner.email === null && owner.status === 'disabled') {
      throw accountDisabled(owner.public_id, supportEmail(ctx));
    } else {
      // No device yet, a device signed in to an account, or a merged user: a new guest.
      user = createGuest(db, { country: locale.country, language: locale.language, now });
      created = true;
    }
    const d = upsertDevice(db, { installId, userId: user.id, client, locale, now });
    // One installation holds one token at a time.
    deleteDeviceSessions(db, d.id);
    const { token, session } = createSession(db, { userId: user.id, deviceId: d.id, method: 'guest', now, days: config.sessionDays });
    return { user: getUser(db, user.id)!, token, session, created };
  });
  ctx.logUser = result.user.public_id;
  return json(result.created ? 201 : 200, authResponse(ctx, result.user, result.session, result.token));
}

/** POST /v1/auth/sign-up (guest): the guest becomes the account; every old token dies. */
async function signUp(ctx: RequestContext): Promise<Reply> {
  const { db, config, hasher } = ctx.app;
  if (!ctx.app.settings()['auth.signUpEnabled']) {
    throw new ApiError(403, 'signup_disabled', 'Creating accounts is switched off at the moment');
  }
  const auth = authOf(ctx);
  const v = new Fields();
  const email = readEmail(v, ctx.body, 'email', { required: true });
  const password = readPassword(v, ctx.body, 'password', { required: true });
  const displayName = readDisplayName(v, ctx.body, 'displayName');
  if (password !== undefined) {
    const err = passwordPolicyError(password, email ?? null);
    if (err) v.add('password', err);
  }
  v.throwIfAny();
  if (getUserByEmail(db, email!)) throw emailTaken();

  const hash = await hasher.hash(password!);
  const now = ctx.now;
  const result = tx(db, () => {
    const u = getUser(db, auth.user.id);
    if (!u || u.status === 'merged') throw unauthorized();
    if (u.status === 'disabled') throw accountDisabled(u.public_id, supportEmail(ctx));
    if (u.email !== null) throw alreadySignedUp();
    if (getUserByEmail(db, email!)) throw emailTaken();
    try {
      run(
        db,
        `UPDATE users SET email = ?, password_hash = ?, password_changed_at = ?, signed_up_at = ?, last_seen_at = ?, updated_at = ?,
           display_name = CASE WHEN ? THEN ? ELSE display_name END
         WHERE id = ?`,
        email!, hash, now, now, now, now, displayName !== undefined ? 1 : 0, displayName ?? null, u.id,
      );
    } catch (err) {
      if (isUniqueViolation(err, 'users.email')) throw emailTaken();
      throw err;
    }
    deleteUserSessions(db, u.id);
    const { token, session } = createSession(db, {
      userId: u.id, deviceId: auth.session.device_id, method: 'sign_up', now, days: config.sessionDays,
    });
    return { user: getUser(db, u.id)!, token, session };
  });
  return json(201, authResponse(ctx, result.user, result.session, result.token));
}

/** POST /v1/auth/sign-in: optional bearer → guest merge (3.6) or re-authentication. */
async function signIn(ctx: RequestContext): Promise<Reply> {
  const { db, config, hasher, limiter } = ctx.app;
  const v = new Fields();
  const email = readEmail(v, ctx.body, 'email', { required: true });
  const password = readPassword(v, ctx.body, 'password', { required: true });
  const installId = readInstallId(v, ctx.body);
  v.throwIfAny();

  // Failure counters are checked before any work and incremented only on failure (4.3).
  const emailIpKey = `${email!}\u0000${ctx.ipKey}`;
  limiter.check('signinFailEmailIp', emailIpKey);
  limiter.check('signinFailEmail', email!);
  const failure = (): ApiError => {
    limiter.record('signinFailEmailIp', emailIpKey);
    limiter.record('signinFailEmail', email!);
    return invalidCredentials();
  };

  const user = one<UserRow>(db, "SELECT * FROM users WHERE email = ? AND status IN ('active', 'disabled')", email!);
  if (!user || !user.password_hash) {
    await hasher.verifyDummy(password!);
    throw failure();
  }
  if (!(await hasher.verify(password!, user.password_hash))) {
    if (user.role === 'admin') {
      tx(db, () =>
        writeAudit(db, {
          at: ctx.now, actor: SYSTEM_ACTOR, action: 'admin.sign_in_failed',
          target: { type: 'user', id: user.id, userId: user.id, label: user.public_id },
          ip: ctx.ip, requestId: ctx.requestId,
        }),
      );
    }
    throw failure();
  }
  if (user.status === 'disabled') throw accountDisabled(user.public_id, supportEmail(ctx));
  const rehash = hasher.needsRehash(user.password_hash) ? await hasher.hash(password!) : null;

  const now = ctx.now;
  const result = tx(db, () => {
    const u = getUser(db, user.id);
    // Changed while the password was being checked.
    if (!u || u.email !== email || u.password_hash === null) throw invalidCredentials();
    if (u.status === 'disabled') throw accountDisabled(u.public_id, supportEmail(ctx));
    if (rehash && u.password_hash === user.password_hash) {
      run(db, 'UPDATE users SET password_hash = ? WHERE id = ?', rehash, u.id);
    }
    const device = upsertDevice(db, { installId, userId: u.id, client: ctx.client!, locale: ctx.locale, now });
    let merged: SignInResponse['merged'] = null;
    const bearer = ctx.token ? resolveAuth(db, ctx.token, now) : null;
    if (bearer) {
      if (bearer.user.id === u.id) {
        // Re-authentication (e.g. after reauth_required): the old session is replaced.
        deleteSession(db, bearer.session.id);
      } else if (bearer.user.email === null && bearer.user.status === 'active') {
        merged = mergeGuestIntoAccount(db, {
          guestId: bearer.user.id, accountId: u.id, now, plan: ctx.app.planOptions, requestId: ctx.requestId,
        });
      }
    }
    deleteDeviceSessions(db, device.id);
    run(db, 'UPDATE users SET last_seen_at = ? WHERE id = ?', now, u.id);
    const { token, session } = createSession(db, { userId: u.id, deviceId: device.id, method: 'sign_in', now, days: config.sessionDays });
    if (u.role === 'admin') {
      writeAudit(db, {
        at: now, actor: { id: u.id, label: u.public_id }, action: 'admin.sign_in',
        target: { type: 'user', id: u.id, userId: u.id, label: u.public_id }, ip: ctx.ip, requestId: ctx.requestId,
      });
    }
    return { user: getUser(db, u.id)!, token, session, merged };
  });
  ctx.logUser = result.user.public_id;
  const body: SignInResponse = { ...authResponse(ctx, result.user, result.session, result.token), merged: result.merged };
  return json(200, body);
}

/** POST /v1/auth/sign-out (a disabled user may call it). */
function signOut(ctx: RequestContext): Reply {
  deleteSession(ctx.app.db, authOf(ctx).session.id);
  return noContent();
}

/** POST /v1/auth/sign-out-all: the other sessions, and the current one too with keepCurrent: false. */
function signOutAll(ctx: RequestContext): Reply {
  const auth = authOf(ctx);
  const v = new Fields();
  const keepCurrent = readBool(v, ctx.body, 'keepCurrent') ?? true;
  v.throwIfAny();
  const revoked = tx(ctx.app.db, () =>
    deleteUserSessions(ctx.app.db, auth.user.id, keepCurrent ? { exceptId: auth.session.id } : {}),
  );
  return json(200, { revoked });
}

/** POST /v1/auth/forgot-password: always 202 (unless mail is off); mails only known active accounts. */
function forgotPassword(ctx: RequestContext): Reply {
  const { db, mailer, limiter } = ctx.app;
  if (mailer.mode === 'off') throw new ApiError(503, 'mail_unavailable', 'Password reset by email is not available');
  const v = new Fields();
  const email = readEmail(v, ctx.body, 'email', { required: true });
  v.throwIfAny();
  limiter.consume('forgotEmail', email!);
  const user = one<UserRow>(db, "SELECT * FROM users WHERE email = ? AND status = 'active'", email!);
  if (user && user.email) {
    const { code } = tx(db, () => issueResetCode(db, { userId: user.id, via: 'email', createdBy: null, now: ctx.now }));
    mailer.queue({ kind: 'reset_code', to: user.email, lang: user.language, vars: { supportEmail: supportEmail(ctx), code, minutes: 30 } });
  }
  return json(202, { ok: true });
}

/** POST /v1/auth/reset-password: one error (invalid_reset_code) for every failure (4.9). */
async function resetPassword(ctx: RequestContext): Promise<Reply> {
  const { db, config, hasher, mailer } = ctx.app;
  const v = new Fields();
  const email = readEmail(v, ctx.body, 'email', { required: true });
  const code = readString(v, ctx.body, 'code', { required: true, max: 100 });
  const newPassword = readPassword(v, ctx.body, 'newPassword', { required: true });
  const installId = readInstallId(v, ctx.body);
  v.throwIfAny();
  const now = ctx.now;

  const user = one<UserRow>(db, "SELECT * FROM users WHERE email = ? AND status IN ('active', 'disabled')", email!);
  const token = user ? newestResetToken(db, user.id, now) : undefined;
  if (!user || !token || token.attempts >= RESET_MAX_ATTEMPTS) {
    resetCodeMatches(null, code!);
    throw invalidResetCode();
  }
  if (!resetCodeMatches(token, code!)) {
    countResetAttempt(db, token.id);
    throw invalidResetCode();
  }
  if (user.status === 'disabled') throw accountDisabled(user.public_id, supportEmail(ctx));
  const policy = passwordPolicyError(newPassword!, user.email, { admin: user.role === 'admin' });
  if (policy) throw validationFailed({ newPassword: policy });

  const hash = await hasher.hash(newPassword!);
  const result = tx(db, () => {
    const t = one<{ used_at: number | null; expires_at: number }>(db, 'SELECT used_at, expires_at FROM password_reset_tokens WHERE id = ?', token.id);
    const u = getUser(db, user.id);
    if (!t || t.used_at !== null || t.expires_at <= now || !u || u.email !== email) throw invalidResetCode();
    if (u.status === 'disabled') throw accountDisabled(u.public_id, supportEmail(ctx));
    run(
      db,
      `UPDATE users SET password_hash = ?, password_changed_at = ?, last_seen_at = ?, updated_at = ?,
         email_verified_at = CASE WHEN ? = 'email' THEN ? ELSE email_verified_at END
       WHERE id = ?`,
      hash, now, now, now, token.via, now, u.id,
    );
    run(db, 'UPDATE password_reset_tokens SET used_at = ? WHERE id = ?', now, token.id);
    deleteUserSessions(db, u.id);
    const device = upsertDevice(db, { installId, userId: u.id, client: ctx.client!, locale: ctx.locale, now });
    deleteDeviceSessions(db, device.id);
    const { token: sessionToken, session } = createSession(db, { userId: u.id, deviceId: device.id, method: 'reset', now, days: config.sessionDays });
    return { user: getUser(db, u.id)!, token: sessionToken, session };
  });
  ctx.logUser = result.user.public_id;
  mailer.queue({ kind: 'password_changed', to: result.user.email!, lang: result.user.language, vars: { supportEmail: supportEmail(ctx) } });
  return json(200, authResponse(ctx, result.user, result.session, result.token));
}

export const authRoutes: AppRoute[] = [
  route({ method: 'POST', path: '/v1/auth/guest', auth: 'none', limits: ['guest'], client: 'required', handler: guest }),
  route({ method: 'POST', path: '/v1/auth/sign-up', auth: 'guest', limits: ['signup'], handler: signUp }),
  route({ method: 'POST', path: '/v1/auth/sign-in', auth: 'none', limits: ['signin'], client: 'required', handler: signIn }),
  route({ method: 'POST', path: '/v1/auth/sign-out', auth: 'session', allowDisabled: true, handler: signOut }),
  route({ method: 'POST', path: '/v1/auth/sign-out-all', auth: 'session', limits: ['account'], handler: signOutAll }),
  route({ method: 'POST', path: '/v1/auth/forgot-password', auth: 'none', limits: ['forgot'], handler: forgotPassword }),
  route({ method: 'POST', path: '/v1/auth/reset-password', auth: 'none', limits: ['reset'], client: 'required', handler: resetPassword }),
];
