import type { AlarmMode, AlarmStrength } from '../../modules/trip-alarm/src';
import type { Lang } from '../i18n';
import type { Place } from './geocode';

// Plain types and defaults, no native imports, so pure helpers and tests can use them.

export type WakeBy = 'distance' | 'time';

export type Preferences = {
  /** null follows the phone's language. */
  language: Lang | null;
  onboarded: boolean;
  wakeBy: WakeBy;
  radiusM: number;
  minutesBefore: number;
  strength: AlarmStrength;
  mode: AlarmMode;
  useMiles: boolean;
};

export type SavedData = {
  favourites: Place[];
  recents: Place[];
  preferences: Preferences;
};

export const DEFAULT_PREFERENCES: Preferences = {
  language: null,
  onboarded: false,
  wakeBy: 'distance',
  radiusM: 300,
  minutesBefore: 2,
  strength: 'normal',
  mode: 'arrive',
  useMiles: false,
};
