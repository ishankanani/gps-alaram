import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { TripAlarm, type ActiveTrip, type TripEndedEvent, type TripStatus } from '../../../modules/trip-alarm/src';
import type { Place } from '../../lib/geocode';
import { buildTripRecord, recordTrip } from '../../lib/history';
import { observeEnd, observeStatus, type TripFacts } from './tripView';

// What the app sees of each trip (first fix, ring time, snoozes, GPS lost, trail), for the Trip
// progress bar, the snooze countdown and Arrived, and the finished trip in the history (L's
// src/lib/history.ts). The native trip events carry none of this, so it is collected here from the
// status stream. A trip that ends while the app process is gone is not seen (native contract, see
// ui-critiques "Native trip data").

const KEEP = 5;
const facts = new Map<string, TripFacts>();
const places = new Map<string, Place>();
let pendingPlace: Place | null = null;
let lastId: string | null = null;
const listeners = new Set<() => void>();
let version = 0;
let started = false;

function emit() {
  version += 1;
  listeners.forEach((l) => l());
}

function remember(id: string, value: TripFacts) {
  facts.delete(id);
  facts.set(id, value);
  while (facts.size > KEEP) facts.delete(facts.keys().next().value as string);
}

function placeFor(trip: ActiveTrip): Place | null {
  const known = places.get(trip.id);
  if (known) return known;
  if (pendingPlace && pendingPlace.name === trip.label) {
    places.set(trip.id, pendingPlace);
    pendingPlace = null;
    return places.get(trip.id) ?? null;
  }
  return null;
}

/** The destination as picked, for the history (call right before starting a trip). */
export function rememberTripPlace(place: Place) {
  pendingPlace = place;
}

function record(value: TripFacts, place: Place | null = null) {
  try {
    recordTrip(
      buildTripRecord({
        trip: value.trip,
        place: place ?? placeFor(value.trip),
        endedAt: value.endedAt,
        event: value.event,
        stoppedByPhone: value.stoppedByPhone,
        rang: value.rang,
        trail: value.trail,
        gpsLostMs: value.gpsLostMs,
      }),
    );
  } catch {
    // The history is a convenience; the trip itself is over either way.
  }
}

function onStatus(status: TripStatus) {
  const id = status.trip?.id;
  if (!id) return;
  const next = observeStatus(facts.get(id) ?? null, status, Date.now());
  if (!next) return;
  lastId = id;
  placeFor(status.trip as ActiveTrip);
  remember(id, next);
  emit();
}

function onEnded(event: TripEndedEvent) {
  const id = event.tripId ?? lastId;
  const current = id ? facts.get(id) : undefined;
  if (!id || !current || current.endedAt != null) return;
  const ended = observeEnd(current, event, Date.now());
  remember(id, ended);
  record(ended);
  emit();
}

/** A trip the phone stopped while the app was closed (a battery saver): it goes into the history once. */
function checkStoppedByPhone() {
  let active: TripStatus | null = null;
  try {
    active = TripAlarm?.getActiveTrip() ?? null;
  } catch {
    return;
  }
  if (active?.state !== 'stopped' || !active.trip) return;
  const id = active.trip.id;
  const seen = observeStatus(facts.get(id) ?? null, active, Date.now());
  if (!seen || facts.get(id)?.endedAt != null) return;
  const ended = observeEnd(seen, null, null);
  remember(id, ended);
  record(ended);
  emit();
}

/** Starts listening to the trip service (once per app run; safe to call from every screen). */
export function startTripRecorder() {
  const native = TripAlarm;
  if (started || !native) return;
  started = true;
  checkStoppedByPhone();
  try {
    const active = native.getActiveTrip();
    if (active?.trip && active.state !== 'stopped') onStatus(active);
  } catch {
    // Nothing running.
  }
  native.addListener('onStatus', onStatus);
  native.addListener('onTripEnded', onEnded);
  AppState.addEventListener('change', (s) => {
    if (s === 'active') checkStoppedByPhone();
  });
}

/** The facts of a trip (null when this app run never saw it). */
export function getTripFacts(id: string | null | undefined): TripFacts | null {
  return id ? (facts.get(id) ?? null) : null;
}

/** Updates the history entry with the destination as picked (Arrived knows it after a restart too). */
export function recordWithPlace(id: string, place: Place | null) {
  const value = facts.get(id);
  if (value && value.endedAt != null && place) {
    places.set(id, place);
    record(value, place);
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The facts of a trip, kept current. */
export function useTripFacts(id: string | null | undefined): TripFacts | null {
  useSyncExternalStore(subscribe, () => version);
  return getTripFacts(id);
}
