import type { ActiveTrip, TripEndedEvent, TripStatus } from '../../../modules/trip-alarm/src/TripAlarm.types';
import type { Key, Params } from '../../i18n';
import type { TripFeedback, TripRing } from '../../lib/history';
import type { WakeOptions } from '../../lib/wake';
import type { BadgeTone } from '../../ui/components/Badge';

// Pure helpers of the Trip and Arrived screens (no react-native), tested in __tests__.

type LatLon = { latitude: number; longitude: number };

// ---- GPS badge (4.3 Trip, panel item 1) ----

export type GpsBadge = { tone: BadgeTone; key: Key; params?: Params; pulse: boolean };

/** Honest GPS health: never red unless something is wrong. */
export function gpsBadge(status: Pick<TripStatus, 'health' | 'estimated' | 'accuracyM'>): GpsBadge {
  if (status.estimated || status.health === 'lost') return { tone: 'warning', key: 'trip.badge.estimating', pulse: false };
  if (status.health === 'weak') return { tone: 'warning', key: 'trip.gps.weak', pulse: false };
  if (status.health === 'good') {
    return status.accuracyM != null
      ? { tone: 'success', key: 'trip.badge.good', params: { meters: Math.max(1, Math.round(status.accuracyM)) }, pulse: false }
      : { tone: 'success', key: 'trip.gps.good', pulse: false };
  }
  return { tone: 'neutral', key: 'trip.badge.searching', pulse: true };
}

// ---- Stats row ----

/**
 * Which number is the hero (critiques: Trip hero number): the rule's unit. Waking by minutes, the
 * arrival time is what matters; by distance, the distance; leaving, the distance from the start.
 */
export type HeroLayout = 'eta' | 'distance' | 'leave';

export function heroLayout(trip: Pick<ActiveTrip, 'mode' | 'minutesBefore'>): HeroLayout {
  if (trip.mode === 'leave') return 'leave';
  return trip.minutesBefore ? 'eta' : 'distance';
}

/**
 * Where the alarm rings, as a distance from the stop: the circle when waking by distance, or the
 * distance covered in the chosen minutes at the current pace when waking by time.
 */
export function wakeDistanceM(
  trip: Pick<ActiveTrip, 'mode' | 'minutesBefore' | 'radiusM'>,
  status: Pick<TripStatus, 'distanceM' | 'etaSec'>,
): number {
  if (trip.mode === 'arrive' && trip.minutesBefore && status.distanceM != null && status.etaSec != null && status.etaSec > 0) {
    return Math.max(trip.radiusM, (status.distanceM * trip.minutesBefore * 60) / status.etaSec);
  }
  return trip.radiusM;
}

/**
 * Trip progress from the first fix's distance to the wake point (0 to 1), or null before a fix.
 * Leaving: how far out of the circle you are.
 */
export function tripProgress(
  trip: Pick<ActiveTrip, 'mode' | 'minutesBefore' | 'radiusM'>,
  status: Pick<TripStatus, 'distanceM' | 'etaSec'>,
  startDistanceM: number | null,
): number | null {
  const d = status.distanceM;
  if (d == null) return null;
  if (trip.mode === 'leave') return clamp(d / Math.max(1, trip.radiusM));
  const start = startDistanceM ?? d;
  const wake = wakeDistanceM(trip, status);
  if (start <= wake) return 1;
  return clamp((start - d) / (start - wake));
}

function clamp(v: number) {
  return Math.max(0, Math.min(1, v));
}

/** When the alarm should ring (epoch ms), from the pace so far; null when it can't be said honestly. */
export function predictRingAt(
  trip: Pick<ActiveTrip, 'mode' | 'minutesBefore' | 'radiusM'>,
  status: Pick<TripStatus, 'distanceM' | 'etaSec' | 'speedMps' | 'state'>,
  now: number,
): number | null {
  if (trip.mode === 'leave' || status.state !== 'tracking') return null;
  if (trip.minutesBefore) {
    if (status.etaSec == null) return null;
    return now + Math.max(0, status.etaSec - trip.minutesBefore * 60) * 1000;
  }
  if (status.distanceM == null || !status.speedMps || status.speedMps < 0.5) return null;
  return now + (Math.max(0, status.distanceM - trip.radiusM) / status.speedMps) * 1000;
}

/** A clock time in the phone's format: "08:21", or "8:21 AM" on a 12-hour phone. */
export function formatClock(at: number | Date, uses24h: boolean): string {
  const d = typeof at === 'number' ? new Date(at) : at;
  const h = d.getHours();
  const mm = String(d.getMinutes()).padStart(2, '0');
  if (uses24h) return `${String(h).padStart(2, '0')}:${mm}`;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mm} ${h < 12 ? 'AM' : 'PM'}`;
}

/** A countdown "0:42". */
export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** The snooze lasts a minute (Snooze 1 min); the native status has no end time yet. */
export const SNOOZE_MS = 60_000;

// ---- Arrived ----

export type ArrivedVariant = 'arrived' | 'ended' | 'error' | 'phone';

/** Which Arrived the rider sees (4.3 Arrived and its variants). */
export function arrivedVariant(event: Pick<TripEndedEvent, 'reason'> | null, stoppedByPhone: boolean, rang: boolean): ArrivedVariant {
  if (event?.reason === 'error') return 'error';
  if (stoppedByPhone) return 'phone';
  if (event?.reason === 'dismissed' || rang) return 'arrived';
  return 'ended';
}

/** The wake choices of a finished trip, to start it again. */
export function wakeOfTrip(
  trip: Pick<ActiveTrip, 'mode' | 'minutesBefore' | 'radiusM' | 'strength'>,
  fallbackRadiusM: number,
): WakeOptions {
  const byTime = trip.mode === 'arrive' && !!trip.minutesBefore;
  return {
    wakeBy: byTime ? 'time' : 'distance',
    // Waking by time, the circle is only the backstop: keep the rider's own distance choice.
    radiusM: byTime ? fallbackRadiusM : trip.radiusM,
    minutesBefore: trip.minutesBefore ?? 2,
    mode: trip.mode,
    strength: trip.strength,
  };
}

/** Days between Pro suggestions on Arrived (critiques: upsell at the moment of need). */
export const UPSELL_EVERY_MS = 14 * 24 * 3600_000;

/** Offer Heavy sleeper to a Free rider who slept through it (too late, or snoozed twice). */
export function shouldUpsell(input: {
  isPro: boolean;
  demo: boolean;
  feedback: TripFeedback | null;
  snoozes: number;
  lastShownAt: number | null;
  now: number;
}): boolean {
  if (input.isPro || input.demo) return false;
  if (input.feedback !== 'late' && input.snoozes < 2) return false;
  return input.lastShownAt == null || input.now - input.lastShownAt >= UPSELL_EVERY_MS;
}

// ---- What the app saw of a trip, for Arrived and the history ----

export type TripFacts = {
  trip: ActiveTrip;
  /** The distance at the first fix, for the progress bar. */
  firstDistanceM: number | null;
  rang: TripRing | null;
  snoozes: number;
  /** When the current snooze started. */
  snoozedAt: number | null;
  /** Real fixes at least 10 m apart (estimates are not your trail). */
  trail: LatLon[];
  lostSince: number | null;
  gpsLostMs: number;
  endedAt: number | null;
  event: TripEndedEvent | null;
  stoppedByPhone: boolean;
};

const TRAIL_STEP_M = 10;
const TRAIL_MAX = 2000;

function metres(a: LatLon, b: LatLon): number {
  const north = (b.latitude - a.latitude) * 110_540;
  const east = (b.longitude - a.longitude) * 111_320 * Math.cos((a.latitude * Math.PI) / 180);
  return Math.hypot(north, east);
}

/** Folds one status update into the facts of its trip (a new trip id starts fresh). */
export function observeStatus(prev: TripFacts | null, status: TripStatus, now: number): TripFacts | null {
  const trip = status.trip;
  if (!trip) return prev;
  const base: TripFacts =
    prev && prev.trip.id === trip.id
      ? { ...prev, trip }
      : {
          trip,
          firstDistanceM: null,
          rang: null,
          snoozes: 0,
          snoozedAt: null,
          trail: [],
          lostSince: null,
          gpsLostMs: 0,
          endedAt: null,
          event: null,
          stoppedByPhone: false,
        };
  const next = { ...base };
  if (status.state === 'stopped') {
    next.stoppedByPhone = true;
    return next;
  }
  if (next.firstDistanceM == null && status.distanceM != null && !status.estimated) next.firstDistanceM = status.distanceM;
  if (status.state === 'ringing' && !next.rang) {
    next.rang = { at: now, distanceM: status.distanceM ?? null, etaSec: status.etaSec ?? null };
  }
  const wasSnoozed = prev?.trip.id === trip.id && prev.snoozedAt != null;
  if (status.state === 'snoozed') {
    if (!wasSnoozed) {
      next.snoozes += 1;
      next.snoozedAt = now;
    }
  } else {
    next.snoozedAt = null;
  }
  const lost = !!status.estimated || status.health === 'lost';
  if (lost && next.lostSince == null) next.lostSince = now;
  if (!lost && next.lostSince != null) {
    next.gpsLostMs += now - next.lostSince;
    next.lostSince = null;
  }
  if (status.latitude != null && status.longitude != null && !status.estimated) {
    const point = { latitude: status.latitude, longitude: status.longitude };
    const last = next.trail[next.trail.length - 1];
    if (!last || metres(last, point) >= TRAIL_STEP_M) next.trail = [...next.trail, point].slice(-TRAIL_MAX);
  }
  return next;
}

/** The trip ended: when, and why. */
export function observeEnd(facts: TripFacts, event: TripEndedEvent | null, now: number | null): TripFacts {
  const lostMs = facts.lostSince != null && now != null ? now - facts.lostSince : 0;
  return { ...facts, event, endedAt: now, gpsLostMs: facts.gpsLostMs + lostMs, lostSince: null };
}
