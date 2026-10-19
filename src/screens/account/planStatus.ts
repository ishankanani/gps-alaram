// The words for the plan the user has, by source (ui-direction-a 4.3 "Account" plan card, the
// critiques' cancelled/paused/trial rows, and backend-spec 7.4 for the paywall's current plan).
import type { Entitlement, RemoteConfig } from '../../api/types';
import type { Lang, T } from '../../i18n';
import { hasBillingProblem } from '../../lib/entitlement';
import { featureUnlocked } from '../../lib/monetization';
import { formatPrice } from '../../lib/pricing';
import type { ProState } from '../../lib/pro';
import { formatDate, planName } from './shared';

export type PlanAction = 'getPro' | 'manage' | 'resubscribe' | 'fixBilling' | 'seePlans';

export type PlanStatus = {
  title: string;
  badge: 'free' | 'pro' | 'lifetime';
  line: string;
  /** bodyS under the line ("No payment needed."). */
  note: string | null;
  /** A warning Banner inside the card (billing problem). */
  warning: string | null;
  action: { kind: PlanAction; label: string } | null;
};

/** The store's yearly price for "then €9.99 a year": the store's string when loaded, else the table's. */
export function renewalPrice(pro: ProState, config: RemoteConfig, lang: Lang, tr: T): string | null {
  const plan = pro.plan === 'monthly' ? 'monthly' : 'yearly';
  const store = pro.plans?.find((p) => p.type === (plan === 'yearly' ? 'annual' : 'monthly'));
  const price = store?.price ?? formatPrice(plan === 'yearly' ? config.prices.yearly : config.prices.monthly, config.prices, lang);
  return tr(plan === 'yearly' ? 'paywall.priceYear' : 'paywall.priceMonth', { price });
}

/** Whether "7 days free" may be promised: the store offers this user a trial, or (no store) config says so. */
export function trialOffer(pro: ProState, config: RemoteConfig): number | null {
  if (pro.storeConnected) {
    const days = pro.plans?.find((p) => p.type === 'annual')?.trialDays ?? null;
    return days && days > 0 ? days : null;
  }
  return config.trialDays > 0 ? config.trialDays : null;
}

function lifetimeSince(pro: ProState, entitlements: Entitlement[] | undefined): string | null {
  const fromServer = entitlements?.find((e) => e.source === 'store' && e.plan === 'lifetime')?.startsAt;
  return fromServer ?? pro.storeEntitlement.purchasedAt;
}

export function accountPlanStatus(input: {
  pro: ProState;
  config: RemoteConfig;
  entitlements: Entitlement[] | undefined;
  lang: Lang;
  tr: T;
}): PlanStatus {
  const { pro, config, entitlements, lang, tr } = input;
  const date = (iso: string | null) => formatDate(iso, lang);
  const pro0 = { title: tr('account.plan.pro'), badge: pro.plan === 'lifetime' ? ('lifetime' as const) : ('pro' as const), note: null, warning: null };

  if (pro.origin === 'build') return { ...pro0, badge: 'pro', line: tr('account.plan.testBuild'), action: null };

  if (!pro.isPro) {
    const favourites = !featureUnlocked('unlimitedFavourites', false, config.proFeatures)
      ? tr('account.plan.freeFavourites', { count: config.limits.freeFavourites })
      : tr('account.plan.freeFavouritesAll');
    const alarms = !featureUnlocked('heavyAlarm', false, config.proFeatures) ? tr('account.plan.freeAlarms') : tr('account.plan.freeAlarmsAll');
    const trial = trialOffer(pro, config);
    return {
      title: tr('account.plan.free'),
      badge: 'free',
      line: `${favourites} · ${alarms}`,
      note: null,
      warning: null,
      action: { kind: 'getPro', label: trial ? tr('account.plan.getProTrial', { days: trial }) : tr('account.plan.getPro') },
    };
  }

  if (pro.source === 'grant') {
    const lifetime = pro.plan === 'lifetime' || pro.expiresAt == null;
    return {
      ...pro0,
      line: lifetime ? tr('account.plan.giftLifetime') : tr('account.plan.gift', { date: date(pro.expiresAt) }),
      note: tr('account.plan.noPayment'),
      action: lifetime ? null : { kind: 'seePlans', label: tr('account.plan.seePlans') },
    };
  }

  if (pro.source === 'promo') {
    const lifetime = pro.plan === 'lifetime' || pro.expiresAt == null;
    const code = pro.promoCode ?? '';
    return {
      ...pro0,
      line: lifetime ? tr('account.plan.codeLifetime', { code }) : tr('account.plan.code', { code, date: date(pro.expiresAt) }),
      note: tr('account.plan.noPayment'),
      action: lifetime ? null : { kind: 'seePlans', label: tr('account.plan.seePlans') },
    };
  }

  // The store (Google Play).
  if (pro.plan === 'lifetime') {
    const since = lifetimeSince(pro, entitlements);
    return { ...pro0, line: since ? tr('account.plan.lifetimeSince', { date: date(since) }) : tr('account.plan.lifetime'), action: null };
  }
  const name = planName(pro.plan, tr);
  if (hasBillingProblem(pro)) {
    return {
      ...pro0,
      line: tr('account.plan.renews', { plan: name, date: date(pro.expiresAt) }),
      warning: tr('account.plan.billing'),
      action: { kind: 'fixBilling', label: tr('account.plan.fixInPlay') },
    };
  }
  if (pro.status === 'paused') return { ...pro0, line: tr('account.plan.paused'), action: { kind: 'manage', label: tr('account.plan.manage') } };
  if (pro.trial) {
    const price = renewalPrice(pro, config, lang, tr);
    return {
      ...pro0,
      line: price && pro.willRenew ? tr('account.plan.trialThen', { date: date(pro.expiresAt), price }) : tr('account.plan.trial', { date: date(pro.expiresAt) }),
      action: { kind: 'manage', label: tr('account.plan.manage') },
    };
  }
  if (pro.willRenew) {
    return { ...pro0, line: tr('account.plan.renews', { plan: name, date: date(pro.expiresAt) }), action: { kind: 'manage', label: tr('account.plan.manage') } };
  }
  return { ...pro0, line: tr('account.plan.ends', { date: date(pro.expiresAt) }), action: { kind: 'resubscribe', label: tr('account.plan.resubscribe') } };
}

/** The paywall's "current plan" card (7.4). */
export type CurrentPlan = {
  kind: 'store' | 'gift' | 'build';
  title: string;
  line: string | null;
  billing: boolean;
  /** Gifts and codes that end: the plans can still be opened ("See plans"). */
  canSeePlans: boolean;
};

export function paywallCurrentPlan(pro: ProState, lang: Lang, tr: T): CurrentPlan {
  const date = (iso: string | null) => formatDate(iso, lang);
  if (pro.origin === 'build') return { kind: 'build', title: tr('paywall.haveTitle'), line: tr('paywall.testUnlocked'), billing: false, canSeePlans: false };
  const lifetime = pro.plan === 'lifetime' || pro.expiresAt == null;
  if (pro.source === 'grant') {
    return {
      kind: 'gift',
      title: lifetime ? tr('paywall.giftLifetimeTitle') : tr('paywall.giftTitle', { date: date(pro.expiresAt) }),
      line: lifetime ? tr('paywall.giftFromLifetime') : tr('paywall.giftFrom', { date: date(pro.expiresAt) }),
      billing: false,
      canSeePlans: !lifetime,
    };
  }
  if (pro.source === 'promo') {
    const code = pro.promoCode ?? '';
    return {
      kind: 'gift',
      title: lifetime ? tr('paywall.giftLifetimeTitle') : tr('paywall.giftTitle', { date: date(pro.expiresAt) }),
      line: lifetime ? tr('paywall.codeLifetime', { code }) : tr('paywall.codeTitle', { code, date: date(pro.expiresAt) }),
      billing: false,
      canSeePlans: !lifetime,
    };
  }
  let line: string;
  if (pro.plan === 'lifetime') line = tr('paywall.haveLifetime');
  else if (hasBillingProblem(pro)) line = tr('paywall.haveBillingBody');
  else if (pro.status === 'paused') line = tr('paywall.havePaused');
  else if (pro.trial) line = tr('paywall.haveTrial', { date: date(pro.expiresAt) });
  else if (pro.willRenew) line = tr('paywall.haveRenews', { plan: planName(pro.plan, tr), date: date(pro.expiresAt) });
  else line = tr('paywall.haveEnds', { plan: planName(pro.plan, tr), date: date(pro.expiresAt) });
  return {
    kind: 'store',
    title: hasBillingProblem(pro) ? tr('paywall.haveBilling') : tr('paywall.haveTitle'),
    line,
    billing: hasBillingProblem(pro),
    canSeePlans: false,
  };
}
