/**
 * Grants: free Pro given by an admin or a promo code (spec 1.2, 2.10, 3.3).
 *
 * Grants always start "now" (no future-dated grants), which keeps the plan columns valid as time
 * passes (1.3). These functions change rows and recompute the plan; they run inside the caller's
 * transaction, and the admin routes add exactly one audit row per mutation (4.6).
 */
import type { PaidPlan, PlanId, Warning } from '../../../src/api/types.ts';
import { DAY, HOUR } from '../clock.ts';
import { many, one, run, type Db } from '../db/database.ts';
import { ApiError, notFound } from '../http/errors.ts';
import type { Fields } from '../http/validate.ts';
import { recomputePlan, storeCandidate, type GrantRow, type PlanOptions, type StoreSubscriptionRow } from './plans.ts';

export const DEFAULT_GRANT_DAYS: Record<'monthly' | 'yearly', number> = { monthly: 30, yearly: 365 };
export const MAX_GRANT_DAYS = 3650;
/** endsAt must lie after now + 1 h … */
export const MIN_GRANT_LEAD = HOUR;
/** … and at most 10 years ahead. */
export const MAX_GRANT_AHEAD = 3653 * DAY;

export const getGrant = (db: Db, id: number): GrantRow | undefined => one<GrantRow>(db, 'SELECT * FROM grants WHERE id = ?', id);

/**
 * Duration rules for admin grants and plan changes: lifetime takes neither `durationDays` nor
 * `endsAt`; monthly and yearly take at most one of them, defaulting to 30 or 365 days.
 * Returns ends_at (null for lifetime), or undefined after recording a field error.
 */
export function resolveGrantEnd(
  v: Fields,
  plan: PaidPlan,
  input: { durationDays?: number | null; endsAt?: number | null },
  now: number,
): number | null | undefined {
  const hasDays = input.durationDays !== undefined && input.durationDays !== null;
  const hasEnd = input.endsAt !== undefined && input.endsAt !== null;
  if (plan === 'lifetime') {
    if (hasDays) v.add('durationDays', 'not_allowed');
    if (hasEnd) v.add('endsAt', 'not_allowed');
    return hasDays || hasEnd ? undefined : null;
  }
  if (hasDays && hasEnd) {
    v.add('endsAt', 'not_allowed');
    return undefined;
  }
  if (hasEnd) {
    const endsAt = input.endsAt!;
    if (endsAt <= now) v.add('endsAt', 'in_past');
    else if (endsAt <= now + MIN_GRANT_LEAD || endsAt > now + MAX_GRANT_AHEAD) v.add('endsAt', 'out_of_range');
    return v.has('endsAt') ? undefined : endsAt;
  }
  const days = hasDays ? input.durationDays! : DEFAULT_GRANT_DAYS[plan];
  return now + days * DAY;
}

export function insertGrant(
  db: Db,
  input: {
    userId: string;
    plan: PaidPlan;
    source: 'admin' | 'promo';
    promoCodeId?: number | null;
    endsAt: number | null;
    reason: string;
    createdBy: string | null;
    now: number;
  },
): GrantRow {
  const id = run(
    db,
    `INSERT INTO grants (user_id, plan, source, promo_code_id, starts_at, ends_at, reason, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    input.userId, input.plan, input.source, input.promoCodeId ?? null, input.now,
    input.plan === 'lifetime' ? null : input.endsAt, input.reason, input.createdBy, input.now, input.now,
  ).lastInsertRowid;
  return getGrant(db, id)!;
}

/** Active (counting) grants of a user. */
export const activeGrants = (db: Db, userId: string, now: number): GrantRow[] =>
  many<GrantRow>(
    db,
    'SELECT * FROM grants WHERE user_id = ? AND revoked_at IS NULL AND starts_at <= ? AND (ends_at IS NULL OR ends_at > ?) ORDER BY id',
    userId, now, now,
  );

/** The latest end among the user's active non-lifetime grants (promo days stack after it, 3.4). */
export function latestGiftEnd(db: Db, userId: string, now: number): number | null {
  const r = one<{ end: number | null }>(
    db,
    'SELECT max(ends_at) AS end FROM grants WHERE user_id = ? AND revoked_at IS NULL AND starts_at <= ? AND ends_at > ?',
    userId, now, now,
  );
  return r?.end ?? null;
}

/** Ends one grant now. Revoking an expired grant is allowed (it is only a record). */
export function revokeGrant(
  db: Db,
  grantId: number,
  input: { userId: string; by: string | null; reason: string; now: number; plan: PlanOptions },
): GrantRow {
  const g = getGrant(db, grantId);
  if (!g || g.user_id !== input.userId) throw notFound();
  if (g.revoked_at !== null) throw new ApiError(409, 'already_revoked', 'This grant is already revoked');
  run(
    db,
    'UPDATE grants SET revoked_at = ?, revoked_by = ?, revoke_reason = ?, updated_at = ? WHERE id = ?',
    input.now, input.by, input.reason, input.now, grantId,
  );
  recomputePlan(db, input.userId, input.now, input.plan);
  return getGrant(db, grantId)!;
}

export type ExtendResult = { grant: GrantRow; created: boolean; before: number | null; after: number | null };

/**
 * Extend (2.10, 3.3): pushes the end of `grantId` or of the active non-lifetime grant with the
 * latest end; it stacks on that grant. Without a grant it creates one from now.
 * `days` → max(ends_at, now) + days; `endsAt` may shorten a grant, but never below now + 1 h.
 */
export function extendGrant(
  db: Db,
  input: {
    userId: string;
    days?: number;
    endsAt?: number;
    grantId?: number;
    plan?: 'monthly' | 'yearly';
    reason: string;
    by: string | null;
    now: number;
    planOptions: PlanOptions;
  },
): ExtendResult {
  const { userId, now } = input;
  let target: GrantRow | undefined;
  if (input.grantId !== undefined) {
    target = getGrant(db, input.grantId);
    if (!target || target.user_id !== userId) throw notFound();
    if (target.revoked_at !== null) throw new ApiError(409, 'already_revoked', 'This grant is revoked');
    if (target.ends_at === null) throw new ApiError(409, 'already_lifetime', 'A lifetime grant cannot be extended');
  } else {
    const active = activeGrants(db, userId, now);
    target = active.filter((g) => g.ends_at !== null).sort((a, b) => b.ends_at! - a.ends_at! || b.id - a.id)[0];
    // Adding days next to an active lifetime grant would only create a confusing record.
    if (!target && active.some((g) => g.ends_at === null)) {
      throw new ApiError(409, 'already_lifetime', 'The user already has a lifetime grant');
    }
  }
  const newEnd = (base: number): number => (input.days !== undefined ? Math.max(base, now) + input.days * DAY : input.endsAt!);
  if (target) {
    const after = newEnd(target.ends_at!);
    if (after <= now + MIN_GRANT_LEAD || after > now + MAX_GRANT_AHEAD + MAX_GRANT_DAYS * DAY) {
      throw new ApiError(400, 'validation_failed', 'The new end must be at least an hour from now', {
        fields: { [input.days !== undefined ? 'days' : 'endsAt']: 'out_of_range' },
      });
    }
    run(db, 'UPDATE grants SET ends_at = ?, updated_at = ? WHERE id = ?', after, now, target.id);
    recomputePlan(db, userId, now, input.planOptions);
    return { grant: getGrant(db, target.id)!, created: false, before: target.ends_at, after };
  }
  const end = newEnd(now);
  if (end <= now + MIN_GRANT_LEAD) {
    throw new ApiError(400, 'validation_failed', 'The end must be at least an hour from now', { fields: { endsAt: 'out_of_range' } });
  }
  const plan = input.plan ?? (input.days !== undefined && input.days >= 365 ? 'yearly' : 'monthly');
  const grant = insertGrant(db, { userId, plan, source: 'admin', endsAt: end, reason: input.reason, createdBy: input.by, now });
  recomputePlan(db, userId, now, input.planOptions);
  return { grant, created: true, before: null, after: end };
}

export type ChangePlanResult = { revokedGrantIds: number[]; grant: GrantRow | null; warnings: Warning[] };

/**
 * Change plan (3.3): revokes every active grant (admin and promo), then, unless `free`, adds one
 * new admin grant from now. Store subscriptions are never touched; a still-active one is reported
 * as the `store_subscription_active` warning (the effective plan may stay Pro).
 */
export function changePlan(
  db: Db,
  input: { userId: string; plan: PlanId; endsAt: number | null; reason: string; by: string | null; now: number; planOptions: PlanOptions },
): ChangePlanResult {
  const { userId, now } = input;
  const revokedGrantIds: number[] = [];
  for (const g of activeGrants(db, userId, now)) {
    run(
      db,
      'UPDATE grants SET revoked_at = ?, revoked_by = ?, revoke_reason = ?, updated_at = ? WHERE id = ?',
      now, input.by, `Replaced by plan change: ${input.reason}`.slice(0, 500), now, g.id,
    );
    revokedGrantIds.push(g.id);
  }
  const grant =
    input.plan === 'free'
      ? null
      : insertGrant(db, { userId, plan: input.plan, source: 'admin', endsAt: input.endsAt, reason: input.reason, createdBy: input.by, now });
  recomputePlan(db, userId, now, input.planOptions);
  const subs = many<StoreSubscriptionRow>(db, 'SELECT * FROM store_subscriptions WHERE user_id = ?', userId);
  const warnings: Warning[] = subs.some((s) => storeCandidate(s, now, input.planOptions)) ? ['store_subscription_active'] : [];
  return { revokedGrantIds, grant, warnings };
}
