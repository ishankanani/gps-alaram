export type AlarmMode = 'arrive' | 'leave';
export type AlarmStrength = 'gentle' | 'normal' | 'heavy';
export type GpsHealth = 'waiting' | 'good' | 'weak' | 'lost';
export type TrackingTier = 'far' | 'mid' | 'near';
export type TripState = 'tracking' | 'ringing' | 'snoozed' | 'stopped';
export type TriggerReason =
  | 'ARRIVED'
  | 'ETA'
  | 'PASSED_THROUGH'
  | 'CLOSEST_POINT_PASSED'
  | 'ESTIMATED'
  | 'LEFT_AREA';

export type TripOptions = {
  latitude: number;
  longitude: number;
  radiusM: number;
  mode: AlarmMode;
  /** Arrive mode: also ring this many minutes before arrival. */
  minutesBefore?: number | null;
  label: string;
  strength: AlarmStrength;
  useMiles: boolean;
};

export type ActiveTrip = {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  radiusM: number;
  mode: AlarmMode;
  minutesBefore: number | null;
  strength: AlarmStrength;
  useMiles: boolean;
  startedAt: number;
};

export type TripStatus = {
  trip: ActiveTrip | null;
  state: TripState;
  distanceM?: number | null;
  etaSec?: number | null;
  speedMps?: number | null;
  accuracyM?: number | null;
  lastFixAgeMs?: number | null;
  health?: GpsHealth;
  tier?: TrackingTier | null;
  armed?: boolean;
  trigger?: TriggerReason | null;
};

export type SetupStatus = {
  location: 'precise' | 'approximate' | 'none';
  locationServices: boolean;
  notifications: boolean;
  fullScreenAlarm: boolean;
  exactAlarms: boolean;
  batteryUnrestricted: boolean;
  manufacturer: string;
  sdkInt: number;
};

export type SettingsKind =
  | 'notifications'
  | 'fullScreenAlarm'
  | 'exactAlarms'
  | 'battery'
  | 'location'
  | 'app';

export type TripLogFile = { name: string; sizeBytes: number; modifiedAt: number };

export type AlarmEvent = { reason: TriggerReason; resumed: boolean };

export type TripEndedEvent = {
  reason: 'stopped' | 'dismissed' | 'error';
  trigger?: TriggerReason | null;
  tripId?: string | null;
  logName?: string | null;
  message?: string;
};

export type TripAlarmEvents = {
  onStatus: (status: TripStatus) => void;
  onAlarm: (event: AlarmEvent) => void;
  onTripEnded: (event: TripEndedEvent) => void;
};
