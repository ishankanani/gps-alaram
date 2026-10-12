import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ActiveTrip } from '../../../modules/trip-alarm/src/TripAlarm.types';
import {
  addMonths,
  buildTripRecord,
  calendarDaysBetween,
  compareMonths,
  firstMonth,
  groupByDay,
  lastTripTo,
  matchesFilter,
  MAX_TRIPS,
  monthStats,
  outcomeOf,
  parseHistory,
  simplifyTrail,
  trailLength,
  tripBadge,
  upsertTrip,
  type TripRecord,
} from '../history';

// An in-memory file system for the store tests (hoisted above the imports by vitest).
const files = vi.hoisted(() => new Map<string, string>());
vi.mock('expo-file-system', () => ({
  Paths: { document: 'doc' },
  File: class {
    private name: string;
    constructor(_dir: unknown, name: string) {
      this.name = name;
    }
    get exists() {
      return files.has(this.name);
    }
    text() {
      return Promise.resolve(files.get(this.name) ?? '');
    }
    create() {
      files.set(this.name, '');
    }
    write(content: string) {
      files.set(this.name, content);
    }
  },
}));

const T0 = new Date(2026, 9, 11, 7, 58).getTime();

function activeTrip(over: Partial<ActiveTrip> = {}): ActiveTrip {
  return {
    id: '1760162280000',
    label: 'München Hbf',
    latitude: 48.14,
    longitude: 11.558,
    radiusM: 300,
    mode: 'arrive',
    minutesBefore: 2,
    strength: 'normal',
    useMiles: false,
    startedAt: T0,
    ...over,
  };
}

function record(over: Partial<TripRecord> = {}): TripRecord {
  return {
    ...buildTripRecord({
      trip: activeTrip(),
      place: null,
      endedAt: T0 + 23 * 60_000,
      event: { reason: 'dismissed', tripId: '1760162280000', trigger: 'ETA' },
      rang: { at: T0 + 21 * 60_000, distanceM: 1100, etaSec: 120 },
      trail: [],
      gpsLostMs: 0,
    }),
    ...over,
  };
}

describe('trails', () => {
  it('measures the way travelled', () => {
    // About 1.11 km per 0.01 degrees of latitude.
    const length = trailLength([
      { latitude: 48.0, longitude: 11.0 },
      { latitude: 48.01, longitude: 11.0 },
      { latitude: 48.02, longitude: 11.0 },
    ]);
    expect(length).toBeGreaterThan(2200);
    expect(length).toBeLessThan(2250);
    expect(trailLength([])).toBe(0);
  });

  it('keeps at most the given number of points, first and last included', () => {
    const points = Array.from({ length: 500 }, (_, i) => ({ latitude: 48 + i / 1000, longitude: 11.123456789 }));
    const simple = simplifyTrail(points, 64);
    expect(simple).toHaveLength(64);
    expect(simple[0]).toEqual([48, 11.12346]);
    expect(simple[63]).toEqual([48.499, 11.12346]);
    expect(simplifyTrail(points.slice(0, 3), 64)).toHaveLength(3);
  });
});

describe('records', () => {
  it('maps the end of a trip to an outcome', () => {
    expect(outcomeOf({ reason: 'dismissed' }, false, false)).toBe('woke');
    expect(outcomeOf({ reason: 'stopped' }, false, true)).toBe('woke');
    expect(outcomeOf({ reason: 'stopped' }, false, false)).toBe('ended');
    expect(outcomeOf({ reason: 'error', message: 'x' }, false, false)).toBe('error');
    expect(outcomeOf(null, true, false)).toBe('stoppedByPhone');
    expect(outcomeOf(null, false, false)).toBe('ended');
  });

  it('builds a record from what the trip provider saw', () => {
    const r = buildTripRecord({
      trip: activeTrip({ demo: true }),
      place: { id: 'de:8000261', name: 'München Hbf', context: 'München', latitude: 48.1402, longitude: 11.5586, kind: 'train', modes: 7 },
      endedAt: T0 + 23 * 60_000,
      event: { reason: 'dismissed', tripId: 'abc', trigger: 'ETA', logName: 'trip-abc.csv' },
      rang: null,
      trail: [
        { latitude: 48.0, longitude: 11.5 },
        { latitude: 48.01, longitude: 11.5 },
      ],
      gpsLostMs: 1234.4,
    });
    expect(r).toMatchObject({
      id: 'abc',
      outcome: 'woke',
      demo: true,
      minutesBefore: 2,
      trigger: 'ETA',
      logName: 'trip-abc.csv',
      gpsLostMs: 1234,
      place: { id: 'de:8000261', kind: 'train', modes: 7 },
      // A dismissed alarm rang, even unseen.
      rang: { at: null, distanceM: null, etaSec: null },
    });
    expect(r.distanceM).toBeGreaterThan(1100);
    expect(r.trail).toHaveLength(2);
  });

  it('falls back to the trip when the place is unknown', () => {
    const r = buildTripRecord({
      trip: activeTrip({ mode: 'leave', minutesBefore: 5 }),
      place: null,
      endedAt: null,
      event: null,
      stoppedByPhone: true,
      rang: null,
      trail: [],
      gpsLostMs: 0,
    });
    expect(r.place).toEqual({ id: 'pin:48.14,11.558', name: 'München Hbf', context: '', latitude: 48.14, longitude: 11.558, kind: 'place', modes: 0 });
    expect(r.outcome).toBe('stoppedByPhone');
    expect(r.minutesBefore).toBeNull();
    expect(r.endedAt).toBeNull();
    expect(r.rang).toBeNull();
  });

  it('upserts newest first, keeps feedback and a stopped-by-phone outcome', () => {
    const a = record({ id: 'a', startedAt: T0 });
    const b = record({ id: 'b', startedAt: T0 + 3_600_000 });
    let list = upsertTrip(upsertTrip([], a), b);
    expect(list.map((t) => t.id)).toEqual(['b', 'a']);
    list = upsertTrip(list, { ...a, feedback: 'late' });
    list = upsertTrip(list, { ...a, distanceM: 999 });
    expect(list.find((t) => t.id === 'a')).toMatchObject({ feedback: 'late', distanceM: 999 });

    const stopped = record({ id: 's', outcome: 'stoppedByPhone' });
    list = upsertTrip(upsertTrip([], stopped), { ...stopped, outcome: 'ended', feedback: 'right' });
    expect(list[0]).toMatchObject({ outcome: 'stoppedByPhone', feedback: 'right' });
  });

  it(`keeps at most ${MAX_TRIPS} trips`, () => {
    let list: TripRecord[] = [];
    for (let i = 0; i < MAX_TRIPS + 5; i++) list = upsertTrip(list, record({ id: String(i), startedAt: T0 + i }));
    expect(list).toHaveLength(MAX_TRIPS);
    expect(list[0].id).toBe(String(MAX_TRIPS + 4));
  });

  it('parses the file and drops broken entries', () => {
    const good = record({ id: 'g' });
    const text = JSON.stringify({ version: 1, trips: [good, { id: 3 }, null, { ...good, id: 'h', trail: undefined, feedback: undefined }] });
    const parsed = parseHistory(text);
    expect(parsed.map((t) => t.id).sort()).toEqual(['g', 'h']);
    expect(parsed.find((t) => t.id === 'h')).toMatchObject({ trail: [], feedback: null });
    expect(parseHistory('not json')).toEqual([]);
    expect(parseHistory('{}')).toEqual([]);
  });
});

describe('reading the history', () => {
  it('gives each trip a badge and filters by it', () => {
    expect(tripBadge(record())).toBe('onTime');
    expect(tripBadge(record({ feedback: 'late' }))).toBe('tooLate');
    expect(tripBadge(record({ feedback: 'early' }))).toBe('tooEarly');
    expect(tripBadge(record({ outcome: 'ended' }))).toBe('ended');
    expect(tripBadge(record({ outcome: 'stoppedByPhone' }))).toBe('stoppedByPhone');
    expect(tripBadge(record({ outcome: 'error' }))).toBe('didntStart');
    expect(tripBadge(record({ demo: true, outcome: 'error' }))).toBe('demo');

    const late = record({ feedback: 'late' });
    expect(matchesFilter(late, 'woke')).toBe(true);
    expect(matchesFilter(late, 'problems')).toBe(true);
    expect(matchesFilter(late, 'ended')).toBe(false);
    expect(matchesFilter(record({ demo: true }), 'demo')).toBe(true);
    expect(matchesFilter(record({ demo: true }), 'woke')).toBe(false);
    expect(matchesFilter(record({ outcome: 'stoppedByPhone' }), 'problems')).toBe(true);
    expect(matchesFilter(record({ outcome: 'ended' }), 'all')).toBe(true);
  });

  it('counts a month without demo rides or trips that never started', () => {
    const oct = { year: 2026, month: 9 };
    const trips = [
      record({ id: '1', distanceM: 10_000 }),
      record({ id: '2', distanceM: 4_000, feedback: 'late' }),
      record({ id: '3', distanceM: 1_000, outcome: 'ended' }),
      record({ id: '4', outcome: 'stoppedByPhone', endedAt: null, distanceM: 500 }),
      record({ id: '5', demo: true, distanceM: 99_000 }),
      record({ id: '6', outcome: 'error' }),
      record({ id: '7', startedAt: new Date(2026, 8, 30, 23, 0).getTime(), endedAt: new Date(2026, 8, 30, 23, 30).getTime() }),
    ];
    expect(monthStats(trips, oct)).toEqual({
      trips: 4,
      distanceM: 15_500,
      rated: 3,
      onTime: 1,
      onBoardMs: 3 * 23 * 60_000,
    });
    expect(monthStats(trips, { year: 2026, month: 8 }).trips).toBe(1);
    expect(monthStats([], oct)).toEqual({ trips: 0, distanceM: 0, rated: 0, onTime: 0, onBoardMs: 0 });
  });

  it('steps through months and days', () => {
    expect(addMonths({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 });
    expect(addMonths({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 });
    expect(compareMonths({ year: 2026, month: 9 }, { year: 2026, month: 10 })).toBe(-1);
    expect(calendarDaysBetween(new Date(2026, 9, 10, 23, 59).getTime(), new Date(2026, 9, 11, 0, 1).getTime())).toBe(1);
    expect(calendarDaysBetween(T0, T0)).toBe(0);
  });

  it('groups trips by day, newest first', () => {
    const groups = groupByDay([
      record({ id: 'a', startedAt: new Date(2026, 9, 10, 8, 0).getTime() }),
      record({ id: 'b', startedAt: new Date(2026, 9, 11, 7, 0).getTime() }),
      record({ id: 'c', startedAt: new Date(2026, 9, 11, 18, 0).getTime() }),
    ]);
    expect(groups.map((g) => g.trips.map((t) => t.id))).toEqual([['c', 'b'], ['a']]);
    expect(groups[0].day).toBe(new Date(2026, 9, 11).getTime());
  });

  it('finds the last trip to a place and the first month', () => {
    const trips = [record({ id: 'old', startedAt: T0 - 86_400_000 }), record({ id: 'new' })];
    expect(lastTripTo(trips, { id: 'other', name: 'x', latitude: 48.14, longitude: 11.558 })?.id).toBe('new');
    expect(lastTripTo(trips, { id: 'other', name: 'x', latitude: 50, longitude: 8 })).toBeNull();
    expect(firstMonth(trips)).toEqual({ year: 2026, month: 9 });
    expect(firstMonth([])).toBeNull();
  });
});

describe('the store', () => {
  beforeEach(() => {
    files.clear();
    vi.resetModules();
  });

  it('applies changes made before the file was read, then writes through', async () => {
    files.set('stopwake-history.json', JSON.stringify({ version: 1, trips: [record({ id: 'saved' })] }));
    const store = await import('../history');
    store.recordTrip(record({ id: 'fresh', startedAt: T0 + 1000 }));
    await store.loadHistory();
    expect(store.getHistory().trips.map((t) => t.id)).toEqual(['fresh', 'saved']);
    expect(parseHistory(files.get('stopwake-history.json') ?? '').map((t) => t.id)).toEqual(['fresh', 'saved']);

    store.setTripFeedback('saved', 'early');
    expect(store.getHistory().trips.find((t) => t.id === 'saved')?.feedback).toBe('early');
    store.deleteTrip('fresh');
    expect(store.getHistory().trips.map((t) => t.id)).toEqual(['saved']);
    store.clearHistory();
    expect(parseHistory(files.get('stopwake-history.json') ?? '')).toEqual([]);
  });

  it('keeps feedback given before the trip was recorded', async () => {
    const store = await import('../history');
    await store.loadHistory();
    store.setTripFeedback('later', 'right');
    store.recordTrip(record({ id: 'later' }));
    expect(store.getHistory().trips[0]).toMatchObject({ id: 'later', feedback: 'right' });
  });
});
