// When an ad may show (docs/ads.md). Pure: no react-native imports, tested in __tests__/rules.test.ts.
// The alarm always wins: nothing here ever runs while a trip is running or the alarm rings, and
// the callers never wait on an ad before starting a trip.

/** Screens with an anchored banner at the bottom. */
export type BannerPlacement = 'map' | 'saved' | 'activity' | 'settings';

/** Routes where no full-screen ad may appear (the trip, the alarm, setup, onboarding, sign-in, buying). */
export const NO_FULLSCREEN_ROUTES: readonly string[] = [
  'Trip',
  'Arrived',
  'Setup',
  'Onboarding',
  'SignIn',
  'SignUp',
  'ForgotPassword',
  'Paywall',
  'Redeem',
];

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;

export const AD_RULES = {
  /** Interstitial: at most one every 30 min, and this many per day. */
  interstitialGapMs: 30 * MINUTE,
  interstitialsPerDay: 3,
  /** Arrived is left this long after it opened at the earliest (never over the first seconds). */
  interstitialAfterArrivedMs: 3_000,
  /** App-open: not on the first launches, at most once per 4 h. */
  appOpenFreeLaunches: 2,
  appOpenGapMs: 4 * HOUR,
  /** A warm return counts only after this long in the background (permission dialogs, share sheets). */
  appOpenMinBackgroundMs: 30_000,
  /** No full-screen ad right after another one closed (its own close returns the app to the foreground). */
  afterFullscreenMs: 60_000,
  /** The reward: no banners, app-open or interstitial ads for 24 h. */
  rewardMs: 24 * HOUR,
};

/** What the app remembers about ads (stored on the device). */
export type AdHistory = {
  launches: number;
  lastAppOpenAt: number | null;
  lastInterstitialAt: number | null;
  /** The local day (YYYY-MM-DD) interstitialsToday counts. */
  interstitialDay: string | null;
  interstitialsToday: number;
  lastFullscreenAt: number | null;
  /** The rewarded ad was watched: no other ads until then. */
  adFreeUntil: number | null;
};

export const EMPTY_HISTORY: AdHistory = {
  launches: 0,
  lastAppOpenAt: null,
  lastInterstitialAt: null,
  interstitialDay: null,
  interstitialsToday: 0,
  lastFullscreenAt: null,
  adFreeUntil: null,
};

/** Reads a stored history, keeping only sane fields. */
export function parseHistory(input: unknown): AdHistory {
  if (typeof input !== 'object' || input === null) return EMPTY_HISTORY;
  const r = input as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
  return {
    launches: num(r.launches) ?? 0,
    lastAppOpenAt: num(r.lastAppOpenAt),
    lastInterstitialAt: num(r.lastInterstitialAt),
    interstitialDay: typeof r.interstitialDay === 'string' ? r.interstitialDay : null,
    interstitialsToday: num(r.interstitialsToday) ?? 0,
    lastFullscreenAt: num(r.lastFullscreenAt),
    adFreeUntil: num(r.adFreeUntil),
  };
}

export function localDay(now: number): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Everything a decision needs about the app right now. */
export type AdContext = {
  /** monetization says ads (free_ads, or premium without Pro). */
  adsOn: boolean;
  /** UMP: consent gathered, or not needed (canRequestAds). */
  canRequestAds: boolean;
  tripRunning: boolean;
  alarmRinging: boolean;
  /** The route on top of the navigation. */
  route: string | undefined;
  now: number;
  history: AdHistory;
};

/** The reward is running: no banners and no unrewarded full-screen ads. */
export function adFree(history: AdHistory, now: number): boolean {
  return history.adFreeUntil != null && history.adFreeUntil > now;
}

function baseAllowed(ctx: AdContext): boolean {
  return ctx.adsOn && ctx.canRequestAds && !ctx.tripRunning && !ctx.alarmRinging && !adFree(ctx.history, ctx.now);
}

/** A banner on a browse screen (never on Trip, Arrived, Alarm, Setup, Onboarding, sign-in). */
export function bannerAllowed(
  ctx: Pick<AdContext, 'adsOn' | 'canRequestAds' | 'alarmRinging' | 'now'> & { adFreeUntil: number | null },
): boolean {
  return ctx.adsOn && ctx.canRequestAds && !ctx.alarmRinging && !(ctx.adFreeUntil != null && ctx.adFreeUntil > ctx.now);
}

function fullscreenRouteOk(route: string | undefined): boolean {
  return !route || !NO_FULLSCREEN_ROUTES.includes(route);
}

function afterLastFullscreen(h: AdHistory, now: number): boolean {
  return h.lastFullscreenAt == null || now - h.lastFullscreenAt >= AD_RULES.afterFullscreenMs;
}

export function interstitialsLeftToday(h: AdHistory, now: number): number {
  const today = h.interstitialDay === localDay(now) ? h.interstitialsToday : 0;
  return Math.max(0, AD_RULES.interstitialsPerDay - today);
}

/**
 * The interstitial when Arrived is left after a trip: never over the alarm, never in Arrived's
 * first seconds, once per 30 min and a few per day. `route` is where the user goes (the map).
 */
export function canShowInterstitial(ctx: AdContext & { arrivedOpenForMs: number }): boolean {
  if (!baseAllowed(ctx) || !fullscreenRouteOk(ctx.route)) return false;
  if (ctx.arrivedOpenForMs < AD_RULES.interstitialAfterArrivedMs) return false;
  const h = ctx.history;
  if (h.lastInterstitialAt != null && ctx.now - h.lastInterstitialAt < AD_RULES.interstitialGapMs) return false;
  if (!afterLastFullscreen(h, ctx.now)) return false;
  return interstitialsLeftToday(h, ctx.now) > 0;
}

/**
 * The app-open ad, on a cold start or a return to the foreground: never with a trip running, the
 * alarm ringing, setup/permissions or onboarding open, on the first 2 launches, or within 4 h.
 */
export function canShowAppOpen(ctx: AdContext & { coldStart: boolean; backgroundMs: number }): boolean {
  if (!baseAllowed(ctx) || !fullscreenRouteOk(ctx.route)) return false;
  const h = ctx.history;
  if (h.launches <= AD_RULES.appOpenFreeLaunches) return false;
  if (!ctx.coldStart && ctx.backgroundMs < AD_RULES.appOpenMinBackgroundMs) return false;
  if (h.lastAppOpenAt != null && ctx.now - h.lastAppOpenAt < AD_RULES.appOpenGapMs) return false;
  return afterLastFullscreen(h, ctx.now);
}

/** The rewarded ad can be offered (the user asks for it; only the trip and alarm block it). */
export function canOfferReward(ctx: Pick<AdContext, 'adsOn' | 'canRequestAds' | 'tripRunning' | 'alarmRinging'>): boolean {
  return ctx.adsOn && ctx.canRequestAds && !ctx.tripRunning && !ctx.alarmRinging;
}

// ---- Updating the history ----

export function countLaunch(h: AdHistory): AdHistory {
  return { ...h, launches: h.launches + 1 };
}

export function recordInterstitial(h: AdHistory, now: number): AdHistory {
  const day = localDay(now);
  const today = h.interstitialDay === day ? h.interstitialsToday : 0;
  return { ...h, lastInterstitialAt: now, interstitialDay: day, interstitialsToday: today + 1, lastFullscreenAt: now };
}

export function recordAppOpen(h: AdHistory, now: number): AdHistory {
  return { ...h, lastAppOpenAt: now, lastFullscreenAt: now };
}

/** The rewarded ad was watched to the end: 24 h without other ads (from now, or extended). */
export function grantReward(h: AdHistory, now: number): AdHistory {
  const from = adFree(h, now) ? (h.adFreeUntil as number) : now;
  return { ...h, adFreeUntil: Math.min(from + AD_RULES.rewardMs, now + 2 * AD_RULES.rewardMs), lastFullscreenAt: now };
}
