import type { AlarmMode, AlarmStrength, TripOptions } from '../../modules/trip-alarm/src';
import type { Place } from './geocode';
import type { StopKind } from './stations/text';
import type { Preferences, WakeBy } from './prefs';

export type WakeOptions = {
  wakeBy: WakeBy;
  radiusM: number;
  minutesBefore: number;
  mode: AlarmMode;
  strength: AlarmStrength;
};

export const DISTANCE_CHOICES = [100, 200, 300, 500, 1000, 2000];
export const MINUTE_CHOICES = [1, 2, 3, 5, 10, 15];

/** When waking by time, the radius still rings as a backstop if no time estimate exists yet. */
export const TIME_BACKSTOP_RADIUS_M = 300;

/** Trains and S-Bahn trains are fast: a few hundred metres is only seconds of warning. */
const FAST: ReadonlySet<StopKind | 'place'> = new Set(['train', 'sbahn']);

/**
 * Trains and S-Bahn trains default to time. Buses, trams and U-Bahn default to distance.
 * Both use the user's last choices.
 */
export function defaultWake(kind: StopKind | 'place', prefs: Preferences): WakeOptions {
  return {
    wakeBy: FAST.has(kind) ? 'time' : 'distance',
    radiusM: prefs.radiusM,
    minutesBefore: prefs.minutesBefore,
    mode: 'arrive',
    strength: prefs.strength,
  };
}

/** Distance of 200 m or less before a train or S-Bahn station: the doors open seconds later. */
export function tooShortForTrain(kind: StopKind | 'place', w: WakeOptions): boolean {
  return FAST.has(kind) && w.mode === 'arrive' && w.wakeBy === 'distance' && w.radiusM <= 200;
}

export function tripOptions(place: Place, w: WakeOptions, useMiles: boolean): TripOptions {
  const byTime = w.mode === 'arrive' && w.wakeBy === 'time';
  return {
    latitude: place.latitude,
    longitude: place.longitude,
    radiusM: byTime ? TIME_BACKSTOP_RADIUS_M : w.radiusM,
    mode: w.mode,
    minutesBefore: byTime ? w.minutesBefore : null,
    label: place.name,
    strength: w.strength,
    useMiles,
  };
}

/** Typical speeds for a demo ride, in m/s. */
export const DEMO_SPEED_MPS: Record<StopKind | 'place', number> = {
  train: 33,
  sbahn: 22,
  ubahn: 15,
  metro: 15,
  tram: 10,
  bus: 10,
  ferry: 8,
  other: 12,
  place: 12,
};

/** How long a demo ride runs before the alarm should ring. */
const DEMO_LEAD_SEC = 40;

/**
 * Where a demo ride starts: far enough out that the alarm rings about [DEMO_LEAD_SEC] after the
 * start, on the side of the stop where the user is (or west of it when we do not know).
 */
export function demoRide(
  destination: { latitude: number; longitude: number },
  kind: StopKind | 'place',
  w: WakeOptions,
  from: { latitude: number; longitude: number } | null,
): { demoFromLatitude: number; demoFromLongitude: number; demoSpeedMps: number } {
  const speed = DEMO_SPEED_MPS[kind];
  const byTime = w.mode === 'arrive' && w.wakeBy === 'time';
  const startM = (byTime ? w.minutesBefore * 60 * speed : w.radiusM) + DEMO_LEAD_SEC * speed;
  const cosLat = Math.cos((destination.latitude * Math.PI) / 180);
  let north = 0;
  let east = -1;
  if (from) {
    const dn = (from.latitude - destination.latitude) * 110_540;
    const de = (from.longitude - destination.longitude) * 111_320 * cosLat;
    const len = Math.hypot(dn, de);
    if (len > 50) {
      north = dn / len;
      east = de / len;
    }
  }
  return {
    demoFromLatitude: destination.latitude + (north * startM) / 110_540,
    demoFromLongitude: destination.longitude + (east * startM) / (111_320 * cosLat),
    demoSpeedMps: speed,
  };
}

/** Remembers the choices for next time (the wake-by default stays per stop kind). */
export function rememberWake(prefs: Preferences, w: WakeOptions): Preferences {
  return { ...prefs, radiusM: w.radiusM, minutesBefore: w.minutesBefore, strength: w.strength };
}
