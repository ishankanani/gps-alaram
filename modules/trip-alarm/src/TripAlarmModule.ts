import { NativeModule, requireOptionalNativeModule } from 'expo';

import type {
  ActiveTrip,
  AlarmStrength,
  SettingsKind,
  SetupStatus,
  TripAlarmEvents,
  TripLogFile,
  TripOptions,
  TripStatus,
  WakeStyle,
} from './TripAlarm.types';

declare class TripAlarmModule extends NativeModule<TripAlarmEvents> {
  startTrip(options: TripOptions): Promise<ActiveTrip>;
  stopTrip(): Promise<void>;
  dismissAlarm(): Promise<void>;
  snoozeAlarm(): Promise<void>;
  keepTracking(): Promise<void>;
  getActiveTrip(): TripStatus | null;
  /** Language of the alarm screen and notifications, one of the app's language codes. */
  setLanguage(code: string): void;
  /** Plays the alarm as a trip would (Android: the alarm screen; iOS: about 5 s of sound and vibration). */
  testAlarm(strength: AlarmStrength, wakeStyle?: WakeStyle): Promise<void>;
  getSetupStatus(): SetupStatus;
  requestNotificationPermission(): Promise<{ granted: boolean }>;
  openSettings(kind: SettingsKind): boolean;
  listTripLogs(): TripLogFile[];
  shareTripLog(name: string): Promise<void>;
  /** Unpacks a .gz file (a file:// URI or path) and resolves to the unpacked size in bytes. */
  gunzip(source: string, destination: string): Promise<number>;
}

/** Null where the native module is not built in (web, Expo Go). */
export default requireOptionalNativeModule<TripAlarmModule>('TripAlarm');
