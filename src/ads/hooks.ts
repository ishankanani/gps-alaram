import { useEffect, useState, useSyncExternalStore } from 'react';

import { adsEnabled } from '../lib/monetization';
import { usePro } from '../lib/pro';
import { bannerAllowed, canOfferReward } from './rules';
import { getAdsState, subscribeAds, type AdsState } from './runtime';

export function useAdsState(): AdsState {
  return useSyncExternalStore(subscribeAds, getAdsState);
}

/** Ads for this user (free_ads, or premium without Pro). */
export function useAdsOn(): boolean {
  const { isPro } = usePro();
  useAdsState();
  return adsEnabled(isPro);
}

/** Now, re-read when the reward runs out. */
function useAdFreeClock(until: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (until == null || until <= now) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.min(until - now + 500, 2_000_000_000));
    return () => clearTimeout(timer);
  }, [until, now]);
  return now;
}

/** A banner may show (the placement decides where). */
export function useBannersOn(): boolean {
  const s = useAdsState();
  const on = useAdsOn();
  const now = useAdFreeClock(s.adFreeUntil);
  return bannerAllowed({
    adsOn: on,
    canRequestAds: s.canRequestAds,
    alarmRinging: s.alarmRinging,
    now,
    adFreeUntil: s.adFreeUntil,
  });
}

/** The rewarded offer: whether to show it, and until when the reward runs. */
export function useReward(): { offer: boolean; ready: boolean; adFreeUntil: number | null } {
  const s = useAdsState();
  const on = useAdsOn();
  const now = useAdFreeClock(s.adFreeUntil);
  const active = s.adFreeUntil != null && s.adFreeUntil > now;
  const offer = canOfferReward({ adsOn: on, canRequestAds: s.canRequestAds, tripRunning: s.tripRunning, alarmRinging: s.alarmRinging });
  return { offer, ready: s.rewardReady, adFreeUntil: active ? s.adFreeUntil : null };
}
