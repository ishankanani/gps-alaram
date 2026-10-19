// AdMob ad unit ids (docs/ads.md). Google's official TEST ids unless the build sets the real ones
// in EXPO_PUBLIC_ADMOB_*. Pure (no react-native), so the choice is unit-tested.

export type AdFormat = 'banner' | 'interstitial' | 'rewarded' | 'appOpen';
export type AdPlatform = 'android' | 'ios';

/** Google's sample ad units: always serve test ads, safe to click. */
export const TEST_UNITS: Record<AdPlatform, Record<AdFormat, string>> = {
  android: {
    banner: 'ca-app-pub-3940256099942544/9214589741',
    interstitial: 'ca-app-pub-3940256099942544/1033173712',
    rewarded: 'ca-app-pub-3940256099942544/5224354917',
    appOpen: 'ca-app-pub-3940256099942544/9257395921',
  },
  ios: {
    banner: 'ca-app-pub-3940256099942544/2435281174',
    interstitial: 'ca-app-pub-3940256099942544/4411468910',
    rewarded: 'ca-app-pub-3940256099942544/1712485313',
    appOpen: 'ca-app-pub-3940256099942544/5575463023',
  },
};

const UNIT_RE = /^ca-app-pub-\d{16}\/\d{10}$/;

/** Each EXPO_PUBLIC_ variable is read by name so Expo can inline it at build time. */
const ENV: Record<AdPlatform, Record<AdFormat, string | undefined>> = {
  android: {
    banner: process.env.EXPO_PUBLIC_ADMOB_ANDROID_BANNER,
    interstitial: process.env.EXPO_PUBLIC_ADMOB_ANDROID_INTERSTITIAL,
    rewarded: process.env.EXPO_PUBLIC_ADMOB_ANDROID_REWARDED,
    appOpen: process.env.EXPO_PUBLIC_ADMOB_ANDROID_APP_OPEN,
  },
  ios: {
    banner: process.env.EXPO_PUBLIC_ADMOB_IOS_BANNER,
    interstitial: process.env.EXPO_PUBLIC_ADMOB_IOS_INTERSTITIAL,
    rewarded: process.env.EXPO_PUBLIC_ADMOB_IOS_REWARDED,
    appOpen: process.env.EXPO_PUBLIC_ADMOB_IOS_APP_OPEN,
  },
};

/** The unit to request: the configured one when it looks like an AdMob id, else Google's test unit. */
export function adUnitId(
  format: AdFormat,
  platform: AdPlatform,
  env: Record<AdPlatform, Record<AdFormat, string | undefined>> = ENV,
): string {
  const configured = env[platform][format]?.trim();
  return configured && UNIT_RE.test(configured) ? configured : TEST_UNITS[platform][format];
}

/** True while any unit is a test unit (shown in logs and the docs' launch checklist). */
export function usingTestUnits(platform: AdPlatform, env = ENV): boolean {
  return (['banner', 'interstitial', 'rewarded', 'appOpen'] as const).some((f) => adUnitId(f, platform, env) === TEST_UNITS[platform][f]);
}
