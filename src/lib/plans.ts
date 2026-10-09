import type { AlarmStrength } from '../../modules/trip-alarm/src';

// What the free version includes, in one place. Plain values, no native imports, so tests can use them.

/** Favourites the free version keeps; Pro has no limit. */
export const FREE_FAVOURITES = 3;

/** Why the paywall opened: it starts with the feature the user just tried. */
export type ProReason = 'heavy' | 'favourites' | 'offlineMap' | null;

export type PlanType = 'annual' | 'monthly' | 'lifetime';

/** Shown until the store has answered, and in builds without a store connection. */
export const FALLBACK_PRICES: Record<PlanType, string> = { annual: '€9.99', monthly: '€1.99', lifetime: '€14.99' };
export const TRIAL_DAYS = 7;

export function strengthAllowed(strength: AlarmStrength, isPro: boolean): boolean {
  return isPro || strength !== 'heavy';
}

/** The alarm a trip really gets: without Pro, Heavy sleeper falls back to Normal. */
export function effectiveStrength(strength: AlarmStrength, isPro: boolean): AlarmStrength {
  return strengthAllowed(strength, isPro) ? strength : 'normal';
}

export function canAddFavourite(count: number, isPro: boolean): boolean {
  return isPro || count < FREE_FAVOURITES;
}
