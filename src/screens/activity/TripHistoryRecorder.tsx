import { useEffect, useRef, useState } from 'react';

import { TripAlarm, type ActiveTrip, type TripStatus } from '../../../modules/trip-alarm/src';
import type { Place } from '../../lib/geocode';
import { buildTripRecord, recordTrip, type TripRing } from '../../lib/history';
import type { TrailPoint } from '../../lib/trail';
import { useSavedData } from '../../state/saved';
import { useTrip, type EndedTrip } from '../../state/trip';

/** What the recorder knows about the trip that is running. */
type Flight = {
  trip: ActiveTrip;
  rang: TripRing | null;
  /** GPS lost (or estimating) since this time, if it is lost now. */
  lostSince: number | null;
  lostMs: number;
  trail: TrailPoint[];
};

function isLost(s: TripStatus) {
  return s.health === 'lost' || !!s.estimated;
}

/** The destination of a trip the app no longer has in memory: a recent with the trip's name. */
function placeFor(trip: ActiveTrip, ended: Place | null, recents: Place[]): Place | null {
  if (ended) return ended;
  return recents.find((p) => p.name === trip.label) ?? null;
}

/**
 * Writes the trip history (src/lib/history.ts) from what the trip provider sees. Mount it once,
 * inside AppProviders, for the whole life of the app (it renders nothing):
 * - while a trip runs it remembers when the alarm rang (with the distance and ETA then), how long
 *   GPS was lost, and the trail;
 * - when the provider reports the end (useTrip().ended), it records the trip with its outcome;
 * - a trip the phone stopped while the app was closed is read at launch, before the provider
 *   clears it, and a trip that stops while the app is open is recorded when the provider notices.
 * Trips that end while the app's process is dead (alarm dismissed from the lock screen after the
 * system killed the app) can't be seen from JS; the native trip store would have to keep them.
 */
export function TripHistoryRecorder() {
  const trip = useTrip();
  const { data } = useSavedData();
  // Read during the first render: the trip provider clears a stopped trip in its first effect.
  const [stoppedAtLaunch] = useState<ActiveTrip | null>(() => {
    try {
      const s = TripAlarm?.getActiveTrip();
      return s?.state === 'stopped' && s.trip ? s.trip : null;
    } catch {
      return null;
    }
  });
  const flight = useRef<Flight | null>(null);
  const seenEnded = useRef<EndedTrip | null>(trip.ended);
  const seenNotice = useRef(trip.stoppedNotice);
  const recorded = useRef(new Set<string>());
  const recents = useRef(data.recents);

  useEffect(() => {
    recents.current = data.recents;
  }, [data.recents]);

  useEffect(() => {
    if (!stoppedAtLaunch || recorded.current.has(stoppedAtLaunch.id)) return;
    recorded.current.add(stoppedAtLaunch.id);
    recordTrip(
      buildTripRecord({
        trip: stoppedAtLaunch,
        place: placeFor(stoppedAtLaunch, null, recents.current),
        endedAt: null,
        event: null,
        stoppedByPhone: true,
        rang: null,
        trail: [],
        gpsLostMs: 0,
      }),
    );
  }, [stoppedAtLaunch]);

  const { status, ended, stoppedNotice, trail } = trip;
  useEffect(() => {
    const now = Date.now();
    const finish = (f: Flight, end: { endedAt: number | null; ended: EndedTrip | null; stoppedByPhone: boolean }) => {
      flight.current = null;
      if (recorded.current.has(f.trip.id)) return;
      recorded.current.add(f.trip.id);
      const lostMs = f.lostMs + (f.lostSince != null ? now - f.lostSince : 0);
      recordTrip(
        buildTripRecord({
          trip: f.trip,
          place: placeFor(f.trip, end.ended?.place ?? null, recents.current),
          endedAt: end.endedAt,
          event: end.ended?.event ?? null,
          stoppedByPhone: end.stoppedByPhone,
          rang: f.rang,
          trail: f.trail,
          gpsLostMs: lostMs,
        }),
      );
    };

    // 1. The service reported the end of the trip.
    if (ended && ended !== seenEnded.current) {
      seenEnded.current = ended;
      const f = flight.current;
      if (f && (!ended.event.tripId || ended.event.tripId === f.trip.id)) {
        finish(f, { endedAt: now, ended, stoppedByPhone: false });
      }
      return;
    }

    // 2. The provider found the trip stopped by the phone (back from the background).
    const noticeAppeared = stoppedNotice && !seenNotice.current;
    seenNotice.current = stoppedNotice;
    if (noticeAppeared && flight.current) {
      finish(flight.current, { endedAt: null, ended: null, stoppedByPhone: true });
      return;
    }

    // 3. A trip is running: keep track of it.
    if (status?.trip) {
      if (recorded.current.has(status.trip.id)) return;
      let f = flight.current;
      // A new trip replaced the one we were following ("Replace your trip?"): that one ended.
      if (f && f.trip.id !== status.trip.id) finish(f, { endedAt: now, ended: null, stoppedByPhone: false });
      f = flight.current;
      if (!f) {
        f = { trip: status.trip, rang: null, lostSince: null, lostMs: 0, trail: [] };
        flight.current = f;
      }
      if (status.state === 'ringing' && !f.rang) {
        f.rang = { at: now, distanceM: status.distanceM ?? null, etaSec: status.etaSec ?? null };
      }
      if (isLost(status) && f.lostSince == null) f.lostSince = now;
      if (!isLost(status) && f.lostSince != null) {
        f.lostMs += now - f.lostSince;
        f.lostSince = null;
      }
      if (trail.length) f.trail = trail;
      return;
    }

    // 4. The trip vanished without an end event (the service was closed while nothing listened).
    if (!status && flight.current) {
      finish(flight.current, { endedAt: now, ended: null, stoppedByPhone: false });
    }
  }, [status, ended, stoppedNotice, trail]);

  return null;
}
