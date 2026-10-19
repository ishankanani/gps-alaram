import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import mobileAds, {
  AdEventType,
  AdsConsent,
  AdsConsentPrivacyOptionsRequirementStatus,
  AppOpenAd,
  InterstitialAd,
  RewardedAd,
  RewardedAdEventType,
  type RequestOptions,
} from 'react-native-google-mobile-ads';

import { adsEnabled, onMonetizationChange } from '../lib/monetization';
import { getProState } from '../lib/pro';
import { currentRouteName } from '../navigation/ref';
import {
  adFree,
  bannerAllowed,
  canOfferReward,
  canShowAppOpen,
  canShowInterstitial,
  countLaunch,
  EMPTY_HISTORY,
  grantReward,
  HOUR,
  parseHistory,
  recordAppOpen,
  recordInterstitial,
  type AdContext,
  type AdHistory,
} from './rules';
import { adUnitId, type AdFormat } from './units';

// The ads at run time (docs/ads.md): UMP consent first, then the SDK, then preloaded full-screen
// ads. Everything is fire-and-forget and silent on failure; nothing here is ever awaited by the
// trip or the alarm.

const platform = Platform.OS === 'ios' ? 'ios' : 'android';

// ---- State the screens read ----

export type AdsState = {
  /** UMP finished and ads may be requested. */
  canRequestAds: boolean;
  /** Request non-personalised ads only (no consent to personalise, or UMP failed). */
  nonPersonalized: boolean;
  /** UMP says the app must offer "Privacy choices" (EEA, UK). */
  privacyOptionsRequired: boolean;
  /** A rewarded ad is loaded and may be offered. */
  rewardReady: boolean;
  /** The reward runs until then (no banners or other ads). */
  adFreeUntil: number | null;
  tripRunning: boolean;
  alarmRinging: boolean;
  /** Bumps when monetization or Pro change, so hooks look again. */
  version: number;
};

let state: AdsState = {
  canRequestAds: false,
  nonPersonalized: true,
  privacyOptionsRequired: false,
  rewardReady: false,
  adFreeUntil: null,
  tripRunning: false,
  alarmRinging: false,
  version: 0,
};
const listeners = new Set<() => void>();

function setState(change: Partial<AdsState>) {
  const next = { ...state, ...change };
  if ((Object.keys(next) as (keyof AdsState)[]).every((k) => next[k] === state[k])) return;
  state = next;
  listeners.forEach((l) => l());
}

export function subscribeAds(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getAdsState(): AdsState {
  return state;
}

// ---- History on the device ----

let history: AdHistory = EMPTY_HISTORY;

function historyFile() {
  return new File(Paths.document, 'stopwake-ads.json');
}

function loadHistory(): AdHistory {
  try {
    const f = historyFile();
    return f.exists ? parseHistory(JSON.parse(f.textSync())) : EMPTY_HISTORY;
  } catch {
    return EMPTY_HISTORY;
  }
}

function setHistory(next: AdHistory) {
  history = next;
  setState({ adFreeUntil: next.adFreeUntil });
  try {
    const f = historyFile();
    if (!f.exists) f.create();
    f.write(JSON.stringify(next));
  } catch {
    // Not saved: the caps start over next launch, never worse than that.
  }
}

// ---- Who may see ads ----

/** monetization: free_ads, or premium without Pro. */
export function adsOn(): boolean {
  try {
    return adsEnabled(getProState().isPro);
  } catch {
    return false;
  }
}

function context(route: string | undefined = currentRouteName()): AdContext {
  return {
    adsOn: adsOn(),
    canRequestAds: state.canRequestAds,
    tripRunning: state.tripRunning,
    alarmRinging: state.alarmRinging,
    route,
    now: Date.now(),
    history,
  };
}

/** Banners may show now (the screens choose where: Map browse, Saved, Activity, Settings). */
export function bannersOn(): boolean {
  return bannerAllowed({ ...context(), adFreeUntil: history.adFreeUntil });
}

export function requestOptions(): RequestOptions {
  return { requestNonPersonalizedAdsOnly: state.nonPersonalized };
}

export function bannerUnitId(): string {
  return adUnitId('banner', platform);
}

/** The trip provider's facts (AdsController): a running trip or a ringing alarm stops every ad. */
export function setTripFacts(tripRunning: boolean, alarmRinging: boolean) {
  setState({ tripRunning, alarmRinging });
}

// ---- Full-screen ads, preloaded ----

type FullscreenAd = InterstitialAd | AppOpenAd | RewardedAd;

/** One preloaded ad of a format: loads again after it closed or failed (with a growing pause). */
class Slot<T extends FullscreenAd> {
  ad: T | null = null;
  loaded = false;
  loadedAt = 0;
  showing = false;
  private failures = 0;
  private retry: ReturnType<typeof setTimeout> | null = null;
  onClosed: (() => void) | null = null;
  onLoaded: (() => void) | null = null;

  constructor(
    private format: AdFormat,
    private create: (unit: string, options: RequestOptions) => T,
  ) {}

  load() {
    if (!adsOn() || !state.canRequestAds || this.showing) return;
    if (this.retry) clearTimeout(this.retry);
    this.retry = null;
    try {
      this.ad?.removeAllListeners();
      const ad = this.create(adUnitId(this.format, platform), requestOptions());
      this.ad = ad;
      this.loaded = false;
      // The three classes share these events; their listener types differ only in the payload.
      const on = (type: AdEventType, listener: () => void) => (ad as InterstitialAd).addAdEventListener(type, listener);
      on(AdEventType.LOADED, () => {
        this.loaded = true;
        this.loadedAt = Date.now();
        this.failures = 0;
        this.changed();
        this.onLoaded?.();
      });
      on(AdEventType.ERROR, () => {
        this.loaded = false;
        this.showing = false;
        this.changed();
        this.failures += 1;
        // 1, 2, 4 … minutes, at most 30.
        this.retry = setTimeout(() => this.load(), Math.min(30, 2 ** (this.failures - 1)) * 60_000);
      });
      on(AdEventType.CLOSED, () => {
        this.showing = false;
        this.loaded = false;
        this.changed();
        this.onClosed?.();
        this.load();
      });
      ad.load();
    } catch {
      this.loaded = false;
    }
  }

  /** Loaded and fresh (Google: app-open ads expire after 4 h; others are kept 1 h here). */
  ready(maxAgeMs: number): boolean {
    if (!this.loaded || !this.ad) return false;
    if (Date.now() - this.loadedAt > maxAgeMs) {
      this.load();
      return false;
    }
    return true;
  }

  show(): boolean {
    if (!this.ad || !this.loaded || this.showing) return false;
    this.showing = true;
    this.ad.show().catch(() => {
      this.showing = false;
      this.onClosed?.();
      this.load();
    });
    return true;
  }

  private changed() {
    if (this.format === 'rewarded') setState({ rewardReady: this.loaded });
  }
}

const interstitial = new Slot('interstitial', (unit, options) => InterstitialAd.createForAdRequest(unit, options));
const appOpen = new Slot('appOpen', (unit, options) => AppOpenAd.createForAdRequest(unit, options));
const rewarded = new Slot('rewarded', (unit, options) => RewardedAd.createForAdRequest(unit, options));

function preload() {
  interstitial.load();
  appOpen.load();
  rewarded.load();
}

// ---- Start: count the launch, consent, SDK, preload ----

let started = false;
let initialized = false;
const launchedAt = Date.now();
/** The cold start's app-open ad is still to be tried (within the first seconds only). */
let coldStartPending = true;
const COLD_START_WINDOW_MS = 8_000;

/** Once per app run, from App.tsx. Never awaited by anything. */
export function startAds() {
  if (started) return;
  started = true;
  setHistory(countLaunch(loadHistory()));
  onMonetizationChange(() => {
    setState({ version: state.version + 1 });
    void prepare();
  });
  setTimeout(() => (coldStartPending = false), COLD_START_WINDOW_MS);
  void prepare();
}

/** Called when Pro changes (premium mode): no requests for Pro users. */
export function proChanged() {
  setState({ version: state.version + 1 });
  void prepare();
}

let preparing = false;

async function prepare() {
  if (preparing || !adsOn()) return;
  preparing = true;
  try {
    await gatherConsent();
    if (!state.canRequestAds) return;
    if (!initialized) {
      await mobileAds().initialize();
      initialized = true;
    }
    preload();
  } catch {
    // No ads this run; the alarm never notices.
  } finally {
    preparing = false;
  }
}

/** Google UMP: asks in the EEA/UK when needed; personalised ads only with consent. */
async function gatherConsent() {
  try {
    const info = await AdsConsent.gatherConsent();
    let personalised = false;
    try {
      const gdpr = await AdsConsent.getGdprApplies();
      personalised = !gdpr || (await AdsConsent.getUserChoices()).selectPersonalisedAds;
    } catch {
      personalised = false;
    }
    setState({
      canRequestAds: info.canRequestAds,
      nonPersonalized: !personalised,
      privacyOptionsRequired: info.privacyOptionsRequirementStatus === AdsConsentPrivacyOptionsRequirementStatus.REQUIRED,
    });
  } catch {
    // Offline or the form failed: what UMP knew from the last run, non-personalised only.
    try {
      const info = await AdsConsent.getConsentInfo();
      setState({
        canRequestAds: info.canRequestAds,
        nonPersonalized: true,
        privacyOptionsRequired: info.privacyOptionsRequirementStatus === AdsConsentPrivacyOptionsRequirementStatus.REQUIRED,
      });
    } catch {
      setState({ canRequestAds: false, nonPersonalized: true });
    }
  }
}

/** Settings › Privacy choices (UMP's privacy options form). */
export async function showPrivacyOptions(): Promise<void> {
  try {
    await AdsConsent.showPrivacyOptionsForm();
  } catch {
    // Nothing to show.
  }
  await gatherConsent();
  if (state.canRequestAds) void prepare();
}

// ---- Showing ----

/**
 * Arrived was left after a trip (the user goes back to the map): the interstitial, if the caps
 * allow and one is loaded. Never waits for anything; the navigation has already happened.
 */
export function maybeShowInterstitial(arrivedOpenForMs: number) {
  try {
    if (!canShowInterstitial({ ...context('MapTab'), arrivedOpenForMs })) return;
    if (!interstitial.ready(HOUR)) return;
    // After the screen transition, and only if nothing started meanwhile.
    setTimeout(() => {
      if (!canShowInterstitial({ ...context(), arrivedOpenForMs })) return;
      if (interstitial.show()) setHistory(recordInterstitial(history, Date.now()));
    }, 600);
  } catch {
    // Silent.
  }
}

/** A cold start (once the ad loaded) or a return to the foreground after `backgroundMs`. */
export function maybeShowAppOpen(coldStart: boolean, backgroundMs: number) {
  try {
    if (interstitial.showing || rewarded.showing || appOpen.showing) return;
    if (!canShowAppOpen({ ...context(), coldStart, backgroundMs })) return;
    if (!appOpen.ready(4 * HOUR)) return;
    if (appOpen.show()) setHistory(recordAppOpen(history, Date.now()));
  } catch {
    // Silent.
  }
}

appOpen.onLoaded = () => {
  if (coldStartPending && Date.now() - launchedAt < COLD_START_WINDOW_MS) {
    coldStartPending = false;
    maybeShowAppOpen(true, 0);
  }
};

export type RewardResult = 'rewarded' | 'closed' | 'unavailable';

/**
 * The rewarded ad, when the user asks for it: watched to the end, 24 h without banners or other
 * ads. (In premium mode the same call can unlock something else later.)
 */
export function showRewarded(): Promise<RewardResult> {
  return new Promise((resolve) => {
    try {
      if (!canOfferReward(context()) || !rewarded.ready(HOUR) || !rewarded.ad) return resolve('unavailable');
      let earned = false;
      const ad = rewarded.ad;
      const off = ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
        earned = true;
        setHistory(grantReward(history, Date.now()));
      });
      rewarded.onClosed = () => {
        off();
        rewarded.onClosed = null;
        resolve(earned ? 'rewarded' : 'closed');
      };
      if (!rewarded.show()) {
        off();
        rewarded.onClosed = null;
        resolve('unavailable');
      }
    } catch {
      resolve('unavailable');
    }
  });
}

/** The reward is running now. */
export function isAdFree(): boolean {
  return adFree(history, Date.now());
}
