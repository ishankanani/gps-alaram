import type { AlarmMode, AlarmStrength, WakeStyle } from '../../modules/trip-alarm/src';
import type { Lang } from '../i18n';
import type { Place } from './geocode';

// Plain types and defaults, no native imports, so pure helpers and tests can use them.

export type WakeBy = 'distance' | 'time';

/** Settings › Appearance: follow the phone, or always light or dark. */
export type AppearanceChoice = 'system' | 'light' | 'dark';

export type Preferences = {
  /** null follows the phone's language. */
  language: Lang | null;
  onboarded: boolean;
  wakeBy: WakeBy;
  radiusM: number;
  minutesBefore: number;
  strength: AlarmStrength;
  /** Sound + vibration, vibrate only or sound only. */
  wakeStyle: WakeStyle;
  mode: AlarmMode;
  useMiles: boolean;
  appearance: AppearanceChoice;
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
  wakeStyle: 'soundVibration',
  mode: 'arrive',
  useMiles: false,
  appearance: 'system',
};
