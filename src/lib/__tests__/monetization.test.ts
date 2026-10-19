import { afterEach, describe, expect, it } from 'vitest';

import {
  adsEnabled,
  featureUnlocked,
  MONETIZATION_MODE,
  monetizationMode,
  onMonetizationChange,
  parseMode,
  premiumEnabled,
  setRemoteMonetizationMode,
} from '../monetization';
import { canAddFavourite, effectiveStrength, offlineMapAllowed, strengthAllowed } from '../plans';

const ALL_PRO = { heavyAlarm: true, unlimitedFavourites: true, offlineMap: true };

afterEach(() => setRemoteMonetizationMode(null));

describe('monetization switch', () => {
  it('defaults to free with ads', () => {
    expect(MONETIZATION_MODE).toBe(parseMode(process.env.EXPO_PUBLIC_MONETIZATION) ?? 'free_ads');
    expect(monetizationMode()).toBe(MONETIZATION_MODE);
  });

  it('parses only the two modes', () => {
    expect(parseMode('premium')).toBe('premium');
    expect(parseMode('free_ads')).toBe('free_ads');
    expect(parseMode('pro')).toBeNull();
    expect(parseMode(undefined)).toBeNull();
  });

  it('lets the remote config override the build, and falls back on anything unknown', () => {
    const seen: string[] = [];
    setRemoteMonetizationMode('free_ads');
    expect(premiumEnabled()).toBe(false);
    const off = onMonetizationChange(() => seen.push(monetizationMode()));
    setRemoteMonetizationMode('premium');
    expect(premiumEnabled()).toBe(true);
    setRemoteMonetizationMode('premium');
    setRemoteMonetizationMode('nonsense');
    expect(monetizationMode()).toBe('free_ads');
    off();
    expect(seen).toEqual(['premium', 'free_ads']);
  });
});

describe('featureUnlocked', () => {
  it('unlocks every Pro feature for everyone in free_ads', () => {
    for (const f of ['heavyAlarm', 'unlimitedFavourites', 'offlineMap'] as const) {
      expect(featureUnlocked(f, false, ALL_PRO, 'free_ads')).toBe(true);
    }
  });

  it('keeps the premium gates', () => {
    expect(featureUnlocked('heavyAlarm', false, ALL_PRO, 'premium')).toBe(false);
    expect(featureUnlocked('heavyAlarm', true, ALL_PRO, 'premium')).toBe(true);
    expect(featureUnlocked('offlineMap', false, { ...ALL_PRO, offlineMap: false }, 'premium')).toBe(true);
    expect(featureUnlocked('offlineMap', false, undefined, 'premium')).toBe(false);
  });

  it('drives the plan gates', () => {
    expect(strengthAllowed('heavy', false, ALL_PRO)).toBe(true);
    expect(effectiveStrength('heavy', false, ALL_PRO)).toBe('heavy');
    expect(canAddFavourite(50, false)).toBe(true);
    expect(offlineMapAllowed(false, ALL_PRO)).toBe(true);
    setRemoteMonetizationMode('premium');
    expect(strengthAllowed('heavy', false, ALL_PRO)).toBe(false);
    expect(canAddFavourite(50, false)).toBe(false);
    expect(offlineMapAllowed(false, ALL_PRO)).toBe(false);
  });
});

describe('adsEnabled', () => {
  it('shows ads to everyone in free_ads, and only to free users in premium', () => {
    expect(adsEnabled(false, 'free_ads')).toBe(true);
    expect(adsEnabled(true, 'free_ads')).toBe(true);
    expect(adsEnabled(false, 'premium')).toBe(true);
    expect(adsEnabled(true, 'premium')).toBe(false);
  });
});
