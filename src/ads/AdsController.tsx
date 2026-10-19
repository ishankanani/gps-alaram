import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { usePro } from '../lib/pro';
import { isRunning, useTrip } from '../state/trip';
import { maybeShowAppOpen, proChanged, setTripFacts, startAds } from './runtime';

/**
 * Wires the ads to the app (mounted once, inside the providers): starts consent and the SDK,
 * tells the rules about the trip and the alarm, and tries the app-open ad on returns to the
 * foreground. Renders nothing.
 */
export function AdsController() {
  const trip = useTrip();
  const { isPro } = usePro();
  const running = isRunning(trip.status) || trip.starting;
  const ringing = trip.status?.state === 'ringing';

  useEffect(() => {
    startAds();
  }, []);

  useEffect(() => {
    setTripFacts(running, ringing);
  }, [running, ringing]);

  const firstPro = useRef(true);
  useEffect(() => {
    if (firstPro.current) {
      firstPro.current = false;
      return;
    }
    proChanged();
  }, [isPro]);

  useEffect(() => {
    let backgroundAt: number | null = null;
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background') backgroundAt = Date.now();
      else if (s === 'active' && backgroundAt != null) {
        const away = Date.now() - backgroundAt;
        backgroundAt = null;
        maybeShowAppOpen(false, away);
      }
    });
    return () => sub.remove();
  }, []);

  return null;
}
