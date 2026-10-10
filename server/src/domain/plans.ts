/**
 * Effective plan rules (spec 3).
 *
 * computePlan() is pure: the best entitlement is the one that keeps the user Pro the longest
 * (latest end; then plan rank lifetime > yearly > monthly; then source rank store > grant > promo;
 * then ref). Because the chosen entitlement always ends last, the denormalized users.plan_* columns
 * stay valid as time passes: isPro(t) = status = 'active' AND plan_until > t (1.3).
 *
 * recomputePlan() writes those columns and runs inside the same transaction as every change to
 * grants, store_subscriptions, a merge, or a user's status (disabled and merged users are free).
 */
import type {
  EffectivePlan, Entitlement, EntitlementStatus, PaidPlan, PlanId, PlanResponse, PlanSource, StoreId,
} from '../../../src/api/types.ts';
import { DAY, HOUR, iso, isoOrNull } from '../clock.ts';
import { many, one, run, type Db } from '../db/database.ts';

/** 9999-12-31T23:59:59.999Z: users.plan_until for a lifetime plan. */
export const LIFETIME_UNTIL = 253402300799999;

export type UserStatus = 'active' | 'disabled' | 'merged';

export type GrantRow = {
  id: number;
  user_id: string;
  plan: PaidPlan;
  source: 'admin' | 'promo';
  promo_code_id: number | null;
  starts_at: number;
  ends_at: number | null;
  reason: string;
  created_by: string | null;
  created_at: number;
  updated_at: number;
  revoked_at: number | null;
  revoked_by: string | null;
  revoke_reason: string | null;
};

export type StoreStatus = 'trialing' | 'active' | 'grace_period' | 'billing_issue' | 'paused' | 'expired' | 'refunded';

export type StoreSubscriptionRow = {
  id: number;
  user_id: string;
  store: StoreId;
  environment: 'production' | 'sandbox';
  product_id: string;
  plan: PaidPlan;
  original_transaction_id: string;
  rc_app_user_id: string;
  status: StoreStatus;
  period_type: string | null;
  will_renew: 0 | 1;
  purchased_at: number;
  expires_at: number | null;
  grace_until: number | null;
  cancel_reason: string | null;
  country: string | null;
  currency: string | null;
  price_local: number | null;
  price_usd: number | null;
  last_event_id: string | null;
  last_event_type: string | null;
  last_event_at: number;
  created_at: number;
  updated_at: number;
};

/** STORE_SANDBOX_GRANTS_PRO: sandbox (tester) purchases give Pro. */
export type PlanOptions = { sandboxGrantsPro: boolean };

export type Candidate = {
  ref: string;
  source: PlanSource;
  plan: PaidPlan;
  /** Infinity for lifetime. */
  end: number;
  willRenew: boolean;
  trial: boolean;
  status: EntitlementStatus;
};

export type ComputedPlan = {
  plan: PlanId;
  source: PlanSource | null;
  /** LIFETIME_UNTIL for lifetime; null when free. */
  until: number | null;
  willRenew: boolean;
  trial: boolean;
  ref: string | null;
};

export const FREE_PLAN: ComputedPlan = Object.freeze({ plan: 'free', source: null, until: null, willRenew: false, trial: false, ref: null });

const PLAN_RANK: Record<PaidPlan, number> = { lifetime: 3, yearly: 2, monthly: 1 };
const SOURCE_RANK: Record<PlanSource, number> = { store: 3, grant: 2, promo: 1 };
const RENEWING = new Set<StoreStatus>(['active', 'trialing', 'grace_period']);

export const grantSource = (g: Pick<GrantRow, 'source'>): PlanSource => (g.source === 'admin' ? 'grant' : 'promo');

/** A grant counts while revoked_at IS NULL AND starts_at ≤ now AND (ends_at IS NULL OR ends_at > now). */
export function grantCandidate(g: GrantRow, now: number): Candidate | null {
  if (g.revoked_at !== null || g.starts_at > now) return null;
  if (g.ends_at !== null && g.ends_at <= now) return null;
  return {
    ref: `grant:${g.id}`,
    source: grantSource(g),
    plan: g.plan,
    end: g.ends_at ?? Infinity,
    willRenew: false,
    trial: false,
    status: 'active',
  };
}

/** End of a store subscription's access: ∞ when expires_at is NULL, else max(expires_at, grace_until ?? 0). */
export const storeEnd = (s: Pick<StoreSubscriptionRow, 'expires_at' | 'grace_until'>): number =>
  s.expires_at === null ? Infinity : Math.max(s.expires_at, s.grace_until ?? 0);

/** A store subscription counts while its status is not expired/refunded, its end is in the future, and it is production (or sandbox grants Pro). */
export function storeCandidate(s: StoreSubscriptionRow, now: number, opts: PlanOptions): Candidate | null {
  if (s.status === 'expired' || s.status === 'refunded') return null;
  if (s.environment !== 'production' && !opts.sandboxGrantsPro) return null;
  const end = storeEnd(s);
  if (end <= now) return null;
  return {
    ref: `store:${s.id}`,
    source: 'store',
    plan: s.plan,
    end,
    willRenew: s.will_renew === 1 && RENEWING.has(s.status),
    trial: s.status === 'trialing',
    status: s.status,
  };
}

/** Negative when a is the better candidate. */
export function compareCandidates(a: Candidate, b: Candidate): number {
  if (a.end !== b.end) return a.end > b.end ? -1 : 1;
  if (PLAN_RANK[a.plan] !== PLAN_RANK[b.plan]) return PLAN_RANK[b.plan] - PLAN_RANK[a.plan];
  if (SOURCE_RANK[a.source] !== SOURCE_RANK[b.source]) return SOURCE_RANK[b.source] - SOURCE_RANK[a.source];
  return a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0;
}

export function candidatesFor(
  grants: readonly GrantRow[],
  subs: readonly StoreSubscriptionRow[],
  now: number,
  opts: PlanOptions,
): Candidate[] {
  const list: Candidate[] = [];
  for (const g of grants) {
    const c = grantCandidate(g, now);
    if (c) list.push(c);
  }
  for (const s of subs) {
    const c = storeCandidate(s, now, opts);
    if (c) list.push(c);
  }
  return list.sort(compareCandidates);
}

/** Pure (3.2). Disabled and merged users are never Pro. */
export function computePlan(
  user: { status: UserStatus },
  grants: readonly GrantRow[],
  subs: readonly StoreSubscriptionRow[],
  now: number,
  opts: PlanOptions,
): ComputedPlan {
  if (user.status !== 'active') return FREE_PLAN;
  const best = candidatesFor(grants, subs, now, opts)[0];
  if (!best) return FREE_PLAN;
  return {
    plan: best.plan,
    source: best.source,
    until: Math.min(best.end, LIFETIME_UNTIL),
    willRenew: best.willRenew,
    trial: best.trial,
    ref: best.ref,
  };
}

type PlanColumns = {
  status: UserStatus;
  plan: PlanId;
  plan_source: PlanSource | null;
  plan_until: number | null;
  plan_will_renew: 0 | 1;
  plan_trial: 0 | 1;
  plan_ref: string | null;
};

/** Recomputes and stores users.plan_* (call inside the transaction that changed the inputs). */
export function recomputePlan(db: Db, userId: string, now: number, opts: PlanOptions): ComputedPlan {
  const user = one<PlanColumns>(
    db,
    'SELECT status, plan, plan_source, plan_until, plan_will_renew, plan_trial, plan_ref FROM users WHERE id = ?',
    userId,
  );
  if (!user) return FREE_PLAN;
  const grants = many<GrantRow>(db, 'SELECT * FROM grants WHERE user_id = ? AND revoked_at IS NULL', userId);
  const subs = many<StoreSubscriptionRow>(db, 'SELECT * FROM store_subscriptions WHERE user_id = ?', userId);
  const p = computePlan(user, grants, subs, now, opts);
  const changed =
    user.plan !== p.plan || user.plan_source !== p.source || user.plan_until !== p.until ||
    user.plan_will_renew !== (p.willRenew ? 1 : 0) || user.plan_trial !== (p.trial ? 1 : 0) || user.plan_ref !== p.ref;
  if (changed) {
    run(
      db,
      `UPDATE users SET plan = ?, plan_source = ?, plan_until = ?, plan_will_renew = ?, plan_trial = ?, plan_ref = ?, updated_at = ?
       WHERE id = ?`,
      p.plan, p.source, p.until, p.willRenew ? 1 : 0, p.trial ? 1 : 0, p.ref, now, userId,
    );
  }
  return p;
}

/** isPro(t) = status = 'active' AND plan_until > t. */
export const isProAt = (user: Pick<PlanColumns, 'status' | 'plan_until'>, now: number): boolean =>
  user.status === 'active' && user.plan_until !== null && user.plan_until > now;

/**
 * 3.7: free → checkedAt. Pro → min(checkedAt + cacheDays, end + 72 h when a renewing store
 * subscription is active or trialing). A lifetime end counts as unbounded, so the cap applies.
 */
export function computeCacheUntil(
  p: { isPro: boolean; source: PlanSource | null; status: EntitlementStatus | null; willRenew: boolean; end: number },
  checkedAt: number,
  cacheDays: number,
): number {
  if (!p.isPro) return checkedAt;
  const cap = checkedAt + cacheDays * DAY;
  if (!Number.isFinite(p.end) || p.end >= LIFETIME_UNTIL) return cap;
  const slack = p.willRenew && p.source === 'store' && (p.status === 'active' || p.status === 'trialing') ? 72 * HOUR : 0;
  return Math.min(cap, p.end + slack);
}

type GrantWithCode = GrantRow & { promo_code: string | null };

const GRANT_WITH_CODE = `SELECT g.*, p.code AS promo_code FROM grants g LEFT JOIN promo_codes p ON p.id = g.promo_code_id`;

export const getGrantWithCode = (db: Db, id: number): GrantWithCode | undefined =>
  one<GrantWithCode>(db, `${GRANT_WITH_CODE} WHERE g.id = ?`, id);

/** active | expired | revoked, for any grant (admin views, export). */
export function grantStatus(g: Pick<GrantRow, 'revoked_at' | 'ends_at'>, now: number): 'active' | 'expired' | 'revoked' {
  if (g.revoked_at !== null) return 'revoked';
  if (g.ends_at !== null && g.ends_at <= now) return 'expired';
  return 'active';
}

export function grantEntitlement(g: GrantWithCode, now: number): Entitlement {
  return {
    id: `grant:${g.id}`,
    source: grantSource(g),
    plan: g.plan,
    status: grantStatus(g, now),
    startsAt: iso(g.starts_at),
    endsAt: isoOrNull(g.ends_at),
    willRenew: false,
    promoCode: g.promo_code,
    store: null,
    productId: null,
  };
}

/** Status for display: a subscription whose access ended without an EXPIRATION event shows as expired. */
function storeDisplayStatus(s: StoreSubscriptionRow, now: number): EntitlementStatus {
  if (s.status === 'expired' || s.status === 'refunded') return s.status;
  return storeEnd(s) <= now ? 'expired' : s.status;
}

export function storeEntitlement(s: StoreSubscriptionRow, now: number): Entitlement {
  const end = storeEnd(s);
  return {
    id: `store:${s.id}`,
    source: 'store',
    plan: s.plan,
    status: storeDisplayStatus(s, now),
    startsAt: iso(s.purchased_at),
    endsAt: Number.isFinite(end) ? iso(end) : null,
    willRenew: s.will_renew === 1 && RENEWING.has(s.status),
    promoCode: null,
    store: s.store,
    productId: s.product_id,
  };
}

type Ranked = { c: Candidate; e: Entitlement };

function rankedEntitlements(db: Db, userId: string, now: number, opts: PlanOptions, counting: boolean): Ranked[] {
  const grants = many<GrantWithCode>(db, `${GRANT_WITH_CODE} WHERE g.user_id = ?${counting ? ' AND g.revoked_at IS NULL' : ''}`, userId);
  const subs = many<StoreSubscriptionRow>(db, 'SELECT * FROM store_subscriptions WHERE user_id = ?', userId);
  const out: Ranked[] = [];
  for (const g of grants) {
    const c = grantCandidate(g, now) ?? (counting ? null : { ...pseudo(`grant:${g.id}`, g.plan, g.ends_at ?? Infinity), source: grantSource(g) });
    if (c) out.push({ c, e: grantEntitlement(g, now) });
  }
  for (const s of subs) {
    const c = storeCandidate(s, now, opts) ?? (counting ? null : { ...pseudo(`store:${s.id}`, s.plan, storeEnd(s)), source: 'store' as const });
    if (c) out.push({ c, e: storeEntitlement(s, now) });
  }
  return out.sort((a, b) => compareCandidates(a.c, b.c));
}

const pseudo = (ref: string, plan: PaidPlan, end: number): Omit<Candidate, 'source'> =>
  ({ ref, plan, end, willRenew: false, trial: false, status: 'expired' });

/** Every currently counting entitlement, sorted by end descending (3.2). Empty unless the user is active. */
export function activeEntitlements(db: Db, user: { id: string; status: UserStatus }, now: number, opts: PlanOptions): Entitlement[] {
  if (user.status !== 'active') return [];
  return rankedEntitlements(db, user.id, now, opts, true).map((r) => r.e);
}

/** All of a user's grants and store subscriptions, counting or not (data export). */
export const allEntitlements = (db: Db, userId: string, now: number, opts: PlanOptions): Entitlement[] =>
  rankedEntitlements(db, userId, now, opts, false).map((r) => r.e);

export type PlanUser = PlanColumns & { id: string };

/** The wire EffectivePlan, built from the plan columns and the referenced row (3.2). */
export function effectivePlan(db: Db, user: PlanUser, now: number, opts: PlanOptions & { cacheDays: number }): EffectivePlan {
  const checkedAt = iso(now);
  if (!isProAt(user, now) || user.plan === 'free' || !user.plan_ref) {
    return {
      plan: 'free', isPro: false, source: null, status: null, expiresAt: null, willRenew: false, trial: false,
      store: null, productId: null, promoCode: null, checkedAt, cacheUntil: checkedAt,
    };
  }
  const [kind, idText] = user.plan_ref.split(':');
  const id = Number(idText);
  let status: EntitlementStatus | null = null;
  let store: StoreId | null = null;
  let productId: string | null = null;
  let promoCode: string | null = null;
  let found = false;
  if (kind === 'grant') {
    const g = getGrantWithCode(db, id);
    if (g && g.user_id === user.id) {
      found = true;
      status = grantStatus(g, now);
      promoCode = g.source === 'promo' ? g.promo_code : null;
    }
  } else if (kind === 'store') {
    const s = one<StoreSubscriptionRow>(db, 'SELECT * FROM store_subscriptions WHERE id = ?', id);
    if (s && s.user_id === user.id) {
      found = true;
      status = s.status;
      store = s.store;
      productId = s.product_id;
    }
  }
  if (!found) {
    // The columns point at a row that moved or vanished: repair them, then answer from the repair.
    recomputePlan(db, user.id, now, opts);
    const fresh = one<PlanColumns>(db, 'SELECT status, plan, plan_source, plan_until, plan_will_renew, plan_trial, plan_ref FROM users WHERE id = ?', user.id);
    if (!fresh || fresh.plan_ref === user.plan_ref) {
      return effectivePlan(db, { ...user, status: 'disabled' }, now, opts);
    }
    return effectivePlan(db, { ...fresh, id: user.id }, now, opts);
  }
  const until = user.plan_until!;
  const end = until >= LIFETIME_UNTIL ? Infinity : until;
  const willRenew = user.plan_will_renew === 1;
  return {
    plan: user.plan,
    isPro: true,
    source: user.plan_source,
    status,
    expiresAt: Number.isFinite(end) ? iso(end) : null,
    willRenew,
    trial: user.plan_trial === 1,
    store,
    productId,
    promoCode,
    checkedAt,
    cacheUntil: iso(computeCacheUntil({ isPro: true, source: user.plan_source, status, willRenew, end }, now, opts.cacheDays)),
  };
}

export function planResponse(db: Db, user: PlanUser, now: number, opts: PlanOptions & { cacheDays: number }): PlanResponse {
  return { plan: effectivePlan(db, user, now, opts), entitlements: activeEntitlements(db, user, now, opts) };
}
