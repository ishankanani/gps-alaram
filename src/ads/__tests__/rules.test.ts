import { describe, expect, it } from 'vitest';

import {
  AD_RULES,
  adFree,
  bannerAllowed,
  canOfferReward,
  canShowAppOpen,
  canShowInterstitial,
  countLaunch,
  EMPTY_HISTORY,
  grantReward,
  HOUR,
  interstitialsLeftToday,
  MINUTE,
  NO_FULLSCREEN_ROUTES,
  parseHistory,
  recordAppOpen,
  recordInterstitial,
  type AdContext,
  type AdHistory,
} from '../rules';

const NOW = new Date(2026, 9, 19, 12, 0, 0).getTime();
const veteran: AdHistory = { ...EMPTY_HISTORY, launches: 10 };

function ctx(change: Partial<AdContext> = {}): AdContext {
  return { adsOn: true, canRequestAds: true, tripRunning: false, alarmRinging: false, route: 'MapTab', now: NOW, history: veteran, ...change };
}

describe('banner', () => {
  const base = { adsOn: true, canRequestAds: true, alarmRinging: false, now: NOW, adFreeUntil: null };
  it('shows when ads are on and consent allows', () => {
    expect(bannerAllowed(base)).toBe(true);
  });
  it('hides without consent, for Pro, while ringing and during the reward', () => {
    expect(bannerAllowed({ ...base, canRequestAds: false })).toBe(false);
    expect(bannerAllowed({ ...base, adsOn: false })).toBe(false);
    expect(bannerAllowed({ ...base, alarmRinging: true })).toBe(false);
    expect(bannerAllowed({ ...base, adFreeUntil: NOW + 1 })).toBe(false);
    expect(bannerAllowed({ ...base, adFreeUntil: NOW - 1 })).toBe(true);
  });
});

describe('interstitial', () => {
  const open = AD_RULES.interstitialAfterArrivedMs;
  it('shows when Arrived is left after its first seconds', () => {
    expect(canShowInterstitial({ ...ctx(), arrivedOpenForMs: open })).toBe(true);
    expect(canShowInterstitial({ ...ctx(), arrivedOpenForMs: open - 1 })).toBe(false);
  });
  it('never over a trip or the alarm, or on blocked screens', () => {
    expect(canShowInterstitial({ ...ctx({ tripRunning: true }), arrivedOpenForMs: open })).toBe(false);
    expect(canShowInterstitial({ ...ctx({ alarmRinging: true }), arrivedOpenForMs: open })).toBe(false);
    for (const route of NO_FULLSCREEN_ROUTES) expect(canShowInterstitial({ ...ctx({ route }), arrivedOpenForMs: open })).toBe(false);
    expect(canShowInterstitial({ ...ctx({ adsOn: false }), arrivedOpenForMs: open })).toBe(false);
    expect(canShowInterstitial({ ...ctx({ canRequestAds: false }), arrivedOpenForMs: open })).toBe(false);
  });
  it('waits 30 minutes between interstitials', () => {
    const h = recordInterstitial(veteran, NOW - 29 * MINUTE);
    expect(canShowInterstitial({ ...ctx({ history: h }), arrivedOpenForMs: open })).toBe(false);
    const later = recordInterstitial(veteran, NOW - 31 * MINUTE);
    expect(canShowInterstitial({ ...ctx({ history: later }), arrivedOpenForMs: open })).toBe(true);
  });
  it('caps the day and starts over the next day', () => {
    let h = veteran;
    for (let i = 0; i < AD_RULES.interstitialsPerDay; i++) h = recordInterstitial(h, NOW - (5 - i) * HOUR + i);
    expect(interstitialsLeftToday(h, NOW)).toBe(0);
    expect(canShowInterstitial({ ...ctx({ history: h }), arrivedOpenForMs: open })).toBe(false);
    const tomorrow = NOW + 24 * HOUR;
    expect(interstitialsLeftToday(h, tomorrow)).toBe(AD_RULES.interstitialsPerDay);
    expect(canShowInterstitial({ ...ctx({ history: h, now: tomorrow }), arrivedOpenForMs: open })).toBe(true);
  });
});

describe('app-open', () => {
  const warm = { coldStart: false, backgroundMs: 10 * MINUTE };
  it('shows on a cold start or a real return to the foreground', () => {
    expect(canShowAppOpen({ ...ctx(), coldStart: true, backgroundMs: 0 })).toBe(true);
    expect(canShowAppOpen({ ...ctx(), ...warm })).toBe(true);
  });
  it('ignores short trips to the background (permission dialogs)', () => {
    expect(canShowAppOpen({ ...ctx(), coldStart: false, backgroundMs: AD_RULES.appOpenMinBackgroundMs - 1 })).toBe(false);
  });
  it('never on the first 2 launches', () => {
    let h = EMPTY_HISTORY;
    h = countLaunch(h);
    expect(canShowAppOpen({ ...ctx({ history: h }), ...warm })).toBe(false);
    h = countLaunch(h);
    expect(canShowAppOpen({ ...ctx({ history: h }), ...warm })).toBe(false);
    h = countLaunch(h);
    expect(canShowAppOpen({ ...ctx({ history: h }), ...warm })).toBe(true);
  });
  it('never with a trip running, the alarm ringing, onboarding or setup open', () => {
    expect(canShowAppOpen({ ...ctx({ tripRunning: true }), ...warm })).toBe(false);
    expect(canShowAppOpen({ ...ctx({ alarmRinging: true }), ...warm })).toBe(false);
    expect(canShowAppOpen({ ...ctx({ route: 'Onboarding' }), ...warm })).toBe(false);
    expect(canShowAppOpen({ ...ctx({ route: 'Setup' }), ...warm })).toBe(false);
    expect(canShowAppOpen({ ...ctx({ route: 'Trip' }), ...warm })).toBe(false);
  });
  it('at most once per 4 h, and not right after another full-screen ad', () => {
    const shown = recordAppOpen(veteran, NOW - 3 * HOUR);
    expect(canShowAppOpen({ ...ctx({ history: shown }), ...warm })).toBe(false);
    expect(canShowAppOpen({ ...ctx({ history: recordAppOpen(veteran, NOW - 4 * HOUR) }), ...warm })).toBe(true);
    const afterInterstitial = recordInterstitial(veteran, NOW - 30_000);
    expect(canShowAppOpen({ ...ctx({ history: afterInterstitial }), ...warm })).toBe(false);
  });
});

describe('reward', () => {
  it('gives 24 h without other ads, extending a running reward up to 48 h', () => {
    const h = grantReward(veteran, NOW);
    expect(h.adFreeUntil).toBe(NOW + 24 * HOUR);
    expect(adFree(h, NOW + 23 * HOUR)).toBe(true);
    expect(adFree(h, NOW + 24 * HOUR)).toBe(false);
    expect(canShowAppOpen({ ...ctx({ history: h, now: NOW + HOUR * 5 }), coldStart: true, backgroundMs: 0 })).toBe(false);
    expect(canShowInterstitial({ ...ctx({ history: h, now: NOW + HOUR }), arrivedOpenForMs: 10_000 })).toBe(false);
    expect(grantReward(grantReward(h, NOW), NOW).adFreeUntil).toBe(NOW + 48 * HOUR);
  });
  it('is offered whenever ads are on, except during a trip or the alarm', () => {
    const base = { adsOn: true, canRequestAds: true, tripRunning: false, alarmRinging: false };
    expect(canOfferReward(base)).toBe(true);
    expect(canOfferReward({ ...base, tripRunning: true })).toBe(false);
    expect(canOfferReward({ ...base, alarmRinging: true })).toBe(false);
    expect(canOfferReward({ ...base, adsOn: false })).toBe(false);
  });
});

describe('stored history', () => {
  it('keeps sane fields only', () => {
    expect(parseHistory(null)).toEqual(EMPTY_HISTORY);
    expect(parseHistory({ launches: 4, lastAppOpenAt: -5, adFreeUntil: 'x', interstitialDay: '2026-10-19' })).toEqual({
      ...EMPTY_HISTORY,
      launches: 4,
      interstitialDay: '2026-10-19',
    });
  });
});
