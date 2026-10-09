import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import Purchases, {
  PACKAGE_TYPE,
  PERIOD_UNIT,
  PURCHASES_ERROR_CODE,
  type CustomerInfo,
  type PurchasesPackage,
} from 'react-native-purchases';

import type { PlanType } from './plans';

/** The RevenueCat entitlement that unlocks Pro. */
const ENTITLEMENT = 'pro';

/**
 * RevenueCat public SDK keys, set at build time (EXPO_PUBLIC_ variables are compiled into the app;
 * public keys are meant to be). Without one, the build has no store connection and unlocks Pro,
 * so test builds can try everything.
 */
const API_KEY =
  Platform.OS === 'android' ? process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY : process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;

export const storeConnected = !!API_KEY;

export type Plan = {
  type: PlanType;
  /** Price as the store formats it, in the user's currency. */
  price: string;
  /** For the yearly plan: what it comes to per month. */
  perMonth: string | null;
  /** Free trial before the first payment, if the store offers one to this user. */
  trialDays: number | null;
  pkg: PurchasesPackage;
};

export type ProState = {
  isPro: boolean;
  /** Plans from the store; null until loaded. */
  plans: Plan[] | null;
  plansError: boolean;
};

let state: ProState = { isPro: !storeConnected, plans: null, plansError: false };
const listeners = new Set<() => void>();

function setState(change: Partial<ProState>) {
  state = { ...state, ...change };
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePro(): ProState {
  return useSyncExternalStore(subscribe, () => state);
}

export function isPro(): boolean {
  return state.isPro;
}

function fromCustomer(info: CustomerInfo) {
  setState({ isPro: info.entitlements.active[ENTITLEMENT] != null });
}

let started = false;

/** Connects to the store once per app run and keeps the Pro state current. */
export function startPro() {
  if (started || !API_KEY) return;
  started = true;
  try {
    Purchases.configure({ apiKey: API_KEY });
    Purchases.addCustomerInfoUpdateListener(fromCustomer);
    // Works offline too: the SDK keeps the last known purchases.
    Purchases.getCustomerInfo().then(fromCustomer, () => {});
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
  const free = pkg.product.defaultOption?.freePhase?.billingPeriod;
  return {
    type,
    price: pkg.product.priceString,
    perMonth: type === 'annual' ? pkg.product.pricePerMonthString : null,
    trialDays: free ? free.value * (DAYS[free.unit] ?? 0) || null : null,
    pkg,
  };
}

/** Loads the plans and prices from the store. */
export async function loadPlans(): Promise<void> {
  if (!API_KEY) return;
  startPro();
  try {
    const offerings = await Purchases.getOfferings();
    const plans = (offerings.current?.availablePackages ?? []).map(toPlan).filter((p): p is Plan => p != null);
    const order: PlanType[] = ['annual', 'monthly', 'lifetime'];
    plans.sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
    setState({ plans, plansError: plans.length === 0 });
  } catch {
    setState({ plansError: true });
  }
}

export type PurchaseResult = 'done' | 'cancelled' | 'failed';

export async function buy(plan: Plan): Promise<PurchaseResult> {
  try {
    const { customerInfo } = await Purchases.purchasePackage(plan.pkg);
    fromCustomer(customerInfo);
    return state.isPro ? 'done' : 'failed';
  } catch (e) {
    const code = (e as { code?: string }).code;
    return code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR ? 'cancelled' : 'failed';
  }
}

/** Restores Pro bought on another phone or before reinstalling. Resolves to whether it is active. */
export async function restore(): Promise<boolean> {
  if (!API_KEY) return state.isPro;
  try {
    fromCustomer(await Purchases.restorePurchases());
  } catch {
    // Reported by the false result.
  }
  return state.isPro;
}
