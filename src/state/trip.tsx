import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, AppState } from 'react-native';

import { TripAlarm, type TripEndedEvent, type TripStatus } from '../../modules/trip-alarm/src';
import { useI18n, type Key } from '../i18n';
import type { Place } from '../lib/geocode';
import { effectiveStrength } from '../lib/plans';
import { usePro } from '../lib/pro';
import type { LatLon } from '../lib/stations/search';
import type { StopKind } from '../lib/stations/text';
import { withRecent } from '../lib/storage';
import { EMPTY_TRAIL, extendTrail, type Trail, type TrailPoint } from '../lib/trail';
import { demoRide, rememberWake, tripOptions, type WakeOptions } from '../lib/wake';
import { currentRouteName, goToMap, navigationRef, replaceOrNavigate, whenNavigationReady } from '../navigation/ref';
import { useDialogs } from '../ui/components/ConfirmDialog';
import { haptics } from '../ui/haptics';
import { useSavedData } from './saved';
import { setupReady } from './setup';

// The trip lifecycle, taken over from the old App.tsx: the native trip service's status listener,
// the trail, starting a trip (or a demo ride) after the setup check, picking up a trip that runs
// while the app was closed, and presenting Trip and Arrived wherever the user is.

/** A trip waiting for setup to finish. With `demo` it is a demo ride (simulated movement). */
export type PendingTrip = { place: Place; wake: WakeOptions; demo?: { from: LatLon | null } };

/** The trip that just ended, for Arrived. */
export type EndedTrip = { event: TripEndedEvent; place: Place | null };

export function isRunning(status: TripStatus | null | undefined): status is TripStatus {
  return !!status?.trip && status.state !== 'stopped';
}

/** A trip the service runs right now (read synchronously, for the first frame). */
export function runningTripNow(): TripStatus | null {
  try {
    const active = TripAlarm?.getActiveTrip() ?? null;
    return isRunning(active) ? active : null;
  } catch {
    return null;
  }
}

export type TripApi = {
  /** The latest status of the running trip; null when no trip runs. */
  status: TripStatus | null;
  /** The way travelled so far on the running trip. */
  trail: TrailPoint[];
  /** The destination's kind, for icons and pins (also after the app restarted mid-trip). */
  kind: StopKind | 'place';
  /** startTrip() is in flight. */
  starting: boolean;
  /** The phone stopped a trip while the app was closed (shown once on the map). */
  stoppedNotice: boolean;
  dismissStoppedNotice: () => void;
  /** The last trip that ended, for Arrived. */
  ended: EndedTrip | null;
  /** The trip Setup will start (Setup opened with entry 'trip'). */
  pending: PendingTrip | null;
  /** Starts a trip, or opens Setup first when a required permission is missing. Asks before replacing a running trip. */
  start: (trip: PendingTrip) => Promise<void>;
  /** Starts a trip now (Setup's Continue). */
  launch: (trip: PendingTrip) => Promise<void>;
  /** Ends the running trip (Arrived follows from the service's onTripEnded). */
  stop: () => Promise<void>;
  /** Android back or the chevron on Trip: back to the tabs, where the TripBar shows the trip. */
  minimise: () => void;
  /** The TripBar: shows Trip again. */
  openTrip: () => void;
};

const TripContext = createContext<TripApi | null>(null);

/** At most one spoken trip update every 10 s (the alarm itself is always announced). */
const ANNOUNCE_GAP_MS = 10_000;

export function TripProvider({ children }: { children: ReactNode }) {
  const { data, update } = useSavedData();
  const { t: tr } = useI18n();
  const { isPro } = usePro();
  const dialogs = useDialogs();
  // What the service is doing as the app starts (read once, synchronously).
  const [initial] = useState<TripStatus | null>(() => {
    try {
      return TripAlarm?.getActiveTrip() ?? null;
    } catch {
      return null;
    }
  });
  const [status, setStatus] = useState<TripStatus | null>(() => (isRunning(initial) ? initial : null));
  const [trail, setTrail] = useState<Trail>(EMPTY_TRAIL);
  // The phone stopped a trip while the app was closed: say so once on the map.
  const [stoppedNotice, setStoppedNotice] = useState(() => initial?.state === 'stopped');
  const [starting, setStarting] = useState(false);
  const [ended, setEnded] = useState<EndedTrip | null>(null);
  const [pending, setPending] = useState<PendingTrip | null>(null);
  const [place, setPlace] = useState<Place | null>(null);
  // For the native listeners, which are subscribed once.
  const tripPlace = useRef<Place | null>(null);
  const latestStatus = useRef<TripStatus | null>(status);
  /** The trip the user minimised: it is not presented again, unless it rings. */
  const minimised = useRef<string | null>(null);
  const tr$ = useRef(tr);
  const lastSpoken = useRef<{ key: string; at: number }>({ key: '', at: 0 });

  useEffect(() => {
    tr$.current = tr;
  }, [tr]);

  /** Shows Trip for a running trip, unless the user minimised it (a ringing alarm always shows). */
  const present = useCallback((s: TripStatus) => {
    const id = s.trip?.id ?? null;
    if (s.state === 'ringing' && minimised.current === id) minimised.current = null;
    if (id && minimised.current === id) return;
    whenNavigationReady(() => {
      if (currentRouteName() !== 'Trip') navigationRef.navigate('Trip');
    });
  }, []);

  /** Speaks state changes only (never distance or ETA), for TalkBack users. */
  const announce = useCallback((previous: TripStatus | null, next: TripStatus) => {
    let key: Key | null = null;
    if (next.state === 'ringing' && previous?.state !== 'ringing') key = 'trip.wakeUp';
    else if (next.state === 'snoozed' && previous?.state !== 'snoozed') key = 'trip.snoozed';
    else if (next.estimated && !previous?.estimated) key = 'trip.gps.estimating';
    else if (next.health === 'lost' && previous?.health !== 'lost') key = 'trip.gps.lost';
    else if (next.health === 'good' && (previous?.health === 'lost' || previous?.estimated)) key = 'trip.gps.good';
    if (!key) return;
    const now = Date.now();
    if (key !== 'trip.wakeUp' && now - lastSpoken.current.at < ANNOUNCE_GAP_MS) return;
    lastSpoken.current = { key, at: now };
    const text = key === 'trip.wakeUp' && next.trip ? `${tr$.current(key)} ${next.trip.label}` : tr$.current(key);
    AccessibilityInfo.announceForAccessibility(text);
  }, []);

  // Pick up a trip that is already running (the app was closed while the service tracked).
  const sync = useCallback(() => {
    if (!TripAlarm) return;
    const active = TripAlarm.getActiveTrip();
    if (active?.state === 'stopped') {
      setStoppedNotice(true);
      void TripAlarm.stopTrip();
    } else if (isRunning(active)) {
      latestStatus.current = active;
      setStatus(active);
      present(active);
    } else {
      // The service is gone without telling us (it was stopped while nothing ran it). Only for a
      // trip that has been running a while, so a trip that is just starting is never dropped.
      const shown = latestStatus.current;
      if (isRunning(shown) && shown.trip && Date.now() - shown.trip.startedAt > 30_000) {
        latestStatus.current = null;
        setStatus(null);
        if (currentRouteName() === 'Trip') goToMap();
      }
    }
  }, [present]);

  useEffect(() => {
    const native = TripAlarm;
    if (!native) return;
    // At launch: clear a trip the phone stopped while the app was closed, or show a running one.
    if (initial?.state === 'stopped') void native.stopTrip();
    else if (isRunning(initial)) present(initial);
    const subs = [
      native.addListener('onStatus', (s) => {
        announce(latestStatus.current, s);
        latestStatus.current = s;
        setStatus(s);
        setTrail((cur) => extendTrail(cur, s));
        if (isRunning(s)) present(s);
      }),
      native.addListener('onTripEnded', (event) => {
        latestStatus.current = null;
        minimised.current = null;
        setStatus(null);
        setEnded({ event, place: tripPlace.current });
        // replace only works when Trip is focused; from anywhere else, Arrived is pushed.
        replaceOrNavigate('Trip', 'Arrived', { tripId: event.tripId ?? null });
      }),
    ];
    const appState = AppState.addEventListener('change', (s) => {
      if (s === 'active') sync();
    });
    return () => {
      subs.forEach((s) => s.remove());
      appState.remove();
    };
  }, [initial, sync, present, announce]);

  const launch = useCallback(
    async ({ place: destination, wake: chosen, demo }: PendingTrip) => {
      const native = TripAlarm;
      if (!native) return;
      const wake = { ...chosen, strength: effectiveStrength(chosen.strength, isPro) };
      // A demo ride is a try-out: it does not count as a recent place.
      const saved = update((current) => {
        const preferences = rememberWake(current.preferences, wake);
        return demo ? { ...current, preferences } : withRecent({ ...current, preferences }, destination);
      });
      tripPlace.current = destination;
      setPlace(destination);
      setStarting(true);
      try {
        const options = tripOptions(destination, wake, saved.preferences.useMiles);
        const trip = await native.startTrip(
          demo ? { ...options, ...demoRide(destination, destination.kind ?? 'place', wake, demo.from) } : options,
        );
        const started: TripStatus = { trip, state: 'tracking', health: 'waiting' };
        setStoppedNotice(false);
        setPending(null);
        minimised.current = null;
        latestStatus.current = started;
        setStatus(started);
        haptics.confirm();
        // Started from Setup: Trip takes its place, so minimising goes back to the tabs.
        replaceOrNavigate('Setup', 'Trip');
      } catch (e) {
        void dialogs.alert({
          title: tr('trip.startFailed'),
          message: e instanceof Error ? e.message : String(e),
          icon: 'alert-circle-outline',
          tone: 'danger',
        });
      } finally {
        setStarting(false);
      }
    },
    [isPro, update, dialogs, tr],
  );

  const start = useCallback(
    async (trip: PendingTrip) => {
      const running = latestStatus.current;
      if (isRunning(running) && running.trip) {
        const replace = await dialogs.confirm({
          title: tr('nav.replaceTrip.title', { name: running.trip.label }),
          message: tr('nav.replaceTrip.body'),
          confirmLabel: tr('nav.replaceTrip.confirm'),
          cancelLabel: tr('nav.replaceTrip.keep'),
        });
        if (!replace) return;
      }
      if (setupReady(TripAlarm?.getSetupStatus())) {
        await launch(trip);
      } else {
        setPending(trip);
        whenNavigationReady(() => navigationRef.navigate('Setup', { entry: 'trip' }));
      }
    },
    [launch, dialogs, tr],
  );

  const stop = useCallback(async () => {
    await TripAlarm?.stopTrip();
  }, []);

  const minimise = useCallback(() => {
    minimised.current = latestStatus.current?.trip?.id ?? null;
    whenNavigationReady(() => {
      if (currentRouteName() !== 'Trip') return;
      if (navigationRef.canGoBack()) navigationRef.goBack();
      else goToMap();
    });
  }, []);

  const openTrip = useCallback(() => {
    minimised.current = null;
    whenNavigationReady(() => {
      if (currentRouteName() !== 'Trip') navigationRef.navigate('Trip');
    });
  }, []);

  const dismissStoppedNotice = useCallback(() => setStoppedNotice(false), []);

  const running = isRunning(status) ? status : null;
  const label = running?.trip?.label;
  // The destination's kind for the trip map pin, also after the app was restarted mid-trip.
  const kind = (place ?? data.recents.find((p) => p.name === label) ?? null)?.kind ?? 'place';
  const points = running && trail.tripId === running.trip?.id ? trail.points : EMPTY_TRAIL.points;

  const api = useMemo<TripApi>(
    () => ({
      status: running,
      trail: points,
      kind,
      starting,
      stoppedNotice,
      dismissStoppedNotice,
      ended,
      pending,
      start,
      launch,
      stop,
      minimise,
      openTrip,
    }),
    [running, points, kind, starting, stoppedNotice, dismissStoppedNotice, ended, pending, start, launch, stop, minimise, openTrip],
  );

  return <TripContext.Provider value={api}>{children}</TripContext.Provider>;
}

export function useTrip(): TripApi {
  const api = useContext(TripContext);
  if (!api) throw new Error('useTrip() needs a TripProvider');
  return api;
}
