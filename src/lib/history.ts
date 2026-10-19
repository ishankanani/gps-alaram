import { File, Paths } from 'expo-file-system';
import { useEffect, useSyncExternalStore } from 'react';

import type {
  ActiveTrip,
  AlarmMode,
  AlarmStrength,
  TripEndedEvent,
  TriggerReason,
} from '../../modules/trip-alarm/src/TripAlarm.types';
import type { StopKind } from './stations/text';

// On-device trip history (ui-direction-a 4.3 "Activity" › Data): one record per finished trip,
// kept in stopwake-history.json next to the saved data. Nothing here ever leaves the phone. The
// pure helpers (building a record, stats, grouping, filters) are tested; the store at the bottom
// loads the file once, in the background, and writes through on every change.

/** How a trip ended. */
export type TripOutcome =
  /** The alarm rang (and was dismissed, or the trip was ended while it rang). */
  | 'woke'
  /** The rider ended the trip before the alarm rang. */
  | 'ended'
  /** A battery saver or the system closed StopWake before the trip finished. */
  | 'stoppedByPhone'
  /** The trip couldn't run (a permission went missing, the service failed). */
  | 'error';

/** "Did it wake you at the right time?" from Arrived or TripDetail. */
export type TripFeedback = 'right' | 'early' | 'late';

/** The destination as it was when the trip ran. */
export type TripPlace = {
  id: string;
  name: string;
  context: string;
  latitude: number;
  longitude: number;
  kind: StopKind | 'place';
  /** The MODE bitmask of the lines serving the stop (0 for addresses). */
  modes: number;
};

export type TripRing = {
  /** When the alarm rang; null when it rang while the app wasn't listening. */
  at: number | null;
  distanceM: number | null;
  etaSec: number | null;
};

export type TripRecord = {
  /** The native trip id. */
  id: string;
  startedAt: number;
  /** Null when the phone stopped the trip at a time nobody saw. */
  endedAt: number | null;
  place: TripPlace;
  mode: AlarmMode;
  /** Arrive mode by time: minutes before arrival. Null when waking by distance. */
  minutesBefore: number | null;
  /** The wake circle (the backstop circle when waking by time). */
  radiusM: number;
  strength: AlarmStrength;
  useMiles: boolean;
  rang: TripRing | null;
  trigger: TriggerReason | null;
  /** The way travelled, from the GPS trail. */
  distanceM: number;
  /** How long GPS was lost (tunnels, underground) and the position was estimated. */
  gpsLostMs: number;
  outcome: TripOutcome;
  feedback: TripFeedback | null;
  demo: boolean;
  /** The way travelled, simplified: [latitude, longitude] pairs, oldest first. */
  trail: [number, number][];
  /** The native trip log, for "Share trip log". */
  logName: string | null;
  /** Why the trip couldn't run (outcome 'error'). */
  message: string | null;
};

/** Older records are dropped beyond this many. */
export const MAX_TRIPS = 500;
/** Points kept of each trail (enough to draw the route). */
export const MAX_TRAIL_POINTS = 64;

type LatLon = { latitude: number; longitude: number };

const EARTH_RADIUS_M = 6_371_000;

function rad(deg: number) {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance in metres. */
export function haversineM(a: LatLon, b: LatLon): number {
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The length of a trail in metres. */
export function trailLength(points: readonly LatLon[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += haversineM(points[i - 1], points[i]);
  return total;
}

function round5(value: number) {
  return Math.round(value * 1e5) / 1e5;
}

/** At most `max` evenly spaced points (always the first and the last), rounded to about 1 m. */
export function simplifyTrail(points: readonly LatLon[], max = MAX_TRAIL_POINTS): [number, number][] {
  const pick = (p: LatLon): [number, number] => [round5(p.latitude), round5(p.longitude)];
  if (points.length <= max) return points.map(pick);
  const out: [number, number][] = [];
  for (let i = 0; i < max; i++) out.push(pick(points[Math.round((i * (points.length - 1)) / (max - 1))]));
  return out;
}

/** What the end of a trip means for the rider. */
export function outcomeOf(event: TripEndedEvent | null, stoppedByPhone: boolean, rang: boolean): TripOutcome {
  if (stoppedByPhone) return 'stoppedByPhone';
  if (event?.reason === 'error') return 'error';
  if (event?.reason === 'dismissed' || rang) return 'woke';
  return 'ended';
}

/** The destination, as far as the app knew it when the trip ended. */
export type PlaceLike = {
  id: string;
  name: string;
  context?: string;
  latitude: number;
  longitude: number;
  kind?: StopKind;
  modes?: number;
};

export type TripEndInput = {
  /** The trip the service ran. */
  trip: ActiveTrip;
  /** The destination as picked (null when the app restarted during the trip). */
  place: PlaceLike | null;
  /** Null: the phone stopped the trip at an unknown time. */
  endedAt: number | null;
  /** The service's end event; null when the trip vanished or the phone stopped it. */
  event: TripEndedEvent | null;
  stoppedByPhone?: boolean;
  rang: TripRing | null;
  trail: readonly LatLon[];
  gpsLostMs: number;
};

/** One history record from what the trip provider saw. */
export function buildTripRecord(input: TripEndInput): TripRecord {
  const { trip, place, event } = input;
  const outcome = outcomeOf(event, !!input.stoppedByPhone, input.rang != null);
  const destination: TripPlace = {
    id: place?.id ?? `pin:${round5(trip.latitude)},${round5(trip.longitude)}`,
    name: place?.name ?? trip.label,
    context: place?.context ?? '',
    latitude: place?.latitude ?? trip.latitude,
    longitude: place?.longitude ?? trip.longitude,
    kind: place?.kind ?? 'place',
    modes: place?.modes ?? 0,
  };
  // A dismissed alarm rang even when the app didn't see it ring.
  const rang = input.rang ?? (outcome === 'woke' ? { at: null, distanceM: null, etaSec: null } : null);
  return {
    id: event?.tripId ?? trip.id,
    startedAt: trip.startedAt,
    endedAt: input.endedAt != null ? Math.max(input.endedAt, trip.startedAt) : null,
    place: destination,
    mode: trip.mode,
    minutesBefore: trip.mode === 'arrive' ? (trip.minutesBefore ?? null) : null,
    radiusM: trip.radiusM,
    strength: trip.strength,
    useMiles: trip.useMiles,
    rang,
    trigger: event?.trigger ?? null,
    distanceM: Math.round(trailLength(input.trail)),
    gpsLostMs: Math.max(0, Math.round(input.gpsLostMs)),
    outcome,
    feedback: null,
    demo: !!trip.demo,
    trail: simplifyTrail(input.trail),
    logName: event?.logName ?? null,
    message: outcome === 'error' ? (event?.message ?? null) : null,
  };
}

/**
 * Adds a record, or updates the one with its id, newest first, at most MAX_TRIPS. A trip the phone
 * stopped stays that way, and a rider's feedback is never lost.
 */
export function upsertTrip(list: readonly TripRecord[], record: TripRecord): TripRecord[] {
  const existing = list.find((t) => t.id === record.id);
  let next: TripRecord;
  if (!existing) next = record;
  else if (existing.outcome === 'stoppedByPhone') next = { ...existing, feedback: existing.feedback ?? record.feedback };
  else next = { ...record, feedback: record.feedback ?? existing.feedback };
  const others = list.filter((t) => t.id !== record.id);
  return [next, ...others].sort((a, b) => b.startedAt - a.startedAt).slice(0, MAX_TRIPS);
}

export function withFeedback(list: readonly TripRecord[], id: string, feedback: TripFeedback | null): TripRecord[] {
  return list.map((t) => (t.id === id ? { ...t, feedback } : t));
}

// ---- Reading the history: badges, filters, months, days and stats ----

/** The outcome badge of a row (4.3 Activity). */
export type TripBadge = 'onTime' | 'tooEarly' | 'tooLate' | 'ended' | 'stoppedByPhone' | 'didntStart' | 'demo';

export function tripBadge(t: TripRecord): TripBadge {
  if (t.demo) return 'demo';
  if (t.outcome === 'error') return 'didntStart';
  if (t.outcome === 'stoppedByPhone') return 'stoppedByPhone';
  if (t.outcome === 'ended') return 'ended';
  if (t.feedback === 'early') return 'tooEarly';
  if (t.feedback === 'late') return 'tooLate';
  return 'onTime';
}

export type HistoryFilter = 'all' | 'woke' | 'ended' | 'problems' | 'demo';

export const HISTORY_FILTERS: readonly HistoryFilter[] = ['all', 'woke', 'ended', 'problems', 'demo'];

export function matchesFilter(t: TripRecord, filter: HistoryFilter): boolean {
  const badge = tripBadge(t);
  switch (filter) {
    case 'all':
      return true;
    case 'woke':
      return badge === 'onTime' || badge === 'tooEarly' || badge === 'tooLate';
    case 'ended':
      return badge === 'ended';
    case 'problems':
      return badge === 'stoppedByPhone' || badge === 'didntStart' || badge === 'tooEarly' || badge === 'tooLate';
    case 'demo':
      return badge === 'demo';
  }
}

/** A calendar month in the phone's time zone; month is 0 to 11. */
export type MonthKey = { year: number; month: number };

export function monthOf(ts: number): MonthKey {
  const d = new Date(ts);
  return { year: d.getFullYear(), month: d.getMonth() };
}

export function addMonths(m: MonthKey, n: number): MonthKey {
  const total = m.year * 12 + m.month + n;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
}

/** Negative when a is before b. */
export function compareMonths(a: MonthKey, b: MonthKey): number {
  return a.year * 12 + a.month - (b.year * 12 + b.month);
}

export function inMonth(ts: number, m: MonthKey): boolean {
  return compareMonths(monthOf(ts), m) === 0;
}

/** Midnight (local time) of the day of `ts`. */
export function startOfDay(ts: number): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Days between the local calendar days of `from` and `to` (1 = `to` is the next day). */
export function calendarDaysBetween(from: number, to: number): number {
  const a = new Date(from);
  const b = new Date(to);
  return Math.round(
    (Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86_400_000,
  );
}

/** Trips grouped by the day they started, newest day and newest trip first. */
export function groupByDay(trips: readonly TripRecord[]): { day: number; trips: TripRecord[] }[] {
  const groups = new Map<number, TripRecord[]>();
  for (const t of [...trips].sort((a, b) => b.startedAt - a.startedAt)) {
    const day = startOfDay(t.startedAt);
    const list = groups.get(day);
    if (list) list.push(t);
    else groups.set(day, [t]);
  }
  return [...groups.entries()].sort((a, b) => b[0] - a[0]).map(([day, list]) => ({ day, trips: list }));
}

export type MonthStats = {
  /** Real trips (demo rides and trips that couldn't start are left out). */
  trips: number;
  distanceM: number;
  /** Trips where the alarm was due: it rang, or the phone stopped the trip first. */
  rated: number;
  /** Of those: the alarm rang and the rider didn't say "Too late". */
  onTime: number;
  onBoardMs: number;
};

/** The month's numbers for the stat tiles. Demo rides never count. */
export function monthStats(trips: readonly TripRecord[], m: MonthKey): MonthStats {
  const stats: MonthStats = { trips: 0, distanceM: 0, rated: 0, onTime: 0, onBoardMs: 0 };
  for (const t of trips) {
    if (t.demo || t.outcome === 'error' || !inMonth(t.startedAt, m)) continue;
    stats.trips += 1;
    stats.distanceM += t.distanceM;
    if (t.endedAt != null) stats.onBoardMs += t.endedAt - t.startedAt;
    if (t.outcome === 'woke' || t.outcome === 'stoppedByPhone') {
      stats.rated += 1;
      if (t.outcome === 'woke' && t.feedback !== 'late') stats.onTime += 1;
    }
  }
  return stats;
}

/** The latest trip to a place (by id, or within about a metre), for "Yesterday, 18:40" on recents. */
export function lastTripTo(trips: readonly TripRecord[], place: PlaceLike): TripRecord | null {
  let best: TripRecord | null = null;
  for (const t of trips) {
    const same =
      t.place.id === place.id ||
      (Math.abs(t.place.latitude - place.latitude) < 1e-5 && Math.abs(t.place.longitude - place.longitude) < 1e-5);
    if (same && (!best || t.startedAt > best.startedAt)) best = t;
  }
  return best;
}

/** The earliest month with a trip, or null. */
export function firstMonth(trips: readonly TripRecord[]): MonthKey | null {
  let first: number | null = null;
  for (const t of trips) if (first == null || t.startedAt < first) first = t.startedAt;
  return first == null ? null : monthOf(first);
}

function isRecord(value: unknown): value is TripRecord {
  const t = value as Partial<TripRecord> | null;
  return (
    !!t &&
    typeof t.id === 'string' &&
    typeof t.startedAt === 'number' &&
    !!t.place &&
    typeof t.place.name === 'string' &&
    typeof t.place.latitude === 'number' &&
    typeof t.place.longitude === 'number' &&
    typeof t.outcome === 'string'
  );
}

/** Reads the history file; anything unreadable is dropped, never thrown. */
export function parseHistory(text: string): TripRecord[] {
  try {
    const parsed = JSON.parse(text) as { trips?: unknown[] } | null;
    const trips = Array.isArray(parsed?.trips) ? parsed.trips : [];
    return trips
      .filter(isRecord)
      .map((t) => ({
        ...t,
        trail: Array.isArray(t.trail) ? t.trail : [],
        feedback: t.feedback ?? null,
        rang: t.rang ?? null,
        demo: !!t.demo,
        distanceM: t.distanceM ?? 0,
        gpsLostMs: t.gpsLostMs ?? 0,
        endedAt: t.endedAt ?? null,
        logName: t.logName ?? null,
        message: t.message ?? null,
        trigger: t.trigger ?? null,
      }))
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, MAX_TRIPS);
  } catch {
    return [];
  }
}

// ---- The store: loaded once in the background, written through on every change ----

export type HistoryState = {
  /** False until the file has been read. */
  loaded: boolean;
  /** Newest first. */
  trips: TripRecord[];
};

let state: HistoryState = { loaded: false, trips: [] };
let loading: Promise<void> | null = null;
/** Changes made before the file was read; applied on top of it. */
let queued: ((trips: TripRecord[]) => TripRecord[])[] = [];
/** Feedback given before its trip was recorded (Arrived can be faster than the recorder). */
const earlyFeedback = new Map<string, TripFeedback | null>();
const listeners = new Set<() => void>();

function file() {
  return new File(Paths.document, 'stopwake-history.json');
}

/** Called after every local change (the account sync pushes it). */
const changeListeners = new Set<() => void>();

export function onHistoryChange(listener: () => void): () => void {
  changeListeners.add(listener);
  return () => {
    changeListeners.delete(listener);
  };
}

function setState(next: HistoryState) {
  state = next;
  listeners.forEach((l) => l());
}

function persist(trips: TripRecord[]) {
  try {
    const f = file();
    if (!f.exists) f.create();
    f.write(JSON.stringify({ version: 1, trips }));
  } catch {
    // Losing history is a nuisance, not a reason to crash.
  }
}

/** Reads the history file once; later calls return the same promise. */
export function loadHistory(): Promise<void> {
  loading ??= (async () => {
    let trips: TripRecord[] = [];
    try {
      const f = file();
      if (f.exists) trips = parseHistory(await f.text());
    } catch {
      trips = [];
    }
    const changes = queued;
    queued = [];
    const next = changes.reduce((list, change) => change(list), trips);
    setState({ loaded: true, trips: next });
    if (changes.length) persist(next);
  })();
  return loading;
}

function change(fn: (trips: TripRecord[]) => TripRecord[]) {
  if (!state.loaded) {
    queued.push(fn);
    void loadHistory();
    return;
  }
  const next = fn(state.trips);
  if (next === state.trips) return;
  setState({ ...state, trips: next });
  persist(next);
  changeListeners.forEach((l) => l());
}

/** Replaces the list with what the account sync merged (newest first, at most MAX_TRIPS). */
export function replaceTrips(trips: TripRecord[]) {
  const next = [...trips].sort((a, b) => b.startedAt - a.startedAt).slice(0, MAX_TRIPS);
  setState({ loaded: true, trips: next });
  persist(next);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function snapshot() {
  return state;
}

/** The trip history, loading it on first use. */
export function useHistory(): HistoryState {
  const value = useSyncExternalStore(subscribe, snapshot, snapshot);
  useEffect(() => {
    void loadHistory();
  }, []);
  return value;
}

/** The current history (outside React). */
export function getHistory(): HistoryState {
  return state;
}

/** Saves a finished trip (or updates it). */
export function recordTrip(record: TripRecord) {
  const early = earlyFeedback.get(record.id);
  earlyFeedback.delete(record.id);
  const withEarly = early !== undefined ? { ...record, feedback: early } : record;
  change((trips) => upsertTrip(trips, withEarly));
}

/** "Did it wake you at the right time?" for a trip (Arrived and TripDetail). */
export function setTripFeedback(id: string, feedback: TripFeedback | null) {
  change((trips) => {
    if (!trips.some((t) => t.id === id)) {
      earlyFeedback.set(id, feedback);
      return trips;
    }
    return withFeedback(trips, id, feedback);
  });
}

export function deleteTrip(id: string) {
  change((trips) => (trips.some((t) => t.id === id) ? trips.filter((t) => t.id !== id) : trips));
}

/** Puts a deleted trip back (Undo). */
export function restoreTrip(record: TripRecord) {
  change((trips) => upsertTrip(trips, record));
}

/** Deletes the whole history (for "Delete my data"). */
export function clearHistory() {
  change((trips) => (trips.length ? [] : trips));
}
