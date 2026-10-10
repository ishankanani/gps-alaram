/**
 * Store subscriptions (spec 3.5, 3.6).
 *
 * Stage 1 holds the parts /v1/plan/sync needs: product → plan mapping, store id mapping, and the
 * optional RevenueCat reconciliation. Webhook processing (event types, order guard, TRANSFER,
 * user resolution, adopting `rcsync:` rows) is added here by stage 2.
 */
import type { PaidPlan, StoreId } from '../../../src/api/types.ts';
import { DAY } from '../clock.ts';
import { many, one, run, tx, type Db } from '../db/database.ts';
import type { Logger } from '../log.ts';
import { parseIsoDate } from '../http/validate.ts';
import { recomputePlan, type PlanOptions, type StoreStatus, type StoreSubscriptionRow } from './plans.ts';
import type { RevenueCatApi } from './revenuecat-api.ts';

const STORES: readonly StoreId[] = ['play_store', 'app_store', 'stripe', 'amazon', 'promotional', 'test_store', 'other'];

/** `PLAY_STORE` → play_store; an unknown value becomes `other`. */
export function storeIdFrom(value: unknown): StoreId {
  const v = typeof value === 'string' ? value.toLowerCase() : '';
  return (STORES as readonly string[]).includes(v) ? (v as StoreId) : 'other';
}

/**
 * Plan for a product (3.5 step 4): the store.productPlans setting; else by name (life → lifetime,
 * year/annual → yearly, month → monthly); else no expiry → lifetime; else > 60 days → yearly;
 * else monthly.
 */
export function planForProduct(
  productId: string,
  productPlans: Readonly<Record<string, PaidPlan>>,
  purchasedAt: number | null,
  expiresAt: number | null,
): PaidPlan {
  const mapped = productPlans[productId];
  if (mapped) return mapped;
  const name = productId.toLowerCase();
  if (name.includes('life')) return 'lifetime';
  if (name.includes('year') || name.includes('annual')) return 'yearly';
  if (name.includes('month')) return 'monthly';
  if (expiresAt === null) return 'lifetime';
  if (purchasedAt !== null && expiresAt - purchasedAt > 60 * DAY) return 'yearly';
  return 'monthly';
}

// ---- RevenueCat reconciliation (3.5, last paragraph) ----

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => v !== null && typeof v === 'object' && !Array.isArray(v);
const date = (v: unknown): number | null => (typeof v === 'string' ? parseIsoDate(v.replace(/(\.\d{3})\d+Z$/, '$1Z')) : null);
const text = (v: unknown, max = 200): string | null => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : null);

/** Google Play subscriptions appear as `sub_id` + product_plan_identifier; webhooks use `sub_id:base_plan`. */
function productIdOf(key: string, entry: Obj): string {
  const plan = text(entry.product_plan_identifier, 100);
  return !key.includes(':') && plan ? `${key}:${plan}` : key;
}

type Reconciled = {
  productId: string;
  store: StoreId;
  environment: 'production' | 'sandbox';
  status: StoreStatus;
  willRenew: 0 | 1;
  periodType: string | null;
  purchasedAt: number;
  expiresAt: number | null;
  graceUntil: number | null;
  cancelReason: string | null;
};

function fromSubscription(productId: string, s: Obj, now: number): Reconciled {
  const expiresAt = date(s.expires_date);
  const graceUntil = date(s.grace_period_expires_date);
  const refundedAt = date(s.refunded_at);
  const billingIssue = date(s.billing_issues_detected_at) !== null;
  const unsubscribed = date(s.unsubscribe_detected_at) !== null;
  const periodType = text(s.period_type, 20)?.toLowerCase() ?? null;
  const end = expiresAt === null ? Infinity : Math.max(expiresAt, graceUntil ?? 0);
  let status: StoreStatus;
  if (refundedAt !== null) status = 'refunded';
  else if (end <= now) status = 'expired';
  else if (billingIssue) status = graceUntil !== null && graceUntil > now ? 'grace_period' : 'billing_issue';
  else if (periodType === 'trial') status = 'trialing';
  else status = 'active';
  return {
    productId,
    store: storeIdFrom(s.store),
    environment: s.is_sandbox === true ? 'sandbox' : 'production',
    status,
    willRenew: unsubscribed || refundedAt !== null || status === 'expired' ? 0 : 1,
    periodType,
    purchasedAt: date(s.purchase_date) ?? date(s.original_purchase_date) ?? now,
    expiresAt: refundedAt !== null && (expiresAt === null || refundedAt < expiresAt) ? refundedAt : expiresAt,
    graceUntil,
    cancelReason: refundedAt !== null ? 'CUSTOMER_SUPPORT' : unsubscribed ? 'UNSUBSCRIBE' : null,
  };
}

function fromNonSubscription(productId: string, purchases: unknown[], now: number): Reconciled | null {
  const latest = purchases.filter(isObj).sort((a, b) => (date(b.purchase_date) ?? 0) - (date(a.purchase_date) ?? 0))[0];
  if (!latest) return null;
  return {
    productId,
    store: storeIdFrom(latest.store),
    environment: latest.is_sandbox === true ? 'sandbox' : 'production',
    status: 'active',
    willRenew: 0,
    periodType: null,
    purchasedAt: date(latest.purchase_date) ?? now,
    expiresAt: null,
    graceUntil: null,
    cancelReason: null,
  };
}

/**
 * Applies a GET /v1/subscribers response to the user's rows: each Pro product updates the row
 * with the same product_id, or inserts one with original_transaction_id = `rcsync:<userId>:<productId>`
 * (a later webhook with the real transaction id adopts it). Products belong to the entitlement
 * when the entitlement points at them or they map to a plan (setting or name). Touched rows get
 * last_event_at = now, so older webhook deliveries count as stale. Returns the products applied.
 */
export function applySubscriber(
  db: Db,
  input: { userId: string; response: unknown; now: number; entitlement: string; productPlans: Readonly<Record<string, PaidPlan>>; plan: PlanOptions },
): number {
  const { userId, now } = input;
  const subscriber = isObj(input.response) && isObj(input.response.subscriber) ? input.response.subscriber : null;
  if (!subscriber) return 0;
  const ent = isObj(subscriber.entitlements) ? subscriber.entitlements[input.entitlement] : undefined;
  const entProduct = isObj(ent) ? text(ent.product_identifier, 200) : null;
  const belongs = (productId: string, rawKey: string): boolean =>
    productId === entProduct || rawKey === entProduct || productId in input.productPlans ||
    /life|year|annual|month/i.test(productId);

  const found: Reconciled[] = [];
  if (isObj(subscriber.subscriptions)) {
    for (const [key, entry] of Object.entries(subscriber.subscriptions)) {
      if (!isObj(entry) || key.length > 200) continue;
      const productId = productIdOf(key, entry);
      if (belongs(productId, key)) found.push(fromSubscription(productId, entry, now));
    }
  }
  if (isObj(subscriber.non_subscriptions)) {
    for (const [key, purchases] of Object.entries(subscriber.non_subscriptions)) {
      if (!Array.isArray(purchases) || key.length > 200 || !belongs(key, key)) continue;
      const r = fromNonSubscription(key, purchases, now);
      if (r) found.push(r);
    }
  }
  if (found.length === 0) return 0;

  return tx(db, () => {
    // The user may have been deleted while RevenueCat answered.
    if (!one(db, 'SELECT 1 AS x FROM users WHERE id = ?', userId)) return 0;
    for (const r of found) {
      const plan = planForProduct(r.productId, input.productPlans, r.purchasedAt, r.expiresAt);
      const existing = one<StoreSubscriptionRow>(
        db, 'SELECT * FROM store_subscriptions WHERE user_id = ? AND product_id = ? ORDER BY updated_at DESC, id DESC LIMIT 1',
        userId, r.productId,
      );
      if (existing) {
        run(
          db,
          `UPDATE store_subscriptions SET environment = ?, plan = ?, status = ?, will_renew = ?, period_type = coalesce(?, period_type),
             expires_at = ?, grace_until = ?, cancel_reason = coalesce(?, cancel_reason), rc_app_user_id = ?,
             last_event_type = 'rcsync', last_event_at = max(last_event_at, ?), updated_at = ?
           WHERE id = ?`,
          r.environment, plan, r.status, plan === 'lifetime' ? 0 : r.willRenew, r.periodType,
          r.expiresAt, r.graceUntil, r.cancelReason, userId, now, now, existing.id,
        );
      } else {
        run(
          db,
          `INSERT INTO store_subscriptions (user_id, store, environment, product_id, plan, original_transaction_id, rc_app_user_id,
             status, period_type, will_renew, purchased_at, expires_at, grace_until, cancel_reason, last_event_type, last_event_at,
             created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'rcsync', ?, ?, ?)
           ON CONFLICT (store, original_transaction_id) DO NOTHING`,
          userId, r.store, r.environment, r.productId, plan, `rcsync:${userId}:${r.productId}`.slice(0, 200), userId,
          r.status, r.periodType, plan === 'lifetime' ? 0 : r.willRenew, r.purchasedAt, r.expiresAt, r.graceUntil, r.cancelReason,
          now, now, now,
        );
      }
    }
    recomputePlan(db, userId, now, input.plan);
    return found.length;
  });
}

/**
 * /v1/plan/sync and the admin sync: fetches the subscriber (outside any transaction) and applies
 * it. Returns false without an API key or when RevenueCat cannot be reached (the plan stays as is).
 */
export async function syncWithRevenueCat(
  deps: { db: Db; revenuecat: RevenueCatApi | null; log: Logger; entitlement: string; plan: PlanOptions; productPlans: () => Readonly<Record<string, PaidPlan>>; now: () => number },
  userId: string,
): Promise<boolean> {
  if (!deps.revenuecat) return false;
  let response: unknown;
  try {
    response = await deps.revenuecat.getSubscriber(userId);
  } catch (err) {
    deps.log.warn('revenuecat sync failed', { error: (err as Error).message });
    return false;
  }
  applySubscriber(deps.db, {
    userId, response, now: deps.now(), entitlement: deps.entitlement, productPlans: deps.productPlans(), plan: deps.plan,
  });
  return true;
}

/** The user's store subscriptions, newest first. */
export const storeSubscriptionsOf = (db: Db, userId: string): StoreSubscriptionRow[] =>
  many<StoreSubscriptionRow>(db, 'SELECT * FROM store_subscriptions WHERE user_id = ? ORDER BY purchased_at DESC, id DESC', userId);
