/**
 * /v1/admin/users… (spec 2.10, 3.3). Every mutation runs in one transaction together with exactly
 * one audit row; audit details hold ids, plans, dates and reasons, never emails, codes or note bodies.
 */
import type { PaidPlan, PlanId } from '../../../../src/api/types.ts';
import { DAY, isoOrNull } from '../../clock.ts';
import type { AppRoute, RequestContext } from '../../context.ts';
import { authOf } from '../../context.ts';
import { isUniqueViolation, run, tx } from '../../db/database.ts';
import {
  adminUserDetail, listAdminUsers, toAdminUser, USER_PLAN_FILTERS, USER_SORTS, type UserListQuery,
} from '../../domain/admin-users.ts';
import {
  changePlan, extendGrant, insertGrant, MAX_GRANT_AHEAD, MAX_GRANT_DAYS, resolveGrantEnd, revokeGrant, toAdminGrant,
} from '../../domain/grants.ts';
import { normalizePublicId } from '../../domain/ids.ts';
import { effectivePlan, recomputePlan } from '../../domain/plans.ts';
import { issueResetCode } from '../../domain/reset-codes.ts';
import { deleteSubscribersWithRetry } from '../../domain/revenuecat-api.ts';
import { applyFetchedSubscriber, fetchSubscriber } from '../../domain/store.ts';
import { deleteUserSessions } from '../../domain/sessions.ts';
import { countActiveAdmins, deleteUser, getUser, getUserByEmail, type UserRow } from '../../domain/users.ts';
import { ApiError, notFound } from '../../http/errors.ts';
import { json, noContent, type Reply } from '../../http/response.ts';
import { route } from '../../http/router.ts';
import {
  hasOwn, readCountry, readDisplayName, readEmail, readEnum, readInt, readIsoDate, readLanguage, readReason, readString,
} from '../../http/validate.ts';
import {
  audit, Fields, notSelf, pageOf, queryEnum, queryText, requireNotMerged, ROWID_PARAM, targetUser, USER_REF_PARAM, userTarget,
} from './common.ts';

const PAID: readonly PaidPlan[] = ['monthly', 'yearly', 'lifetime'];
const notAnAccount = (): ApiError => new ApiError(409, 'not_an_account', 'This is a guest without an email and password');

const planOf = (ctx: RequestContext, userId: string) =>
  effectivePlan(ctx.app.db, getUser(ctx.app.db, userId)!, ctx.now, ctx.app.planView());

const adminUserOf = (ctx: RequestContext, userId: string) => toAdminUser(ctx.app.db, getUser(ctx.app.db, userId)!, ctx.now);

// ---- Reads ----

function list(ctx: RequestContext): Reply {
  const v = new Fields();
  const q = ctx.query;
  const query: UserListQuery = {
    q: queryText(v, q, 'q', 100),
    plan: queryEnum(v, q, 'plan', USER_PLAN_FILTERS),
    source: queryEnum(v, q, 'source', ['store', 'grant', 'promo'] as const),
    kind: queryEnum(v, q, 'kind', ['guest', 'account'] as const),
    role: queryEnum(v, q, 'role', ['user', 'admin'] as const),
    status: queryEnum(v, q, 'status', ['active', 'disabled', 'merged'] as const),
    country: null,
    sort: queryEnum(v, q, 'sort', USER_SORTS) ?? 'created',
    order: queryEnum(v, q, 'order', ['asc', 'desc'] as const) ?? 'desc',
    ...pageOf(v, q),
  };
  const country = q.get('country');
  if (country) {
    if (/^[A-Za-z]{2}$/.test(country)) query.country = country.toUpperCase();
    else v.add('country', 'invalid');
  }
  v.throwIfAny();
  const { items, total } = listAdminUsers(ctx.app.db, query, ctx.now);
  return json(200, { items, total, limit: query.limit, offset: query.offset });
}

function detail(ctx: RequestContext): Reply {
  const user = targetUser(ctx);
  return json(200, adminUserDetail(ctx.app.db, user, ctx.now, ctx.app.planView()));
}

// ---- Profile ----

/** PATCH: displayName, email (accounts only, unique, clears verification), country, language. */
function update(ctx: RequestContext): Reply {
  const { db } = ctx.app;
  const user = targetUser(ctx);
  requireNotMerged(user);
  const v = new Fields();
  const displayName = readDisplayName(v, ctx.body, 'displayName');
  const email = hasOwn(ctx.body, 'email') ? readEmail(v, ctx.body, 'email', { required: true }) : undefined;
  const country = readCountry(v, ctx.body, 'country', { nullable: true });
  const language = readLanguage(v, ctx.body, 'language', { nullable: true });
  v.throwIfAny();
  if (email !== undefined && user.email === null) throw notAnAccount();
  // Only real changes are written and listed in the audit row (values are never stored there).
  const fields: string[] = [];
  const sets: string[] = [];
  const params: Array<string | number | null> = [];
  const set = (field: string, column: string, value: string | null, current: string | null): void => {
    if (value === current) return;
    fields.push(field);
    sets.push(`${column} = ?`);
    params.push(value);
  };
  if (displayName !== undefined) set('displayName', 'display_name', displayName, user.display_name);
  if (email !== undefined) set('email', 'email', email, user.email);
  if (country !== undefined) set('country', 'country', country, user.country);
  if (language !== undefined) set('language', 'language', language, user.language);
  if (fields.includes('email')) sets.push('email_verified_at = NULL');
  if (fields.length > 0) {
    tx(db, () => {
      if (fields.includes('email')) {
        const other = getUserByEmail(db, email!);
        if (other && other.id !== user.id) throw new ApiError(409, 'email_taken', 'An account with this email already exists');
      }
      try {
        run(db, `UPDATE users SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`, ...params, ctx.now, user.id);
      } catch (err) {
        if (isUniqueViolation(err, 'users.email')) throw new ApiError(409, 'email_taken', 'An account with this email already exists');
        throw err;
      }
      audit(ctx, { action: 'user.update', target: userTarget(user), details: { fields } });
    });
  }
  return json(200, { user: adminUserOf(ctx, user.id) });
}

/** DELETE with { confirm: <public id>, reason } (4.10). */
function remove(ctx: RequestContext): Reply {
  const { db, revenuecat, log } = ctx.app;
  const user = targetUser(ctx);
  const v = new Fields();
  const confirm = readString(v, ctx.body, 'confirm', { required: true, max: 64 });
  const reason = readReason(v, ctx.body);
  v.throwIfAny();
  if (normalizePublicId(confirm!) !== user.public_id) {
    throw new ApiError(400, 'confirm_mismatch', "Type the user's StopWake ID to confirm");
  }
  notSelf(ctx, user);
  const result = tx(db, () => {
    if (user.role === 'admin' && user.status === 'active' && countActiveAdmins(db) <= 1) {
      throw new ApiError(409, 'last_admin', 'The last admin cannot be deleted');
    }
    return deleteUser(db, user.id, {
      by: 'admin', reason, actor: { id: authOf(ctx).user.id, label: authOf(ctx).user.public_id }, now: ctx.now, ip: ctx.ip, requestId: ctx.requestId,
    });
  });
  if (revenuecat) void deleteSubscribersWithRetry(revenuecat, result.subscriberIds, log);
  return noContent();
}

// ---- Plan: grant, revoke, extend, change ----

/** Reads durationDays / endsAt for a paid plan with the grant rules; undefined after a field error. */
function grantEnd(ctx: RequestContext, v: Fields, plan: PaidPlan | null | undefined): number | null | undefined {
  const durationDays = readInt(v, ctx.body, 'durationDays', { min: 1, max: MAX_GRANT_DAYS });
  const endsAt = readIsoDate(v, ctx.body, 'endsAt');
  if (!plan || v.has('durationDays') || v.has('endsAt')) return undefined;
  return resolveGrantEnd(v, plan, { durationDays, endsAt }, ctx.now);
}

/** POST /grants: a new, independent grant from now (it does not stack). */
function grant(ctx: RequestContext): Reply {
  const { db } = ctx.app;
  const user = targetUser(ctx);
  requireNotMerged(user);
  const v = new Fields();
  const plan = readEnum(v, ctx.body, 'plan', PAID, { required: true });
  const endsAt = grantEnd(ctx, v, plan);
  const reason = readReason(v, ctx.body);
  v.throwIfAny();
  const g = tx(db, () => {
    const row = insertGrant(db, { userId: user.id, plan: plan!, source: 'admin', endsAt: endsAt ?? null, reason: reason!, createdBy: authOf(ctx).user.id, now: ctx.now });
    recomputePlan(db, user.id, ctx.now, ctx.app.planOptions);
    audit(ctx, {
      action: 'grant.create',
      target: { type: 'grant', id: row.id, userId: user.id, label: user.public_id },
      details: { grantId: row.id, plan: row.plan, endsAt: isoOrNull(row.ends_at), reason },
    });
    return row;
  });
  return json(201, { grant: toAdminGrant(db, g.id, ctx.now), plan: planOf(ctx, user.id) });
}

/** POST /grants/:grantId/revoke: ends one grant now (an expired one is only a record). */
function revoke(ctx: RequestContext): Reply {
  const { db } = ctx.app;
  const user = targetUser(ctx);
  const v = new Fields();
  const reason = readReason(v, ctx.body);
  v.throwIfAny();
  const grantId = Number(ctx.params.grantId);
  tx(db, () => {
    revokeGrant(db, grantId, { userId: user.id, by: authOf(ctx).user.id, reason: reason!, now: ctx.now, plan: ctx.app.planOptions });
    audit(ctx, {
      action: 'grant.revoke',
      target: { type: 'grant', id: grantId, userId: user.id, label: user.public_id },
      details: { grantId, reason },
    });
  });
  return json(200, { grant: toAdminGrant(db, grantId, ctx.now), plan: planOf(ctx, user.id) });
}

/** POST /extend: pushes the latest active grant (or grantId); creates one when there is none. */
function extend(ctx: RequestContext): Reply {
  const { db } = ctx.app;
  const user = targetUser(ctx);
  requireNotMerged(user);
  const v = new Fields();
  const days = readInt(v, ctx.body, 'days', { min: 1, max: MAX_GRANT_DAYS });
  const endsAt = readIsoDate(v, ctx.body, 'endsAt');
  const grantId = readInt(v, ctx.body, 'grantId', { min: 1, max: Number.MAX_SAFE_INTEGER });
  const plan = readEnum(v, ctx.body, 'plan', ['monthly', 'yearly'] as const);
  const reason = readReason(v, ctx.body);
  if (!v.has('days') && !v.has('endsAt')) {
    if (days !== undefined && endsAt !== undefined) v.add('endsAt', 'not_allowed');
    else if (days === undefined && endsAt === undefined) v.add('days', 'required');
    else if (endsAt !== undefined && endsAt !== null) {
      if (endsAt <= ctx.now) v.add('endsAt', 'in_past');
      else if (endsAt > ctx.now + MAX_GRANT_AHEAD + MAX_GRANT_DAYS * DAY) v.add('endsAt', 'out_of_range');
    }
  }
  v.throwIfAny();
  const result = tx(db, () => {
    const r = extendGrant(db, {
      userId: user.id,
      days: days ?? undefined,
      endsAt: endsAt ?? undefined,
      grantId: grantId ?? undefined,
      plan: plan ?? undefined,
      reason: reason!,
      by: authOf(ctx).user.id,
      now: ctx.now,
      planOptions: ctx.app.planOptions,
    });
    if (r.created && r.after !== null && r.after > ctx.now + MAX_GRANT_AHEAD) {
      throw new ApiError(400, 'validation_failed', 'A new grant ends at most 10 years from now', { fields: { endsAt: 'out_of_range' } });
    }
    const target = { type: 'grant' as const, id: r.grant.id, userId: user.id, label: user.public_id };
    if (r.created) {
      audit(ctx, {
        action: 'grant.create', target,
        details: { grantId: r.grant.id, plan: r.grant.plan, endsAt: isoOrNull(r.grant.ends_at), reason, via: 'extend' },
      });
    } else {
      audit(ctx, { action: 'grant.extend', target, details: { grantId: r.grant.id, before: isoOrNull(r.before), after: isoOrNull(r.after), reason } });
    }
    return r;
  });
  return json(200, { grant: toAdminGrant(db, result.grant.id, ctx.now), plan: planOf(ctx, user.id) });
}

/** POST /plan: revokes every active grant, then (unless free) adds one; store subscriptions stay. */
function changeUserPlan(ctx: RequestContext): Reply {
  const { db } = ctx.app;
  const user = targetUser(ctx);
  requireNotMerged(user);
  const v = new Fields();
  const plan = readEnum<PlanId>(v, ctx.body, 'plan', ['free', 'monthly', 'yearly', 'lifetime'], { required: true });
  let endsAt: number | null | undefined = null;
  if (plan === 'free') {
    if (hasOwn(ctx.body, 'durationDays')) v.add('durationDays', 'not_allowed');
    if (hasOwn(ctx.body, 'endsAt')) v.add('endsAt', 'not_allowed');
  } else {
    endsAt = grantEnd(ctx, v, plan);
  }
  const reason = readReason(v, ctx.body);
  v.throwIfAny();
  const result = tx(db, () => {
    const r = changePlan(db, {
      userId: user.id, plan: plan!, endsAt: endsAt ?? null, reason: reason!, by: authOf(ctx).user.id, now: ctx.now, planOptions: ctx.app.planOptions,
    });
    audit(ctx, {
      action: 'plan.change',
      target: userTarget(user),
      details: {
        to: plan, endsAt: isoOrNull(r.grant?.ends_at ?? null), revokedGrantIds: r.revokedGrantIds, newGrantId: r.grant?.id ?? null,
        reason, warnings: r.warnings,
      },
    });
    return r;
  });
  return json(200, {
    plan: planOf(ctx, user.id),
    revokedGrantIds: result.revokedGrantIds,
    grant: result.grant ? toAdminGrant(db, result.grant.id, ctx.now) : null,
    warnings: result.warnings,
  });
}

// ---- Account state ----

/** POST /role: guests cannot become admins; the last admin cannot be demoted. */
function setRole(ctx: RequestContext): Reply {
  const { db } = ctx.app;
  const user = targetUser(ctx);
  const v = new Fields();
  const role = readEnum(v, ctx.body, 'role', ['user', 'admin'] as const, { required: true });
  v.throwIfAny();
  if (user.email === null) throw notAnAccount();
  tx(db, () => {
    const current = getUser(db, user.id)!;
    if (current.role === 'admin' && role === 'user' && current.status === 'active' && countActiveAdmins(db) <= 1) {
      throw new ApiError(409, 'last_admin', 'This is the only admin; make someone else admin first');
    }
    run(db, 'UPDATE users SET role = ?, updated_at = ? WHERE id = ?', role!, ctx.now, user.id);
    audit(ctx, { action: 'user.role', target: userTarget(user), details: { before: current.role, after: role } });
  });
  return json(200, { user: adminUserOf(ctx, user.id) });
}

/** POST /disable: sessions are kept but every request on them answers 403 account_disabled. */
function disable(ctx: RequestContext): Reply {
  const { db } = ctx.app;
  const user = targetUser(ctx);
  const v = new Fields();
  const reason = readReason(v, ctx.body);
  v.throwIfAny();
  notSelf(ctx, user);
  requireNotMerged(user);
  tx(db, () => {
    run(
      db,
      "UPDATE users SET status = 'disabled', disabled_at = coalesce(disabled_at, ?), disabled_reason = ?, updated_at = ? WHERE id = ?",
      ctx.now, reason!, ctx.now, user.id,
    );
    recomputePlan(db, user.id, ctx.now, ctx.app.planOptions);
    audit(ctx, { action: 'user.disable', target: userTarget(user), details: { reason } });
  });
  return json(200, { user: adminUserOf(ctx, user.id) });
}

/** POST /enable: clears the disabled fields; entitlements come back. */
function enable(ctx: RequestContext): Reply {
  const { db } = ctx.app;
  const user = targetUser(ctx);
  requireNotMerged(user);
  tx(db, () => {
    run(db, "UPDATE users SET status = 'active', disabled_at = NULL, disabled_reason = NULL, updated_at = ? WHERE id = ?", ctx.now, user.id);
    recomputePlan(db, user.id, ctx.now, ctx.app.planOptions);
    audit(ctx, { action: 'user.enable', target: userTarget(user), details: {} });
  });
  return json(200, { user: adminUserOf(ctx, user.id) });
}

function signOutAll(ctx: RequestContext): Reply {
  const user = targetUser(ctx);
  const revoked = tx(ctx.app.db, () => {
    const n = deleteUserSessions(ctx.app.db, user.id);
    audit(ctx, { action: 'user.sign_out_all', target: userTarget(user), details: { revoked: n } });
    return n;
  });
  return json(200, { revoked });
}

/** POST /reset-code: shown to the admin once; never logged or audited. */
function resetCode(ctx: RequestContext): Reply {
  const user = targetUser(ctx);
  if (user.email === null) throw notAnAccount();
  const { code, expiresAt } = tx(ctx.app.db, () => {
    const r = issueResetCode(ctx.app.db, { userId: user.id, via: 'admin', createdBy: authOf(ctx).user.id, now: ctx.now });
    audit(ctx, { action: 'user.reset_code', target: userTarget(user), details: { expiresAt: isoOrNull(r.expiresAt) } });
    return r;
  });
  return json(201, { code, expiresAt: isoOrNull(expiresAt) });
}

/** POST /sync: the same reconciliation as /v1/plan/sync, for this user. */
async function sync(ctx: RequestContext): Promise<Reply> {
  const user = targetUser(ctx);
  requireNotMerged(user);
  if (!ctx.app.revenuecat) throw new ApiError(503, 'not_configured', 'REVENUECAT_API_KEY is not set');
  const response = await fetchSubscriber(ctx.app, user.id);
  const synced = tx(ctx.app.db, () => {
    if (!getUser(ctx.app.db, user.id)) throw notFound();
    if (response !== null) applyFetchedSubscriber(ctx.app, user.id, response);
    audit(ctx, { action: 'user.sync', target: userTarget(user), details: { synced: response !== null } });
    return response !== null;
  });
  return json(200, { plan: planOf(ctx, user.id), synced });
}

const P = { id: USER_REF_PARAM };

export const adminUserRoutes: AppRoute[] = [
  route({ method: 'GET', path: '/v1/admin/users', auth: 'admin', handler: list }),
  route({ method: 'GET', path: '/v1/admin/users/:id', auth: 'admin', params: P, handler: detail }),
  route({ method: 'PATCH', path: '/v1/admin/users/:id', auth: 'admin', params: P, handler: update }),
  route({ method: 'DELETE', path: '/v1/admin/users/:id', auth: 'admin', params: P, handler: remove }),
  route({ method: 'POST', path: '/v1/admin/users/:id/grants', auth: 'admin', params: P, handler: grant }),
  route({
    method: 'POST', path: '/v1/admin/users/:id/grants/:grantId/revoke', auth: 'admin', params: { ...P, grantId: ROWID_PARAM }, handler: revoke,
  }),
  route({ method: 'POST', path: '/v1/admin/users/:id/extend', auth: 'admin', params: P, handler: extend }),
  route({ method: 'POST', path: '/v1/admin/users/:id/plan', auth: 'admin', params: P, handler: changeUserPlan }),
  route({ method: 'POST', path: '/v1/admin/users/:id/role', auth: 'admin', params: P, handler: setRole }),
  route({ method: 'POST', path: '/v1/admin/users/:id/disable', auth: 'admin', params: P, handler: disable }),
  route({ method: 'POST', path: '/v1/admin/users/:id/enable', auth: 'admin', params: P, handler: enable }),
  route({ method: 'POST', path: '/v1/admin/users/:id/sign-out-all', auth: 'admin', params: P, handler: signOutAll }),
  route({ method: 'POST', path: '/v1/admin/users/:id/reset-code', auth: 'admin', params: P, handler: resetCode }),
  route({ method: 'POST', path: '/v1/admin/users/:id/sync', auth: 'admin', params: P, handler: sync }),
];

