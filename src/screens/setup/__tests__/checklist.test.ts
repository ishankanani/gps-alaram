import { describe, expect, it } from 'vitest';

import type { SetupStatus } from '../../../../modules/trip-alarm/src/TripAlarm.types';
import { batteryHelpUrl, batteryHint, itemDone, newlyDone, summarize } from '../checklist';

const all: SetupStatus = {
  location: 'precise',
  locationServices: true,
  notifications: true,
  fullScreenAlarm: true,
  exactAlarms: true,
  batteryUnrestricted: true,
  manufacturer: 'Google',
  sdkInt: 35,
};

describe('setup checklist', () => {
  it('counts what is done and what is missing', () => {
    expect(summarize(all)).toEqual({ requiredMissing: 0, recommendedMissing: 0, done: 6, total: 6, ready: true });
    const fresh: SetupStatus = { ...all, location: 'approximate', notifications: false, batteryUnrestricted: false };
    expect(summarize(fresh)).toEqual({ requiredMissing: 2, recommendedMissing: 1, done: 3, total: 6, ready: false });
    expect(itemDone(fresh, 'location')).toBe(false);
    expect(itemDone(fresh, 'services')).toBe(true);
  });

  it('notices items that turned done', () => {
    const before: SetupStatus = { ...all, notifications: false, exactAlarms: false };
    expect(newlyDone(before, { ...before, notifications: true })).toEqual(['notifications']);
    expect(newlyDone(before, all)).toEqual(['notifications', 'exact']);
    expect(newlyDone(null, all)).toEqual([]);
  });

  it('knows battery savers by brand', () => {
    expect(batteryHint('samsung')).toBe('setup.battery.samsung');
    expect(batteryHint('Redmi')).toBe('setup.battery.xiaomi');
    expect(batteryHint('HONOR')).toBe('setup.battery.huawei');
    expect(batteryHint('Google')).toBeNull();
    expect(batteryHelpUrl('realme')).toBe('https://dontkillmyapp.com/oppo');
    expect(batteryHelpUrl('')).toBe('https://dontkillmyapp.com/');
  });
});
