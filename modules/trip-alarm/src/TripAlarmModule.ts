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
} from './TripAlarm.types';

declare class TripAlarmModule extends NativeModule<TripAlarmEvents> {
  startTrip(options: TripOptions): Promise<ActiveTrip>;
  stopTrip(): Promise<void>;
  dismissAlarm(): Promise<void>;
  snoozeAlarm(): Promise<void>;
  keepTracking(): Promise<void>;
  getActiveTrip(): TripStatus | null;
  testAlarm(strength: AlarmStrength): Promise<void>;
  getSetupStatus(): SetupStatus;
  requestNotificationPermission(): Promise<{ granted: boolean }>;
  openSettings(kind: SettingsKind): boolean;
  listTripLogs(): TripLogFile[];
  shareTripLog(name: string): Promise<void>;
}

/** Null where the native module is not built in (iOS for now, web, Expo Go). */
export default requireOptionalNativeModule<TripAlarmModule>('TripAlarm');
