export type AlarmMode = 'arrive' | 'leave';
export type AlarmStrength = 'gentle' | 'normal' | 'heavy';
/**
 * How the alarm wakes you: sound and vibration (the default), a silent strong repeating
 * vibration, or sound without vibration.
 */
export type WakeStyle = 'soundVibration' | 'vibrate' | 'sound';
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
  /** Default 'soundVibration' (what every build before this option did). */
  wakeStyle?: WakeStyle;
  useMiles: boolean;
  /** A demo ride: simulated movement from here to the stop at this speed, instead of GPS. */
  demoFromLatitude?: number | null;
  demoFromLongitude?: number | null;
  demoSpeedMps?: number | null;
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
  /** Missing from builds before the option: treat as 'soundVibration'. */
  wakeStyle?: WakeStyle;
  useMiles: boolean;
  startedAt: number;
  demo?: boolean;
};

export type TripStatus = {
  trip: ActiveTrip | null;
  state: TripState;
  /** Last position fix, for the trip map. */
  latitude?: number | null;
  longitude?: number | null;
  distanceM?: number | null;
  etaSec?: number | null;
  speedMps?: number | null;
  accuracyM?: number | null;
  lastFixAgeMs?: number | null;
  health?: GpsHealth;
  tier?: TrackingTier | null;
  armed?: boolean;
  trigger?: TriggerReason | null;
  /** No GPS right now: position, distance and ETA are estimated from the last speed. */
  estimated?: boolean;
};

export type SetupStatus = {
  location: 'precise' | 'approximate' | 'none';
  locationServices: boolean;
  notifications: boolean;
  /** iOS: same as timeSensitive. */
  fullScreenAlarm: boolean;
  /** iOS: always true (no such permission). */
  exactAlarms: boolean;
  /** iOS: Low Power Mode is off. */
  batteryUnrestricted: boolean;
  manufacturer: string;
  /** Android API level; iOS major version. */
  sdkInt: number;
  /** Missing on Android builds before iOS support: treat as 'android'. */
  platform?: 'android' | 'ios';
  /** iOS: Time Sensitive notifications are allowed (they break through Focus). */
  timeSensitive?: boolean;
  /** iOS: notifications may play a sound. */
  notificationSound?: boolean;
  /** iOS: Critical Alerts are built in and allowed (ring through the silent switch). */
  criticalAlerts?: boolean;
  /** iOS: "Always" location (lets the app pick a trip up again after iOS closed it). */
  locationAlways?: boolean;
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
