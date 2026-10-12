/**
 * Who has Pro, pure (backend-spec 3.7, 7.2 and 7.4). The union of the server's cached plan (trusted
 * offline until `cacheUntil`, measured on the phone's own clock from when the answer arrived) and
 * the store's entitlement (RevenueCat, only while its user is ours).
 */
import type { EffectivePlan, EntitlementStatus, PaidPlan, PlanId, PlanSource, StoreId } from '../api/types';

/**
 * - unlocked: no server and no store key (test builds): every Pro feature is on.
 * - store: no server, a store key: the store alone decides.
 * - server: the server's plan ∪ the store. No automatic unlock.
 */
export type BuildMode = 'unlocked' | 'store' | 'server';

export function buildModeFor(apiConfigured: boolean, storeConnected: boolean): BuildMode {
  if (apiConfigured) return 'server';
  return storeConnected ? 'store' : 'unlocked';
}

/** The plan part of the account snapshot: what the server said, for whom, and when it arrived. */
export type CachedPlan = { userId: string; receivedAt: number; plan: EffectivePlan };

/** A phone clock that moved back further than this makes the cached plan untrustworthy. */
export const CLOCK_SKEW_MS = 10 * 60_000;

/** How long the server lets the phone trust this answer (cacheUntil − checkedAt); 0 when unusable. */
export function validForMs(plan: Pick<EffectivePlan, 'cacheUntil' | 'checkedAt'>): number {
  const until = Date.parse(plan.cacheUntil);
  const checked = Date.parse(plan.checkedAt);
  if (Number.isNaN(until) || Number.isNaN(checked)) return 0;
  return Math.max(0, until - checked);
}

/** Whether the cached plan still makes this user Pro on this phone at `deviceNow`. */
export function serverPlanValid(cached: CachedPlan | null | undefined, sessionUserId: string | null | undefined, deviceNow: number): boolean {
  if (!cached || !sessionUserId || cached.userId !== sessionUserId) return false;
  if (!cached.plan.isPro) return false;
  if (deviceNow < cached.receivedAt - CLOCK_SKEW_MS) return false;
  return deviceNow - cached.receivedAt < validForMs(cached.plan);
}

/** When (device time) the cached plan stops counting, or null when it doesn't count now. */
export function serverPlanValidUntil(cached: CachedPlan | null | undefined): number | null {
  if (!cached || !cached.plan.isPro) return null;
  return cached.receivedAt + validForMs(cached.plan);
}

/** What the store (RevenueCat) says about the `pro` entitlement on this phone. */
export type StoreEntitlement = {
  active: boolean;
  /** RevenueCat's current app user id; null before the SDK answered. */
  appUserId: string | null;
  plan: PaidPlan | null;
  productId: string | null;
  /** null for lifetime. */
  expiresAt: string | null;
  willRenew: boolean;
  trial: boolean;
  billingIssue: boolean;
  /** When this entitlement was bought (latest purchase). */
  purchasedAt: string | null;
};

export const NO_STORE: StoreEntitlement = {
  active: false,
  appUserId: null,
  plan: null,
  productId: null,
  expiresAt: null,
  willRenew: false,
  trial: false,
  billingIssue: false,
  purchasedAt: null,
};

/** RevenueCat's anonymous ids, before the app has logged in. */
export const isAnonymousStoreUser = (id: string | null | undefined) => !id || id.startsWith('$RCAnonymousID:');

/**
 * The store's entitlement counts only while RevenueCat's user is ours (or still anonymous, e.g. a
 * purchase made before the first guest existed). Right after a sign-out the SDK still holds the old
 * account's purchases until logIn(newGuest) finishes; those must not unlock the next guest.
 */
export function storeCounts(store: StoreEntitlement, sessionUserId: string | null | undefined): boolean {
  if (!store.active) return false;
  if (isAnonymousStoreUser(store.appUserId)) return true;
  return !!sessionUserId && store.appUserId === sessionUserId;
}

/** The plan of a store product id (stopwake_pro:yearly, stopwake_lifetime), as the server maps it (3.5). */
export function planFromProductId(productId: string | null | undefined, expiresAt?: string | null): PaidPlan {
  const id = (productId ?? '').toLowerCase();
  if (id.includes('life')) return 'lifetime';
  if (id.includes('year') || id.includes('annual')) return 'yearly';
  if (id.includes('month')) return 'monthly';
  return expiresAt == null ? 'lifetime' : 'monthly';
}

export function isProFrom(
  cached: CachedPlan | null | undefined,
  sessionUserId: string | null | undefined,
  store: StoreEntitlement,
  mode: BuildMode,
  deviceNow: number,
  disabled = false,
): boolean {
  if (mode === 'unlocked') return true;
  if (disabled) return false;
  const fromStore = storeCounts(store, sessionUserId);
  if (mode === 'store') return fromStore;
  return serverPlanValid(cached, sessionUserId, deviceNow) || fromStore;
}

/** Everything the plan card, the paywall and the gates need to know (7.4). */
export type ProView = {
  isPro: boolean;
  plan: PlanId;
  source: PlanSource | null;
  status: EntitlementStatus | null;
  /** End of the plan that counts; null for lifetime and free. */
  expiresAt: string | null;
  willRenew: boolean;
  trial: boolean;
  store: StoreId | null;
  productId: string | null;
  promoCode: string | null;
  /** Where the answer came from: the server's cached plan, the store SDK, the build (test unlock), or nowhere (free). */
  origin: 'server' | 'store' | 'build' | 'none';
};

export const FREE_VIEW: ProView = {
  isPro: false,
  plan: 'free',
  source: null,
  status: null,
  expiresAt: null,
  willRenew: false,
  trial: false,
  store: null,
  productId: null,
  promoCode: null,
  origin: 'none',
};

export type ProInput = {
  mode: BuildMode;
  cached: CachedPlan | null | undefined;
  sessionUserId: string | null | undefined;
  store: StoreEntitlement;
  deviceNow: number;
  /** The account is disabled: Free, whatever the cache says (3.2). */
  disabled?: boolean;
};

/**
 * The plan to show. The server's answer wins while it is valid and Pro: it already includes the
 * store subscription (through the webhook), gifts and codes. When it doesn't count (offline too
 * long, the webhook not there yet), the store's own entitlement stands in.
 */
export function resolveProView({ mode, cached, sessionUserId, store, deviceNow, disabled }: ProInput): ProView {
  if (mode === 'unlocked') return { ...FREE_VIEW, isPro: true, plan: 'lifetime', origin: 'build' };
  if (disabled) return FREE_VIEW;
  if (mode === 'server' && cached && serverPlanValid(cached, sessionUserId, deviceNow)) {
    const p = cached.plan;
    return {
      isPro: true,
      plan: p.plan,
      source: p.source,
      status: p.status,
      expiresAt: p.expiresAt,
      willRenew: p.willRenew,
      trial: p.trial,
      store: p.store,
      productId: p.productId,
      promoCode: p.promoCode,
      origin: 'server',
    };
  }
  if (storeCounts(store, sessionUserId)) {
    const plan = store.plan ?? planFromProductId(store.productId, store.expiresAt);
    return {
      isPro: true,
      plan,
      source: 'store',
      status: store.billingIssue ? 'billing_issue' : store.trial ? 'trialing' : 'active',
      expiresAt: plan === 'lifetime' ? null : store.expiresAt,
      willRenew: store.willRenew,
      trial: store.trial,
      store: 'play_store',
      productId: store.productId,
      promoCode: null,
      origin: 'store',
    };
  }
  return FREE_VIEW;
}

/** A store subscription in trouble: Google Play is retrying a payment (grace period or on hold). */
export function hasBillingProblem(view: Pick<ProView, 'source' | 'status'>): boolean {
  return view.source === 'store' && (view.status === 'grace_period' || view.status === 'billing_issue');
}
