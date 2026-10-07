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

/**
 * Trains are fast, so a few hundred metres is only seconds of warning: they default to time.
 * Buses and trams default to distance, with the user's last choices.
 */
export function defaultWake(kind: StopKind | 'place', prefs: Preferences): WakeOptions {
  return {
    wakeBy: kind === 'train' ? 'time' : 'distance',
    radiusM: prefs.radiusM,
    minutesBefore: prefs.minutesBefore,
    mode: 'arrive',
    strength: prefs.strength,
  };
}

/** Distance of 200 m or less before a train station: the doors open seconds later. */
export function tooShortForTrain(kind: StopKind | 'place', w: WakeOptions): boolean {
  return kind === 'train' && w.mode === 'arrive' && w.wakeBy === 'distance' && w.radiusM <= 200;
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

/** Remembers the choices for next time (the wake-by default stays per stop kind). */
export function rememberWake(prefs: Preferences, w: WakeOptions): Preferences {
  return { ...prefs, radiusM: w.radiusM, minutesBefore: w.minutesBefore, strength: w.strength };
}
