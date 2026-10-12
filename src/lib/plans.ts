import type { AlarmStrength } from '../../modules/trip-alarm/src';
import type { ProFeature } from '../api/types';

// What the free version includes, in one place. Plain values, no native imports, so tests can use them.
// The limits come from remote config (backend-spec 7.4); these are the built-in defaults.

/** Favourites the free version keeps by default; Pro has no limit. */
export const FREE_FAVOURITES = 3;
/** The free trial by default (config `trialDays`); the store decides who really gets one. */
export const TRIAL_DAYS = 7;

/** Why the paywall opened: it starts with the feature the user just tried. */
export type ProReason = 'heavy' | 'favourites' | 'offlineMap' | null;

export type PlanType = 'annual' | 'monthly' | 'lifetime';

/** @deprecated The paywall formats prices with src/lib/pricing.ts; only the pre-1.0 Pro screen uses this. */
export const FALLBACK_PRICES: Record<PlanType, string> = { annual: '€9.99', monthly: '€1.99', lifetime: '€14.99' };

export type PlanLimits = { freeFavourites: number };
export type ProFeatures = Record<ProFeature, boolean>;

/** What the gates use while no config is passed in: the built-in defaults, then the remote config. */
export type PlanRules = { limits: PlanLimits; proFeatures: ProFeatures };

export const DEFAULT_PLAN_RULES: PlanRules = {
  limits: { freeFavourites: FREE_FAVOURITES },
  proFeatures: { heavyAlarm: true, unlimitedFavourites: true, offlineMap: true },
};

let rules: PlanRules = DEFAULT_PLAN_RULES;

/** Called by the remote config store (src/api/config.ts) whenever the config changes. */
export function setPlanRules(next: PlanRules) {
  rules = { limits: { ...next.limits }, proFeatures: { ...next.proFeatures } };
}

/** The current limits and Pro features (remote config, or the defaults). */
export function planRules(): PlanRules {
  return rules;
}

/** Heavy sleeper needs Pro only while the config says so. */
export function strengthAllowed(strength: AlarmStrength, isPro: boolean, proFeatures: ProFeatures = rules.proFeatures): boolean {
  return isPro || strength !== 'heavy' || !proFeatures.heavyAlarm;
}

/** The alarm a trip really gets: without Pro, Heavy sleeper falls back to Normal. */
export function effectiveStrength(strength: AlarmStrength, isPro: boolean, proFeatures: ProFeatures = rules.proFeatures): AlarmStrength {
  return strengthAllowed(strength, isPro, proFeatures) ? strength : 'normal';
}

/** Free keeps `limits.freeFavourites` favourites, unless the config makes favourites free. */
export function canAddFavourite(
  count: number,
  isPro: boolean,
  limits: PlanLimits = rules.limits,
  proFeatures: ProFeatures = rules.proFeatures,
): boolean {
  return isPro || !proFeatures.unlimitedFavourites || count < limits.freeFavourites;
}

/** Offline maps need Pro only while the config says so. */
export function offlineMapAllowed(isPro: boolean, proFeatures: ProFeatures = rules.proFeatures): boolean {
  return isPro || !proFeatures.offlineMap;
}
