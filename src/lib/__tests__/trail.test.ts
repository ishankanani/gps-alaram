import { describe, expect, it } from 'vitest';

import type { TripStatus } from '../../../modules/trip-alarm/src/TripAlarm.types';
import { EMPTY_TRAIL, extendTrail } from '../trail';

const trip = { id: 'a', label: 'X', latitude: 48, longitude: 11, radiusM: 300, mode: 'arrive', minutesBefore: null, strength: 'normal', useMiles: false, startedAt: 0 } as const;
const at = (latitude: number, extra: Partial<TripStatus> = {}): TripStatus => ({ trip, state: 'tracking', latitude, longitude: 11, ...extra });

describe('extendTrail', () => {
  it('collects real fixes at least 10 m apart', () => {
    let t = extendTrail(EMPTY_TRAIL, at(48.0));
    t = extendTrail(t, at(48.00005)); // about 5 m: skipped
    t = extendTrail(t, at(48.0002)); // about 22 m
    expect(t.points.map((p) => p.latitude)).toEqual([48.0, 48.0002]);
  });

  it('leaves estimates out and starts over for a new trip', () => {
    let t = extendTrail(EMPTY_TRAIL, at(48.0));
    t = extendTrail(t, at(48.01, { estimated: true }));
    expect(t.points).toHaveLength(1);
    t = extendTrail(t, { ...at(48.02), trip: { ...trip, id: 'b' } });
    expect(t).toEqual({ tripId: 'b', points: [{ latitude: 48.02, longitude: 11 }] });
  });
});
