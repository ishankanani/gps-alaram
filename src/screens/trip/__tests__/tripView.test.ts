import { describe, expect, it } from 'vitest';

import type { ActiveTrip, TripStatus } from '../../../../modules/trip-alarm/src/TripAlarm.types';
import {
  arrivedVariant,
  formatClock,
  formatCountdown,
  gpsBadge,
  heroLayout,
  observeEnd,
  observeStatus,
  predictRingAt,
  shouldUpsell,
  tripProgress,
  UPSELL_EVERY_MS,
  wakeDistanceM,
  wakeOfTrip,
  type TripFacts,
} from '../tripView';

const TRIP: ActiveTrip = {
  id: 't1',
  label: 'München Hbf',
  latitude: 48.14,
  longitude: 11.56,
  radiusM: 300,
  mode: 'arrive',
  minutesBefore: null,
  strength: 'normal',
  useMiles: false,
  startedAt: 1_000,
};
const BY_TIME: ActiveTrip = { ...TRIP, minutesBefore: 2 };

function status(change: Partial<TripStatus>): TripStatus {
  return { trip: TRIP, state: 'tracking', ...change };
}

describe('gpsBadge', () => {
  it('is honest about GPS', () => {
    expect(gpsBadge({ health: 'good', accuracyM: 4.6 })).toEqual({ tone: 'success', key: 'trip.badge.good', params: { meters: 5 }, pulse: false });
    expect(gpsBadge({ health: 'good' }).key).toBe('trip.gps.good');
    expect(gpsBadge({ health: 'weak' }).tone).toBe('warning');
    expect(gpsBadge({ health: 'lost' }).key).toBe('trip.badge.estimating');
    expect(gpsBadge({ health: 'good', estimated: true }).key).toBe('trip.badge.estimating');
    expect(gpsBadge({ health: 'waiting' })).toMatchObject({ tone: 'neutral', pulse: true });
    expect(gpsBadge({})).toMatchObject({ key: 'trip.badge.searching' });
  });
});

describe('stats and progress', () => {
  it('makes the rule unit the hero', () => {
    expect(heroLayout(BY_TIME)).toBe('eta');
    expect(heroLayout(TRIP)).toBe('distance');
    expect(heroLayout({ ...TRIP, mode: 'leave' })).toBe('leave');
  });

  it('finds the wake point', () => {
    expect(wakeDistanceM(TRIP, { distanceM: 2000, etaSec: 400 })).toBe(300);
    // 2 min of 400 s left at 2 km: the alarm rings 600 m out.
    expect(wakeDistanceM(BY_TIME, { distanceM: 2000, etaSec: 400 })).toBe(600);
    expect(wakeDistanceM(BY_TIME, { distanceM: 2000, etaSec: null })).toBe(300);
  });

  it('measures progress from the first fix to the wake point', () => {
    expect(tripProgress(TRIP, { distanceM: null }, null)).toBeNull();
    expect(tripProgress(TRIP, { distanceM: 2300 }, 2300)).toBe(0);
    expect(tripProgress(TRIP, { distanceM: 1300 }, 2300)).toBe(0.5);
    expect(tripProgress(TRIP, { distanceM: 100 }, 2300)).toBe(1);
    expect(tripProgress(TRIP, { distanceM: 250 }, 250)).toBe(1);
    expect(tripProgress({ ...TRIP, mode: 'leave' }, { distanceM: 150 }, 0)).toBe(0.5);
  });

  it('predicts when it rings, only from a real pace', () => {
    const now = 1_000_000;
    expect(predictRingAt(BY_TIME, { state: 'tracking', etaSec: 360 }, now)).toBe(now + 240_000);
    expect(predictRingAt(BY_TIME, { state: 'tracking', etaSec: null }, now)).toBeNull();
    expect(predictRingAt(TRIP, { state: 'tracking', distanceM: 1300, speedMps: 10 }, now)).toBe(now + 100_000);
    expect(predictRingAt(TRIP, { state: 'tracking', distanceM: 1300, speedMps: 0.2 }, now)).toBeNull();
    expect(predictRingAt(TRIP, { state: 'ringing', distanceM: 1300, speedMps: 10 }, now)).toBeNull();
    expect(predictRingAt({ ...TRIP, mode: 'leave' }, { state: 'tracking', distanceM: 1300, speedMps: 10 }, now)).toBeNull();
  });
});

describe('clock and countdown', () => {
  it('follows the phone’s 24-hour setting', () => {
    const at = new Date(2026, 9, 12, 8, 21);
    expect(formatClock(at, true)).toBe('08:21');
    expect(formatClock(at, false)).toBe('8:21 AM');
    expect(formatClock(new Date(2026, 9, 12, 0, 5), false)).toBe('12:05 AM');
    expect(formatClock(new Date(2026, 9, 12, 13, 5), false)).toBe('1:05 PM');
  });

  it('counts down', () => {
    expect(formatCountdown(42)).toBe('0:42');
    expect(formatCountdown(60)).toBe('1:00');
    expect(formatCountdown(-3)).toBe('0:00');
    expect(formatCountdown(41.2)).toBe('0:42');
  });
});

describe('Arrived', () => {
  it('picks the variant', () => {
    expect(arrivedVariant({ reason: 'dismissed' }, false, true)).toBe('arrived');
    expect(arrivedVariant({ reason: 'stopped' }, false, true)).toBe('arrived');
    expect(arrivedVariant({ reason: 'stopped' }, false, false)).toBe('ended');
    expect(arrivedVariant({ reason: 'stopped' }, true, false)).toBe('phone');
    expect(arrivedVariant({ reason: 'error' }, true, false)).toBe('error');
    expect(arrivedVariant(null, false, false)).toBe('ended');
  });

  it('starts a trip again with its choices', () => {
    expect(wakeOfTrip(BY_TIME, 500)).toMatchObject({ wakeBy: 'time', minutesBefore: 2, radiusM: 500, mode: 'arrive' });
    expect(wakeOfTrip(TRIP, 500)).toMatchObject({ wakeBy: 'distance', radiusM: 300 });
  });

  it('suggests Heavy sleeper only to Free riders who slept through it, at most every 14 days', () => {
    const base = { isPro: false, demo: false, feedback: null, snoozes: 0, lastShownAt: null, now: UPSELL_EVERY_MS * 2 };
    expect(shouldUpsell(base)).toBe(false);
    expect(shouldUpsell({ ...base, feedback: 'late' })).toBe(true);
    expect(shouldUpsell({ ...base, snoozes: 2 })).toBe(true);
    expect(shouldUpsell({ ...base, feedback: 'late', isPro: true })).toBe(false);
    expect(shouldUpsell({ ...base, feedback: 'late', demo: true })).toBe(false);
    expect(shouldUpsell({ ...base, feedback: 'late', lastShownAt: base.now - 1000 })).toBe(false);
  });
});

describe('trip facts', () => {
  it('collects what the app saw', () => {
    let facts: TripFacts | null = null;
    facts = observeStatus(facts, status({ health: 'waiting' }), 0);
    facts = observeStatus(facts, status({ distanceM: 2000, latitude: 48.0, longitude: 11.5, health: 'good' }), 1000);
    facts = observeStatus(facts, status({ distanceM: 1500, latitude: 48.0001, longitude: 11.5, health: 'good' }), 2000);
    facts = observeStatus(facts, status({ distanceM: 1400, latitude: 48.01, longitude: 11.5, estimated: true, health: 'lost' }), 3000);
    facts = observeStatus(facts, status({ distanceM: 900, latitude: 48.02, longitude: 11.5, health: 'good' }), 8000);
    facts = observeStatus(facts, status({ state: 'ringing', distanceM: 600, etaSec: 120 }), 9000);
    facts = observeStatus(facts, status({ state: 'snoozed' }), 10_000);
    facts = observeStatus(facts, status({ state: 'snoozed' }), 11_000);
    facts = observeStatus(facts, status({ state: 'ringing' }), 70_000);
    facts = observeStatus(facts, status({ state: 'snoozed' }), 71_000);
    expect(facts).toMatchObject({
      firstDistanceM: 2000,
      rang: { at: 9000, distanceM: 600, etaSec: 120 },
      snoozes: 2,
      snoozedAt: 71_000,
      gpsLostMs: 5000,
    });
    // The 11 m step counts, the estimate does not.
    expect(facts?.trail).toHaveLength(3);
    const ended = observeEnd(facts!, { reason: 'dismissed', tripId: 't1' }, 80_000);
    expect(ended).toMatchObject({ endedAt: 80_000, event: { reason: 'dismissed' } });
  });

  it('starts over for a new trip and notes a trip the phone stopped', () => {
    const first = observeStatus(null, status({ distanceM: 2000 }), 0);
    const second = observeStatus(first, { trip: { ...TRIP, id: 't2' }, state: 'tracking', distanceM: 500 }, 1);
    expect(second).toMatchObject({ trip: { id: 't2' }, firstDistanceM: 500 });
    expect(observeStatus(second, { trip: { ...TRIP, id: 't2' }, state: 'stopped' }, 2)?.stoppedByPhone).toBe(true);
    expect(observeStatus(second, { trip: null, state: 'stopped' }, 2)).toBe(second);
  });
});
