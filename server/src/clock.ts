/**
 * Server time. Everything reads the time through a Clock so tests can move it (spec 6.11).
 * Database times are integer Unix milliseconds (UTC); wire times are ISO 8601 with milliseconds.
 */
export type Clock = { now(): number };

export const systemClock: Clock = { now: () => Date.now() };

export type TestClock = Clock & {
  set(ms: number | string): void;
  advance(ms: number): void;
};

/** A clock that only moves when told to. Default start: 2026-10-10T08:00:00.000Z. */
export function createTestClock(start: number | string = Date.UTC(2026, 9, 10, 8, 0, 0)): TestClock {
  const toMs = (v: number | string): number => {
    const ms = typeof v === 'number' ? v : Date.parse(v);
    if (!Number.isFinite(ms)) throw new Error(`Invalid clock time: ${String(v)}`);
    return ms;
  };
  let t = toMs(start);
  return {
    now: () => t,
    set: (v) => {
      t = toMs(v);
    },
    advance: (ms) => {
      t += ms;
    },
  };
}

export const SECOND = 1_000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** 2026-10-10T08:15:00.000Z */
export const iso = (ms: number): string => new Date(ms).toISOString();
export const isoOrNull = (ms: number | null | undefined): string | null =>
  ms === null || ms === undefined ? null : iso(ms);
