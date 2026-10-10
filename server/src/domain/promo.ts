/**
 * Promo codes (spec 1.1, 2.8, 2.10, 3.4). Free marketing gifts only: never sold through any
 * channel the app links to (Google Play billing policy); `promo.redeemEnabled` is the kill switch.
 */
import type { PaidPlan, PromoCode } from '../../../src/api/types.ts';
import { DAY, iso, isoOrNull } from '../clock.ts';
import { isUniqueViolation, many, one, run, type Db } from '../db/database.ts';
import { ApiError } from '../http/errors.ts';
import { Fields, hasOwn, readBool, readDescription, readEnum, readInt, readIsoDate, type Body } from '../http/validate.ts';
import { insertGrant, latestGiftEnd, MAX_GRANT_DAYS } from './grants.ts';
import { newPromoCode, normalizePromoCode } from './ids.ts';
import { LIFETIME_UNTIL, recomputePlan, type GrantRow, type PlanOptions } from './plans.ts';
import { adminRef } from './users.ts';

export { normalizePromoCode };

export type PromoRow = {
  id: number;
  code: string;
  plan: PaidPlan;
  duration_days: number | null;
  max_redemptions: number | null;
  redemption_count: number;
  starts_at: number | null;
  expires_at: number | null;
  active: 0 | 1;
  description: string;
  created_by: string | null;
  created_at: number;
  updated_at: number;
};

export type PromoStatus = PromoCode['status'];
export const PROMO_STATUSES: readonly PromoStatus[] = ['active', 'scheduled', 'expired', 'exhausted', 'inactive'];

export const PROMO_CODE_MIN = 4;
export const PROMO_CODE_MAX = 32;
export const PROMO_MAX_REDEMPTIONS = 1_000_000;

export const getPromo = (db: Db, id: number): PromoRow | undefined => one<PromoRow>(db, 'SELECT * FROM promo_codes WHERE id = ?', id);

export const getPromoByCode = (db: Db, code: string): PromoRow | undefined =>
  one<PromoRow>(db, 'SELECT * FROM promo_codes WHERE code = ?', code);

/** Derived in this order: !active → inactive; expired; scheduled; exhausted; otherwise active. */
export function promoStatus(p: PromoRow, now: number): PromoStatus {
  if (p.active !== 1) return 'inactive';
  if (p.expires_at !== null && p.expires_at <= now) return 'expired';
  if (p.starts_at !== null && p.starts_at > now) return 'scheduled';
  if (p.max_redemptions !== null && p.redemption_count >= p.max_redemptions) return 'exhausted';
  return 'active';
}

export function toPromoCode(db: Db, p: PromoRow, now: number): PromoCode {
  return {
    id: p.id,
    code: p.code,
    plan: p.plan,
    durationDays: p.duration_days,
    maxRedemptions: p.max_redemptions,
    redemptionCount: p.redemption_count,
    startsAt: isoOrNull(p.starts_at),
    expiresAt: isoOrNull(p.expires_at),
    active: p.active === 1,
    status: promoStatus(p, now),
    description: p.description,
    createdBy: adminRef(db, p.created_by),
    createdAt: iso(p.created_at),
    updatedAt: iso(p.updated_at),
  };
}

const invalid = (): ApiError => new ApiError(400, 'promo_invalid', 'Unknown or inactive code');

/**
 * Redeems a code for a user (3.4), in one transaction with the caller:
 * look up → already redeemed / already lifetime → count with a guarded UPDATE (exhausted) →
 * grant (promo days stack after the user's active gifts, not after store subscriptions) →
 * redemption row → recompute.
 */
export function redeemPromo(
  db: Db,
  input: { userId: string; rawCode: string; now: number; plan: PlanOptions },
): { grant: GrantRow; promo: PromoRow } {
  const { userId, now } = input;
  const code = normalizePromoCode(input.rawCode);
  if (code.length < PROMO_CODE_MIN || code.length > PROMO_CODE_MAX) throw invalid();
  const promo = getPromoByCode(db, code);
  if (!promo || promo.active !== 1 || (promo.starts_at !== null && promo.starts_at > now)) throw invalid();
  if (promo.expires_at !== null && promo.expires_at <= now) {
    throw new ApiError(400, 'promo_expired', 'This code has expired');
  }
  if (one(db, 'SELECT 1 AS x FROM promo_redemptions WHERE promo_code_id = ? AND user_id = ?', promo.id, userId)) {
    throw new ApiError(409, 'promo_already_redeemed', 'This code was already redeemed on this account');
  }
  const user = one<{ status: string; plan_until: number | null }>(db, 'SELECT status, plan_until FROM users WHERE id = ?', userId);
  if (user?.status === 'active' && user.plan_until !== null && user.plan_until >= LIFETIME_UNTIL) {
    throw new ApiError(409, 'already_lifetime', 'This account already has lifetime Pro');
  }
  const counted = run(
    db,
    `UPDATE promo_codes SET redemption_count = redemption_count + 1, updated_at = ?
     WHERE id = ? AND (max_redemptions IS NULL OR redemption_count < max_redemptions)`,
    now, promo.id,
  ).changes;
  if (counted === 0) throw new ApiError(400, 'promo_exhausted', 'This code has been fully redeemed');

  const endsAt = promo.plan === 'lifetime' ? null : Math.max(now, latestGiftEnd(db, userId, now) ?? now) + promo.duration_days! * DAY;
  const grant = insertGrant(db, {
    userId,
    plan: promo.plan,
    source: 'promo',
    promoCodeId: promo.id,
    endsAt,
    reason: `Promo code ${promo.code}`,
    createdBy: null,
    now,
  });
  run(db, 'INSERT INTO promo_redemptions (promo_code_id, user_id, grant_id, redeemed_at) VALUES (?, ?, ?, ?)', promo.id, userId, grant.id, now);
  recomputePlan(db, userId, now, input.plan);
  return { grant, promo: getPromo(db, promo.id)! };
}

// ---- Admin CRUD helpers (routes in stage 2: /v1/admin/promo-codes) ----

export type PromoInput = {
  code?: string;
  plan?: PaidPlan;
  durationDays?: number | null;
  maxRedemptions?: number | null;
  startsAt?: number | null;
  expiresAt?: number | null;
  description?: string;
  active?: boolean;
};

/**
 * Validates PromoCreateRequest (mode 'create') or PromoUpdateRequest (mode 'update'): a custom
 * code is normalized and must be 4–32 characters; durationDays follows the grant rules (1–3650,
 * required for monthly/yearly, not allowed for lifetime); maxRedemptions 1–1,000,000 or null;
 * description ≤ 200; expiresAt after startsAt. Throws validation_failed.
 */
export function validatePromoInput(body: Body, mode: 'create' | 'update', existing?: PromoRow): PromoInput {
  const v = new Fields();
  const out: PromoInput = {};
  if (mode === 'create' && hasOwn(body, 'code') && body.code !== null) {
    if (typeof body.code !== 'string') v.add('code', 'invalid');
    else {
      const code = normalizePromoCode(body.code);
      if (code.length < PROMO_CODE_MIN) v.add('code', 'too_short');
      else if (code.length > PROMO_CODE_MAX) v.add('code', 'too_long');
      else out.code = code;
    }
  }
  const plan = readEnum(v, body, 'plan', ['monthly', 'yearly', 'lifetime'] as const, { required: mode === 'create' });
  if (plan) out.plan = plan;
  const days = readInt(v, body, 'durationDays', { min: 1, max: MAX_GRANT_DAYS, nullable: true });
  if (days !== undefined) out.durationDays = days;
  const max = readInt(v, body, 'maxRedemptions', { min: 1, max: PROMO_MAX_REDEMPTIONS, nullable: true });
  if (max !== undefined) out.maxRedemptions = max;
  const startsAt = readIsoDate(v, body, 'startsAt', { nullable: true });
  if (startsAt !== undefined) out.startsAt = startsAt;
  const expiresAt = readIsoDate(v, body, 'expiresAt', { nullable: true });
  if (expiresAt !== undefined) out.expiresAt = expiresAt;
  const description = readDescription(v, body);
  if (description !== undefined) out.description = description;
  const active = readBool(v, body, 'active');
  if (active !== undefined) out.active = active;

  // Cross-field rules on the resulting row.
  const finalPlan = out.plan ?? existing?.plan;
  const finalDays = out.durationDays !== undefined ? out.durationDays : (out.plan === undefined ? existing?.duration_days ?? null : null);
  if (finalPlan === 'lifetime' && finalDays !== null && finalDays !== undefined && !v.has('durationDays')) v.add('durationDays', 'not_allowed');
  if (finalPlan && finalPlan !== 'lifetime' && (finalDays === null || finalDays === undefined) && !v.has('durationDays')) {
    // Grant rules: monthly and yearly default to 30 or 365 days.
    out.durationDays = finalPlan === 'monthly' ? 30 : 365;
  }
  const finalStart = out.startsAt !== undefined ? out.startsAt : existing?.starts_at ?? null;
  const finalExpiry = out.expiresAt !== undefined ? out.expiresAt : existing?.expires_at ?? null;
  if (finalStart !== null && finalExpiry !== null && finalExpiry <= finalStart && !v.has('expiresAt')) v.add('expiresAt', 'out_of_range');
  if (existing && out.maxRedemptions !== undefined && out.maxRedemptions !== null && out.maxRedemptions < existing.redemption_count) {
    v.add('maxRedemptions', 'out_of_range');
  }
  v.throwIfAny();
  return out;
}

/** Creates a code; without `code` a XXXX-XXXX-XXXX code is generated. A duplicate gets 409 code_taken. */
export function createPromo(db: Db, input: PromoInput & { plan: PaidPlan }, meta: { by: string | null; now: number }): PromoRow {
  const custom = input.code !== undefined;
  for (let attempt = 0; ; attempt++) {
    const code = input.code ?? newPromoCode();
    try {
      const id = run(
        db,
        `INSERT INTO promo_codes (code, plan, duration_days, max_redemptions, starts_at, expires_at, active, description, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        code, input.plan, input.plan === 'lifetime' ? null : (input.durationDays ?? (input.plan === 'monthly' ? 30 : 365)),
        input.maxRedemptions ?? null, input.startsAt ?? null, input.expiresAt ?? null, input.active === false ? 0 : 1,
        input.description ?? '', meta.by, meta.now, meta.now,
      ).lastInsertRowid;
      return getPromo(db, id)!;
    } catch (err) {
      if (isUniqueViolation(err, 'promo_codes.code')) {
        if (custom) throw new ApiError(409, 'code_taken', 'This code already exists');
        if (attempt < 5) continue;
      }
      throw err;
    }
  }
}

/** Applies a validated update. plan and durationDays cannot change once the code was redeemed (409 promo_in_use). */
export function updatePromo(db: Db, id: number, input: PromoInput, now: number): { before: PromoRow; after: PromoRow } | null {
  const before = getPromo(db, id);
  if (!before) return null;
  const changesPlan = input.plan !== undefined && input.plan !== before.plan;
  const changesDays = input.durationDays !== undefined && input.durationDays !== before.duration_days;
  if (before.redemption_count > 0 && (changesPlan || changesDays)) {
    throw new ApiError(409, 'promo_in_use', 'Plan and duration cannot change after the code was redeemed');
  }
  const plan = input.plan ?? before.plan;
  const days = plan === 'lifetime' ? null : (input.durationDays !== undefined ? input.durationDays : before.duration_days);
  run(
    db,
    `UPDATE promo_codes SET plan = ?, duration_days = ?, max_redemptions = ?, starts_at = ?, expires_at = ?, active = ?, description = ?, updated_at = ?
     WHERE id = ?`,
    plan, days,
    input.maxRedemptions !== undefined ? input.maxRedemptions : before.max_redemptions,
    input.startsAt !== undefined ? input.startsAt : before.starts_at,
    input.expiresAt !== undefined ? input.expiresAt : before.expires_at,
    input.active !== undefined ? (input.active ? 1 : 0) : before.active,
    input.description !== undefined ? input.description : before.description,
    now, id,
  );
  return { before, after: getPromo(db, id)! };
}

/** Deletes an unused code; a redeemed one gets 409 promo_in_use (deactivate it instead). */
export function deletePromo(db: Db, id: number): PromoRow | null {
  const p = getPromo(db, id);
  if (!p) return null;
  if (p.redemption_count > 0) throw new ApiError(409, 'promo_in_use', 'Codes that were redeemed cannot be deleted; deactivate it instead');
  run(db, 'DELETE FROM promo_codes WHERE id = ?', id);
  return p;
}

const STATUS_SQL: Record<PromoStatus, string> = {
  inactive: 'active = 0',
  expired: 'active = 1 AND expires_at IS NOT NULL AND expires_at <= :now',
  scheduled: 'active = 1 AND (expires_at IS NULL OR expires_at > :now) AND starts_at IS NOT NULL AND starts_at > :now',
  exhausted:
    'active = 1 AND (expires_at IS NULL OR expires_at > :now) AND (starts_at IS NULL OR starts_at <= :now) ' +
    'AND max_redemptions IS NOT NULL AND redemption_count >= max_redemptions',
  active:
    'active = 1 AND (expires_at IS NULL OR expires_at > :now) AND (starts_at IS NULL OR starts_at <= :now) ' +
    'AND (max_redemptions IS NULL OR redemption_count < max_redemptions)',
};

/** Offset-paginated list, newest first; `status` 'all' or one derived status; `q` matches the code or description. */
export function listPromos(
  db: Db,
  input: { status: PromoStatus | 'all'; q: string | null; limit: number; offset: number; now: number },
): { items: PromoRow[]; total: number } {
  const where: string[] = [];
  // node:sqlite rejects named parameters that the statement does not use.
  const params: Record<string, string | number> = {};
  if (input.status !== 'all') {
    where.push(`(${STATUS_SQL[input.status]})`);
    if (STATUS_SQL[input.status].includes(':now')) params.now = input.now;
  }
  if (input.q) {
    where.push("(code LIKE :q ESCAPE '\\' OR description LIKE :q ESCAPE '\\')");
    params.q = `%${input.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = one<{ n: number }>(db, `SELECT count(*) AS n FROM promo_codes ${clause}`, params)?.n ?? 0;
  const items = many<PromoRow>(db, `SELECT * FROM promo_codes ${clause} ORDER BY created_at DESC, id DESC LIMIT :limit OFFSET :offset`, {
    ...params,
    limit: input.limit,
    offset: input.offset,
  });
  return { items, total };
}
