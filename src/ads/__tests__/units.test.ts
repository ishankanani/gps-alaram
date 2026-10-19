import { describe, expect, it } from 'vitest';

import { adUnitId, TEST_UNITS, usingTestUnits } from '../units';

const none = {
  android: { banner: undefined, interstitial: undefined, rewarded: undefined, appOpen: undefined },
  ios: { banner: undefined, interstitial: undefined, rewarded: undefined, appOpen: undefined },
};

describe('ad unit ids', () => {
  it("uses Google's test units by default", () => {
    expect(adUnitId('banner', 'android', none)).toBe(TEST_UNITS.android.banner);
    expect(adUnitId('rewarded', 'ios', none)).toBe(TEST_UNITS.ios.rewarded);
    expect(usingTestUnits('android', none)).toBe(true);
  });

  it('uses a configured unit only when it looks like one', () => {
    const env = { ...none, android: { ...none.android, banner: ' ca-app-pub-1234567890123456/1234567890 ', interstitial: 'nope' } };
    expect(adUnitId('banner', 'android', env)).toBe('ca-app-pub-1234567890123456/1234567890');
    expect(adUnitId('interstitial', 'android', env)).toBe(TEST_UNITS.android.interstitial);
  });

  it('the test units are Google’s sample publisher', () => {
    for (const platform of ['android', 'ios'] as const) {
      for (const id of Object.values(TEST_UNITS[platform])) expect(id.startsWith('ca-app-pub-3940256099942544/')).toBe(true);
    }
  });
});
