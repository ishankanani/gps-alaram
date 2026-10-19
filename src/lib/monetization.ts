import type { ProFeature } from '../api/types';

// The one switch between "free for everyone, with ads" and "Pro subscriptions" (docs/ads.md).
// Pure: no react-native imports, so Vitest can test it.
//
//   free_ads  every Pro feature is unlocked for everyone; the paywall, plan cards, "Restore
//             purchases", PRO badges and upsells are hidden; RevenueCat is not started; ads show.
//   premium   today's Pro behaviour (RevenueCat, paywall, gates); Pro users see no ads.
//
// Build-time: EXPO_PUBLIC_MONETIZATION=free_ads|premium (default free_ads). A remote override
// (setRemoteMonetizationMode, e.g. from the remote config) wins over the build value.

export type MonetizationMode = 'free_ads' | 'premium';

export function parseMode(value: unknown): MonetizationMode | null {
  return value === 'free_ads' || value === 'premium' ? value : null;
}

/** The build's mode, from EXPO_PUBLIC_MONETIZATION (anything unknown means free_ads). */
export const MONETIZATION_MODE: MonetizationMode = parseMode(process.env.EXPO_PUBLIC_MONETIZATION) ?? 'free_ads';

let remote: MonetizationMode | null = null;
const listeners = new Set<() => void>();

/** The remote config's `monetization` field (null or anything unknown: back to the build value). */
export function setRemoteMonetizationMode(value: unknown) {
  const next = parseMode(value);
  if (next === remote) return;
  remote = next;
  listeners.forEach((l) => l());
}

export function onMonetizationChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The mode in force now. */
export function monetizationMode(): MonetizationMode {
  return remote ?? MONETIZATION_MODE;
}

/** Pro can be bought: paywall, plan cards, Restore purchases, PRO badges, upsells, RevenueCat. */
export function premiumEnabled(mode: MonetizationMode = monetizationMode()): boolean {
  return mode === 'premium';
}

/**
 * The gate every Pro feature goes through. In free_ads everything is unlocked; in premium, a
 * feature is unlocked for Pro users, or for everyone while the config says it does not need Pro.
 */
export function featureUnlocked(
  feature: ProFeature,
  isPro: boolean,
  proFeatures?: Partial<Record<ProFeature, boolean>>,
  mode: MonetizationMode = monetizationMode(),
): boolean {
  if (!premiumEnabled(mode)) return true;
  if (isPro) return true;
  return proFeatures ? proFeatures[feature] === false : false;
}

/** Ads may be shown at all: always in free_ads; in premium only to users without Pro. */
export function adsEnabled(isPro: boolean, mode: MonetizationMode = monetizationMode()): boolean {
  return premiumEnabled(mode) ? !isPro : true;
}
