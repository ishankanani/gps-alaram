import { useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';
import Purchases, {
  PACKAGE_TYPE,
  PERIOD_UNIT,
  PURCHASES_ERROR_CODE,
  type CustomerInfo,
  type PurchasesPackage,
} from 'react-native-purchases';

import { apiConfigured } from '../api';
import { cachedPlan, getAccountState, onIdentity, startAccount, subscribeAccount, syncPlan } from '../api/account';
import { startConfig } from '../api/config';
import { getSession } from '../api/secure';
import {
  buildModeFor,
  NO_STORE,
  planFromProductId,
  resolveProView,
  serverPlanValidUntil,
  type BuildMode,
  type ProView,
  type StoreEntitlement,
} from './entitlement';
import type { PlanType } from './plans';

// Pro on this phone (backend-spec 3.8 and 7.4): RevenueCat for purchases, united with the plan the
// server gives (store subscriptions through the webhook, gifts from admins, promo codes).

/** The RevenueCat entitlement that unlocks Pro. */
const ENTITLEMENT = 'pro';

/**
 * RevenueCat public SDK keys, set at build time (EXPO_PUBLIC_ variables are compiled into the app;
 * public keys are meant to be). Without one, the build has no store connection.
 */
const API_KEY =
  Platform.OS === 'android' ? process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY : process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;

export const storeConnected = !!API_KEY;

/** unlocked (no server, no store: test builds), store (store only) or server (server ∪ store). */
export const buildMode: BuildMode = buildModeFor(apiConfigured, storeConnected);

/** Google Play's subscriptions page, when RevenueCat has no management URL. */
export const PLAY_SUBSCRIPTIONS_URL = 'https://play.google.com/store/account/subscriptions';

export type Plan = {
  type: PlanType;
  /** Price as the store formats it, in the user's currency. */
  price: string;
  /** The store's number for the price (for the saving), in major units. */
  amount: number;
  currency: string;
  /** For the yearly plan: what it comes to per month. */
  perMonth: string | null;
  /** Free trial before the first payment, if the store offers one to this user. */
  trialDays: number | null;
  pkg: PurchasesPackage;
};

type StoreState = {
  entitlement: StoreEntitlement;
  /** Plans from the store; null until loaded. */
  plans: Plan[] | null;
  plansError: boolean;
  plansLoading: boolean;
  managementUrl: string | null;
};

export type ProState = ProView & {
  storeConnected: boolean;
  buildMode: BuildMode;
  plans: Plan[] | null;
  plansError: boolean;
  plansLoading: boolean;
  /** Where to manage the subscription (RevenueCat's URL, or Google Play's page). */
  managementUrl: string;
  /** What the store itself says (purchase date, billing problem), whatever the server says. */
  storeEntitlement: StoreEntitlement;
};

let store: StoreState = { entitlement: NO_STORE, plans: null, plansError: false, plansLoading: false, managementUrl: null };
let combined: ProState | null = null;
const listeners = new Set<() => void>();
let expiryTimer: ReturnType<typeof setTimeout> | null = null;

function compute(): ProState {
  const account = getAccountState();
  const view = resolveProView({
    mode: buildMode,
    cached: cachedPlan(account),
    sessionUserId: account.session?.userId ?? null,
    store: store.entitlement,
    deviceNow: Date.now(),
    disabled: !!account.disabled,
  });
  return {
    ...view,
    storeConnected,
    buildMode,
    plans: store.plans,
    plansError: store.plansError,
    plansLoading: store.plansLoading,
    managementUrl: store.managementUrl ?? PLAY_SUBSCRIPTIONS_URL,
    storeEntitlement: store.entitlement,
  };
}

function sameState(a: ProState, b: ProState): boolean {
  return (Object.keys(a) as (keyof ProState)[]).every((k) => a[k] === b[k]);
}

/** Re-evaluates Pro and wakes the screens when anything they show changed. */
function recompute() {
  const next = compute();
  if (!combined || !sameState(combined, next)) {
    combined = next;
    listeners.forEach((l) => l());
  }
  // The cached plan stops counting at a known moment: look again then.
  if (expiryTimer) clearTimeout(expiryTimer);
  expiryTimer = null;
  const until = serverPlanValidUntil(cachedPlan(getAccountState()));
  if (until != null && until > Date.now()) {
    expiryTimer = setTimeout(recompute, Math.min(until - Date.now() + 1000, 2_000_000_000));
  }
}

let accountWatched = false;

function current(): ProState {
  if (!accountWatched) {
    accountWatched = true;
    subscribeAccount(recompute);
  }
  if (!combined) combined = compute();
  return combined;
}

function setStore(change: Partial<StoreState>) {
  store = { ...store, ...change };
  recompute();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * `{ isPro, plan, source, expiresAt, willRenew, trial, status, storeConnected, plans, plansError, … }`
 * (7.4). isPro is the union of the server's cached plan and the store.
 */
export function usePro(): ProState {
  return useSyncExternalStore(subscribe, current);
}

export function isPro(): boolean {
  return current().isPro;
}

export function getProState(): ProState {
  return current();
}

// ---- RevenueCat ----

/** RevenueCat's current app user id (ours after logIn, anonymous before). */
let storeUserId: string | null = null;

function fromCustomer(info: CustomerInfo) {
  const e = info.entitlements.active[ENTITLEMENT];
  const productId = e ? (e.productPlanIdentifier ? `${e.productIdentifier}:${e.productPlanIdentifier}` : e.productIdentifier) : null;
  setStore({
    managementUrl: info.managementURL,
    entitlement: e
      ? {
          active: true,
          appUserId: storeUserId,
          plan: planFromProductId(productId, e.expirationDate),
          productId,
          expiresAt: e.expirationDate,
          willRenew: e.willRenew,
          trial: e.periodType === 'TRIAL',
          billingIssue: e.billingIssueDetectedAt != null,
          purchasedAt: e.latestPurchaseDate ?? null,
        }
      : { ...NO_STORE, appUserId: storeUserId },
  });
}

function setStoreUser(id: string | null) {
  storeUserId = id;
  if (store.entitlement.appUserId !== id) setStore({ entitlement: { ...store.entitlement, appUserId: id } });
}

let identifyChain: Promise<void> = Promise.resolve();

/**
 * Logs RevenueCat in as our user (3.8): logIn(user.id), then the public_id attribute. Never
 * logOut(): that would make an anonymous user. Calls run one after another.
 */
export function identify(userId: string, publicId: string): Promise<void> {
  if (!API_KEY || !started) return Promise.resolve();
  identifyChain = identifyChain.then(async () => {
    try {
      if (storeUserId !== userId) {
        const { customerInfo } = await Purchases.logIn(userId);
        setStoreUser(userId);
        fromCustomer(customerInfo);
      }
      await Purchases.setAttributes({ public_id: publicId });
    } catch {
      // Offline: the next identity change or app start tries again.
    }
  });
  return identifyChain;
}

let started = false;
let wired = false;

/**
 * Starts everything about the plan once per app run: the account (guest or session, then /me),
 * the remote config, and the store, configured as our user when the session is known (3.8).
 */
export function startPro() {
  startAccount();
  startConfig();
  current();
  if (!wired) {
    wired = true;
    AppState.addEventListener('change', (s) => {
      if (s === 'active') recompute();
    });
  }
  if (started || !API_KEY) return;
  started = true;
  try {
    const session = buildMode === 'server' ? getSession() : null;
    if (session) Purchases.configure({ apiKey: API_KEY, appUserID: session.userId });
    else Purchases.configure({ apiKey: API_KEY });
    storeUserId = session?.userId ?? null;
    Purchases.addCustomerInfoUpdateListener(fromCustomer);
    Purchases.getAppUserID().then(setStoreUser, () => {});
    // Works offline too: the SDK keeps the last known purchases.
    Purchases.getCustomerInfo().then(fromCustomer, () => {});
    if (buildMode === 'server') {
      onIdentity(({ userId, publicId }) => void identify(userId, publicId));
      if (session) void identify(session.userId, session.publicId);
    }
  } catch {
    started = false;
  }
}

const PLAN_TYPES: Partial<Record<PACKAGE_TYPE, PlanType>> = {
  [PACKAGE_TYPE.ANNUAL]: 'annual',
  [PACKAGE_TYPE.MONTHLY]: 'monthly',
  [PACKAGE_TYPE.LIFETIME]: 'lifetime',
};

const DAYS: Partial<Record<PERIOD_UNIT, number>> = {
  [PERIOD_UNIT.DAY]: 1,
  [PERIOD_UNIT.WEEK]: 7,
  [PERIOD_UNIT.MONTH]: 30,
  [PERIOD_UNIT.YEAR]: 365,
};

function toPlan(pkg: PurchasesPackage): Plan | null {
  const type = PLAN_TYPES[pkg.packageType];
  if (!type) return null;
  // Google Play returns only the offers this user may take: a free phase means the trial is theirs.
  const free = pkg.product.defaultOption?.freePhase?.billingPeriod;
  return {
    type,
    price: pkg.product.priceString,
    amount: pkg.product.price,
    currency: pkg.product.currencyCode,
    perMonth: type === 'annual' ? pkg.product.pricePerMonthString : null,
    trialDays: free ? free.value * (DAYS[free.unit] ?? 0) || null : null,
    pkg,
  };
}

/** Loads the plans and prices from the store. */
export async function loadPlans(): Promise<void> {
  if (!API_KEY) return;
  startPro();
  setStore({ plansLoading: true, plansError: false });
  try {
    const offerings = await Purchases.getOfferings();
    const plans = (offerings.current?.availablePackages ?? []).map(toPlan).filter((p): p is Plan => p != null);
    const order: PlanType[] = ['annual', 'monthly', 'lifetime'];
    plans.sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
    setStore({ plans, plansError: plans.length === 0, plansLoading: false });
  } catch {
    setStore({ plansError: true, plansLoading: false });
  }
}

export type PurchaseResult = 'done' | 'cancelled' | 'pending' | 'failed';

/** Buys a plan; afterwards the server checks with RevenueCat (POST /plan/sync) and /me is read again. */
export async function buy(plan: Plan): Promise<PurchaseResult> {
  try {
    const { customerInfo } = await Purchases.purchasePackage(plan.pkg);
    fromCustomer(customerInfo);
    void syncPlan();
    return customerInfo.entitlements.active[ENTITLEMENT] != null ? 'done' : 'pending';
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) return 'cancelled';
    if (code === PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR) return 'pending';
    return 'failed';
  }
}

/**
 * Restores Pro bought on another phone or before reinstalling, then asks the server to check
 * (a restore moves the purchase to this user, 3.8). Resolves to whether Pro is active now.
 */
export async function restore(): Promise<boolean> {
  if (API_KEY) {
    try {
      fromCustomer(await Purchases.restorePurchases());
    } catch {
      // Reported by the result.
    }
  }
  await syncPlan();
  recompute();
  return current().isPro;
}
