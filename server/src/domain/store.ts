/**
 * Store subscriptions (spec 3.5, 3.6).
 *
 * - Webhook processing: entitlement filter, row lookup by (store, original_transaction_id), user
 *   resolution (app_user_id, original_app_user_id, aliases; merged_into up to 5 hops), adoption of
 *   `rcsync:` rows, the order guard, product → plan, the per-type table, TRANSFER, recompute.
 * - The optional RevenueCat reconciliation behind /v1/plan/sync and the admin sync.
 *
 * Everything that writes runs synchronously inside one transaction (no awaits).
 */
import type { AdminStoreSubscription, PaidPlan, StoreEvent, StoreId } from '../../../src/api/types.ts';
import { DAY, iso, isoOrNull } from '../clock.ts';
import { many, one, run, tx, type Db } from '../db/database.ts';
import type { Logger } from '../log.ts';
import { parseIsoDate } from '../http/validate.ts';
import { recomputePlan, storeDisplayStatus, type PlanOptions, type StoreStatus, type StoreSubscriptionRow } from './plans.ts';
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

/** The user's store subscriptions, newest first. */
export const storeSubscriptionsOf = (db: Db, userId: string): StoreSubscriptionRow[] =>
  many<StoreSubscriptionRow>(db, 'SELECT * FROM store_subscriptions WHERE user_id = ? ORDER BY purchased_at DESC, id DESC', userId);

// ---- Sync (/v1/plan/sync, admin sync) ----

export type StoreDeps = {
  db: Db;
  log: Logger;
  revenuecat: RevenueCatApi | null;
  config: { revenuecatEntitlement: string };
  planOptions: PlanOptions;
  settings(): { 'store.productPlans': Readonly<Record<string, PaidPlan>> };
  clock: { now(): number };
};

/** GET /v1/subscribers/{id} outside any transaction; null without a key or when RevenueCat cannot be reached. */
export async function fetchSubscriber(deps: Pick<StoreDeps, 'revenuecat' | 'log'>, userId: string): Promise<unknown | null> {
  if (!deps.revenuecat) return null;
  try {
    return await deps.revenuecat.getSubscriber(userId);
  } catch (err) {
    deps.log.warn('revenuecat sync failed', { error: (err as Error).message });
    return null;
  }
}

/** Applies a fetched subscriber (in its own transaction, or a savepoint of the caller's). */
export function applyFetchedSubscriber(deps: StoreDeps, userId: string, response: unknown): number {
  return applySubscriber(deps.db, {
    userId,
    response,
    now: deps.clock.now(),
    entitlement: deps.config.revenuecatEntitlement,
    productPlans: deps.settings()['store.productPlans'],
    plan: deps.planOptions,
  });
}

/** /v1/plan/sync: true when RevenueCat answered and the answer was applied. */
export async function syncWithRevenueCat(deps: StoreDeps, userId: string): Promise<boolean> {
  const response = await fetchSubscriber(deps, userId);
  if (response === null) return false;
  applyFetchedSubscriber(deps, userId, response);
  return true;
}

// ---- Webhook processing (3.5, 3.6) ----

export type WebhookStatus = 'processed' | 'stale' | 'ignored' | 'unmatched' | 'error';
export type EventOutcome = { status: Exclude<WebhookStatus, 'error'>; userId: string | null; note?: string };

const USER_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
/** A millisecond timestamp or count: a safe integer (absurd values count as absent). */
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isSafeInteger(Math.trunc(v)) ? Math.trunc(v) : null);
const PERIOD_TYPES = new Set(['trial', 'intro', 'normal', 'promotional', 'prepaid']);

/** A RevenueCat app user id → users.id, following merged_into up to 5 hops. Anonymous ids never match. */
export function resolveAppUserId(db: Db, id: unknown): string | null {
  if (typeof id !== 'string' || !USER_UUID_RE.test(id)) return null;
  let current = id;
  for (let hop = 0; hop <= 5; hop++) {
    const u = one<{ id: string; status: string; merged_into: string | null }>(db, 'SELECT id, status, merged_into FROM users WHERE id = ?', current);
    if (!u) return null;
    if (u.status !== 'merged') return u.id;
    if (!u.merged_into) return null;
    current = u.merged_into;
  }
  return null;
}

/** event.app_user_id, then original_app_user_id, then each alias; the first hit wins. */
export function resolveEventUser(db: Db, event: Obj): string | null {
  const ids: unknown[] = [event.app_user_id, event.original_app_user_id, ...(Array.isArray(event.aliases) ? event.aliases.slice(0, 50) : [])];
  for (const id of ids) {
    const u = resolveAppUserId(db, id);
    if (u) return u;
  }
  return null;
}

/** Types the table in 3.5 applies to a subscription row (TRANSFER is separate; anything else is ignored). */
const ROW_TYPES = new Set([
  'INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION', 'CANCELLATION', 'NON_RENEWING_PURCHASE', 'EXPIRATION',
  'BILLING_ISSUE', 'SUBSCRIPTION_PAUSED', 'SUBSCRIPTION_EXTENDED', 'TEMPORARY_ENTITLEMENT_GRANT', 'REFUND_REVERSED',
  'PRODUCT_CHANGE',
]);
/** Types that carry the purchased product (and so may change product_id and plan). */
const PRODUCT_TYPES = new Set(['INITIAL_PURCHASE', 'RENEWAL', 'NON_RENEWING_PURCHASE']);

type Patch = {
  status?: StoreStatus;
  will_renew?: 0 | 1;
  expires_at?: number | null;
  grace_until?: number | null;
  purchased_at?: number;
  cancel_reason?: string | null;
};

/** expiration_at_ms: undefined when absent, null when explicitly null (non-expiring). */
function expirationOf(event: Obj): number | null | undefined {
  if (!('expiration_at_ms' in event) || event.expiration_at_ms === undefined) return undefined;
  if (event.expiration_at_ms === null) return null;
  return num(event.expiration_at_ms) ?? undefined;
}

function patchFor(type: string, event: Obj, eventAt: number, now: number, plan: PaidPlan): Patch {
  const exp = expirationOf(event);
  const withExp = (p: Patch): Patch => (exp !== undefined ? { ...p, expires_at: exp } : p);
  switch (type) {
    case 'INITIAL_PURCHASE': {
      const p: Patch = { status: event.period_type === 'TRIAL' ? 'trialing' : 'active', will_renew: 1 };
      const purchased = num(event.purchased_at_ms);
      if (purchased !== null) p.purchased_at = purchased;
      return withExp(p);
    }
    case 'RENEWAL':
      return withExp({ status: 'active', will_renew: 1, grace_until: null });
    case 'UNCANCELLATION':
      return { will_renew: 1 };
    case 'CANCELLATION': {
      const reason = text(event.cancel_reason, 100);
      if (reason === 'CUSTOMER_SUPPORT') return { status: 'refunded', will_renew: 0, expires_at: eventAt, cancel_reason: reason };
      return withExp({ will_renew: 0, cancel_reason: reason });
    }
    case 'NON_RENEWING_PURCHASE': {
      const p: Patch = { status: 'active', will_renew: 0, expires_at: exp ?? null };
      const purchased = num(event.purchased_at_ms);
      if (purchased !== null) p.purchased_at = purchased;
      return p;
    }
    case 'EXPIRATION':
      return { status: 'expired', will_renew: 0, expires_at: exp ?? eventAt, cancel_reason: text(event.expiration_reason, 100) };
    case 'BILLING_ISSUE': {
      const grace = num(event.grace_period_expiration_at_ms);
      return { status: grace !== null && grace > now ? 'grace_period' : 'billing_issue', grace_until: grace };
    }
    case 'SUBSCRIPTION_PAUSED':
      return { status: 'paused', will_renew: 0 };
    case 'SUBSCRIPTION_EXTENDED':
      return withExp({});
    case 'TEMPORARY_ENTITLEMENT_GRANT':
      return withExp({ status: 'active', will_renew: 0 });
    case 'REFUND_REVERSED':
      return { status: 'active', ...(exp !== undefined ? { expires_at: exp } : plan === 'lifetime' ? { expires_at: null } : {}) };
    default:
      // PRODUCT_CHANGE: recorded only; the next RENEWAL carries the new product and plan.
      return {};
  }
}

/** The columns every applied event sets when the event carries them. */
function commonColumns(event: Obj, eventAt: number, now: number): Record<string, string | number | null> {
  const c: Record<string, string | number | null> = {
    last_event_id: String(event.id),
    last_event_type: String(event.type).slice(0, 64),
    last_event_at: eventAt,
    updated_at: now,
  };
  const appUser = text(event.app_user_id, 200);
  if (appUser) c.rc_app_user_id = appUser;
  const period = typeof event.period_type === 'string' ? event.period_type.toLowerCase() : null;
  if (period && PERIOD_TYPES.has(period)) c.period_type = period;
  if (typeof event.country_code === 'string' && /^[A-Z]{2}$/.test(event.country_code)) c.country = event.country_code;
  if (typeof event.currency === 'string' && /^[A-Z]{3}$/.test(event.currency)) c.currency = event.currency;
  // Refunds carry negative prices; keep the purchase price instead.
  if (typeof event.price_in_purchased_currency === 'number' && Number.isFinite(event.price_in_purchased_currency) && event.price_in_purchased_currency >= 0) {
    c.price_local = event.price_in_purchased_currency;
  }
  if (typeof event.price === 'number' && Number.isFinite(event.price) && event.price >= 0) c.price_usd = event.price;
  return c;
}

const environmentOf = (event: Obj): 'production' | 'sandbox' =>
  typeof event.environment === 'string' && event.environment.toUpperCase() === 'SANDBOX' ? 'sandbox' : 'production';

function applyTransfer(db: Db, event: Obj, deps: { now: number; plan: PlanOptions }): EventOutcome {
  const from = Array.isArray(event.transferred_from) ? event.transferred_from.slice(0, 50) : [];
  const to = Array.isArray(event.transferred_to) ? event.transferred_to.slice(0, 50) : [];
  let target: string | null = null;
  for (const id of to) {
    target = resolveAppUserId(db, id);
    if (target) break;
  }
  if (!target) return { status: 'unmatched', userId: null };
  const sources = new Set<string>();
  for (const id of from) {
    const u = resolveAppUserId(db, id);
    if (u && u !== target) sources.add(u);
  }
  for (const u of sources) {
    run(db, 'UPDATE store_subscriptions SET user_id = ?, updated_at = ? WHERE user_id = ?', target, deps.now, u);
    recomputePlan(db, u, deps.now, deps.plan);
  }
  recomputePlan(db, target, deps.now, deps.plan);
  return { status: 'processed', userId: target };
}

export type ApplyDeps = { now: number; entitlement: string; productPlans: Readonly<Record<string, PaidPlan>>; plan: PlanOptions };

/**
 * Applies one RevenueCat event (3.5) inside the caller's transaction and returns its outcome.
 * Throws only on unexpected failures (the caller stores the event as `error`).
 */
export function applyStoreEvent(db: Db, event: Obj, deps: ApplyDeps): EventOutcome {
  const type = String(event.type);
  const { now } = deps;
  if (type === 'TEST') return { status: 'ignored', userId: null };
  if (Array.isArray(event.entitlement_ids) && !event.entitlement_ids.includes(deps.entitlement)) {
    return { status: 'ignored', userId: resolveEventUser(db, event), note: 'other entitlement' };
  }
  if (type === 'TRANSFER') return applyTransfer(db, event, deps);
  if (!ROW_TYPES.has(type)) return { status: 'ignored', userId: resolveEventUser(db, event) };

  const store = storeIdFrom(event.store);
  const txnId = text(event.original_transaction_id, 200) ?? text(event.transaction_id, 200);
  const productId = text(event.product_id, 200);
  if (!txnId) return { status: 'ignored', userId: resolveEventUser(db, event), note: 'no original_transaction_id' };

  const findRow = (): StoreSubscriptionRow | undefined =>
    one<StoreSubscriptionRow>(db, 'SELECT * FROM store_subscriptions WHERE store = ? AND original_transaction_id = ?', store, txnId);
  let row = findRow();
  let userId: string;
  if (row) {
    // The row determines the user (handles merges and moved rows).
    userId = row.user_id;
  } else {
    const resolved = resolveEventUser(db, event);
    if (!resolved) return { status: 'unmatched', userId: null };
    userId = resolved;
    if (productId) {
      // A sync created this row before the real transaction id was known: adopt it.
      const synced = one<StoreSubscriptionRow>(
        db,
        "SELECT * FROM store_subscriptions WHERE user_id = ? AND product_id = ? AND original_transaction_id LIKE 'rcsync:%' ORDER BY id DESC LIMIT 1",
        userId, productId,
      );
      if (synced) {
        run(db, 'UPDATE store_subscriptions SET store = ?, original_transaction_id = ?, updated_at = ? WHERE id = ?', store, txnId, now, synced.id);
        row = findRow();
      }
    }
  }

  const eventAt = num(event.event_timestamp_ms) ?? now;
  if (row && eventAt < row.last_event_at) return { status: 'stale', userId };
  if (!row && !productId) return { status: 'ignored', userId, note: 'no product_id' };

  const exp = expirationOf(event);
  const updatesProduct = !row || (PRODUCT_TYPES.has(type) && productId !== null);
  const product = updatesProduct ? productId! : row!.product_id;
  const plan: PaidPlan = updatesProduct
    ? planForProduct(product, deps.productPlans, num(event.purchased_at_ms) ?? row?.purchased_at ?? null, exp === undefined ? (row?.expires_at ?? null) : exp)
    : row!.plan;
  const patch = patchFor(type, event, eventAt, now, plan);
  const common = commonColumns(event, eventAt, now);

  if (row) {
    const cols: Record<string, string | number | null> = { ...common, environment: environmentOf(event) };
    if (updatesProduct) {
      cols.product_id = product;
      cols.plan = plan;
    }
    for (const [k, val] of Object.entries(patch)) cols[k] = val as string | number | null;
    if (plan === 'lifetime') cols.will_renew = 0;
    const keys = Object.keys(cols);
    run(db, `UPDATE store_subscriptions SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, ...keys.map((k) => cols[k] ?? null), row.id);
  } else {
    const expiresAt = patch.expires_at !== undefined ? patch.expires_at : exp !== undefined ? exp : plan === 'lifetime' ? null : eventAt;
    const cols: Record<string, string | number | null> = {
      user_id: userId,
      store,
      environment: environmentOf(event),
      product_id: product,
      plan,
      original_transaction_id: txnId,
      rc_app_user_id: text(event.app_user_id, 200) ?? userId,
      status: patch.status ?? 'active',
      will_renew: plan === 'lifetime' ? 0 : (patch.will_renew ?? 1),
      purchased_at: patch.purchased_at ?? num(event.purchased_at_ms) ?? eventAt,
      expires_at: expiresAt,
      grace_until: patch.grace_until ?? null,
      cancel_reason: patch.cancel_reason ?? null,
      created_at: now,
      ...common,
    };
    const keys = Object.keys(cols);
    run(db, `INSERT INTO store_subscriptions (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`, ...keys.map((k) => cols[k] ?? null));
  }
  recomputePlan(db, userId, now, deps.plan);
  return { status: 'processed', userId };
}

export type WebhookEventRow = {
  id: string;
  type: string;
  app_user_id: string | null;
  user_id: string | null;
  environment: string | null;
  event_at: number | null;
  received_at: number;
  processed_at: number | null;
  status: WebhookStatus;
  error: string | null;
  payload: string;
};

export const getWebhookEvent = (db: Db, id: string): WebhookEventRow | undefined =>
  one<WebhookEventRow>(db, 'SELECT * FROM webhook_events WHERE id = ?', id);

const PAYLOAD_MAX = 65536;
const CORE_KEYS = [
  'id', 'type', 'app_id', 'app_user_id', 'original_app_user_id', 'aliases', 'event_timestamp_ms', 'product_id', 'new_product_id',
  'entitlement_ids', 'period_type', 'purchased_at_ms', 'expiration_at_ms', 'grace_period_expiration_at_ms', 'store', 'environment',
  'transaction_id', 'original_transaction_id', 'cancel_reason', 'expiration_reason', 'country_code', 'currency', 'price',
  'price_in_purchased_currency', 'transferred_from', 'transferred_to', 'is_family_share', 'offer_code',
];

/** The event as stored: without subscriber_attributes, and within the column's 64 KiB limit. */
export function storedPayload(event: Obj): string {
  const rest: Obj = { ...event };
  delete rest.subscriber_attributes;
  let s = JSON.stringify(rest);
  if (s.length <= PAYLOAD_MAX) return s;
  const core: Obj = {};
  for (const k of CORE_KEYS) if (k in rest) core[k] = rest[k];
  core.truncated = true;
  s = JSON.stringify(core);
  return s.length <= PAYLOAD_MAX ? s : JSON.stringify({ id: rest.id, type: rest.type, truncated: true });
}

function writeEventRow(db: Db, e: Omit<WebhookEventRow, 'received_at'> & { received_at: number }): void {
  run(
    db,
    `INSERT INTO webhook_events (id, type, app_user_id, user_id, environment, event_at, received_at, processed_at, status, error, payload)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET type = excluded.type, app_user_id = excluded.app_user_id, user_id = excluded.user_id,
       environment = excluded.environment, event_at = excluded.event_at, processed_at = excluded.processed_at,
       status = excluded.status, error = excluded.error, payload = excluded.payload`,
    e.id, e.type, e.app_user_id, e.user_id, e.environment, e.event_at, e.received_at, e.processed_at, e.status, e.error, e.payload,
  );
}

const errorText = (err: unknown): string => (err instanceof Error ? err.message : String(err)).slice(0, 500);

export type ReceiveResult = { status: Exclude<WebhookStatus, 'error'> | 'duplicate' };

export function applyDepsFrom(deps: StoreDeps): ApplyDeps {
  return {
    now: deps.clock.now(),
    entitlement: deps.config.revenuecatEntitlement,
    productPlans: deps.settings()['store.productPlans'],
    plan: deps.planOptions,
  };
}

/**
 * POST /v1/webhooks/revenuecat processing (2.9): a known id is a duplicate unless it was stored as
 * `error` (then it is processed again). Processing and the webhook_events row share a transaction;
 * when processing throws, the event is stored as `error` and the error is rethrown (→ 500, retry).
 */
export function receiveStoreEvent(deps: StoreDeps, event: Obj): ReceiveResult {
  const { db } = deps;
  const a = applyDepsFrom(deps);
  const id = String(event.id);
  const existing = getWebhookEvent(db, id);
  if (existing && existing.status !== 'error') return { status: 'duplicate' };
  const base = {
    id,
    type: String(event.type).slice(0, 64),
    app_user_id: text(event.app_user_id, 200),
    environment: typeof event.environment === 'string' ? event.environment.toLowerCase().slice(0, 20) : null,
    event_at: num(event.event_timestamp_ms),
    received_at: existing?.received_at ?? a.now,
    payload: storedPayload(event),
  };
  try {
    return tx(db, () => {
      const again = getWebhookEvent(db, id);
      if (again && again.status !== 'error') return { status: 'duplicate' as const };
      const outcome = applyStoreEvent(db, event, a);
      writeEventRow(db, { ...base, user_id: outcome.userId, processed_at: a.now, status: outcome.status, error: outcome.note ?? null });
      return { status: outcome.status };
    });
  } catch (err) {
    let userId: string | null = null;
    try {
      userId = resolveEventUser(db, event);
    } catch {
      userId = null;
    }
    tx(db, () => writeEventRow(db, { ...base, user_id: userId, processed_at: null, status: 'error', error: errorText(err) }));
    throw err;
  }
}

/**
 * Admin retry of an `unmatched` or `error` event from its stored payload, inside the caller's
 * transaction (the audit row goes in the same one). A failure is recorded on the event, not thrown.
 */
export function reprocessStoreEvent(deps: StoreDeps, row: WebhookEventRow): { before: WebhookStatus; after: WebhookStatus; userId: string | null } {
  const { db } = deps;
  const a = applyDepsFrom(deps);
  const event = JSON.parse(row.payload) as Obj;
  try {
    const outcome = tx(db, () => applyStoreEvent(db, event, a));
    run(db, 'UPDATE webhook_events SET status = ?, user_id = ?, processed_at = ?, error = ? WHERE id = ?',
      outcome.status, outcome.userId, a.now, outcome.note ?? null, row.id);
    return { before: row.status, after: outcome.status, userId: outcome.userId };
  } catch (err) {
    run(db, "UPDATE webhook_events SET status = 'error', processed_at = NULL, error = ? WHERE id = ?", errorText(err), row.id);
    return { before: row.status, after: 'error', userId: row.user_id };
  }
}

// ---- Admin views ----

export function toAdminStoreSubscription(s: StoreSubscriptionRow, now: number): AdminStoreSubscription {
  return {
    kind: 'store',
    id: s.id,
    store: s.store,
    environment: s.environment,
    productId: s.product_id,
    plan: s.plan,
    status: storeDisplayStatus(s, now),
    periodType: s.period_type,
    willRenew: s.will_renew === 1,
    purchasedAt: iso(s.purchased_at),
    expiresAt: isoOrNull(s.expires_at),
    graceUntil: isoOrNull(s.grace_until),
    cancelReason: s.cancel_reason,
    originalTransactionId: s.original_transaction_id,
    country: s.country,
    currency: s.currency,
    priceLocal: s.price_local,
    priceUsd: s.price_usd,
    lastEventType: s.last_event_type,
    lastEventAt: iso(s.last_event_at),
  };
}

type EventWithUser = WebhookEventRow & { u_public_id: string | null; u_display_name: string | null };

const EVENT_SELECT = `SELECT e.*, u.public_id AS u_public_id, u.display_name AS u_display_name
  FROM webhook_events e LEFT JOIN users u ON u.id = e.user_id`;

function toStoreEvent(e: EventWithUser): StoreEvent {
  return {
    id: e.id,
    type: e.type,
    status: e.status,
    appUserId: e.app_user_id,
    user: e.user_id && e.u_public_id ? { id: e.user_id, publicId: e.u_public_id, displayName: e.u_display_name } : null,
    environment: e.environment,
    eventAt: isoOrNull(e.event_at),
    receivedAt: iso(e.received_at),
    processedAt: isoOrNull(e.processed_at),
    error: e.error,
  };
}

export function storeEventById(db: Db, id: string): { event: StoreEvent; payload: Record<string, unknown> } | null {
  const e = one<EventWithUser>(db, `${EVENT_SELECT} WHERE e.id = ?`, id);
  if (!e) return null;
  let payload: Record<string, unknown> = {};
  try {
    const p = JSON.parse(e.payload) as unknown;
    if (isObj(p)) payload = p;
  } catch {
    payload = {};
  }
  return { event: toStoreEvent(e), payload };
}

/** Newest first by received_at (then id); `before` is the id of the last event of the previous page. */
export function listStoreEvents(
  db: Db,
  q: { status?: WebhookStatus | null; userId?: string | null; before?: string | null; limit: number },
): { items: StoreEvent[]; nextBefore: string | null } {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (q.status) {
    where.push('e.status = ?');
    params.push(q.status);
  }
  if (q.userId) {
    where.push('e.user_id = ?');
    params.push(q.userId);
  }
  if (q.before) {
    const cursor = one<{ received_at: number }>(db, 'SELECT received_at FROM webhook_events WHERE id = ?', q.before);
    if (!cursor) return { items: [], nextBefore: null };
    where.push('(e.received_at < ? OR (e.received_at = ? AND e.id < ?))');
    params.push(cursor.received_at, cursor.received_at, q.before);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = many<EventWithUser>(db, `${EVENT_SELECT} ${clause} ORDER BY e.received_at DESC, e.id DESC LIMIT ?`, ...params, q.limit);
  return { items: rows.map(toStoreEvent), nextBefore: rows.length === q.limit ? (rows.at(-1)?.id ?? null) : null };
}
