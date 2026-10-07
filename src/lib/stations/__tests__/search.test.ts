/// <reference types="node" />
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

import { nearestStop, searchStops, stopsInBounds, type StopsDb } from '../search';

// Runs the app's search code against the real generated database (npm run build:stations).
const DB_PATH = 'assets/stations/germany-stops.db';
const require = createRequire(import.meta.url);

function openDb(): StopsDb {
  const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');
  const db = new DatabaseSync(DB_PATH, { readOnly: true });
  return {
    all: async <T,>(sql: string, params: (string | number)[]) => db.prepare(sql).all(...params) as T[],
  };
}

const HEILBRONN = { latitude: 49.1427, longitude: 9.2109 };

describe.skipIf(!existsSync(DB_PATH))('station search on the real database', () => {
  const db = openDb();
  const titles = async (q: string, near?: typeof HEILBRONN) => (await searchStops(db, q, near)).map((s) => s.name);

  it('finds big stations by any spelling', async () => {
    for (const q of ['München Hbf', 'muenchen hbf', 'munchen hauptbahnhof', 'Münch Hb']) {
      expect((await titles(q))[0], q).toBe('München Hbf');
    }
  });

  it('prefers the Hbf near you', async () => {
    expect((await titles('Hauptbahnhof', HEILBRONN))[0]).toBe('Heilbronn Hbf');
    expect((await titles('Hbf'))[0]).toBe('München Hbf');
  });

  it('finds Frankfurt am Main stations', async () => {
    const results = await titles('Frankfurt Main Hbf');
    expect(results[0]).toBe('Frankfurt(Main)Hbf');
  });

  it('finds small bus stops near you', async () => {
    const results = await searchStops(db, 'Pfühlpark', HEILBRONN);
    expect(results.map((s) => s.title)).toContain('Pfühlpark Süd');
    expect(results[0].place).toBe('Heilbronn');
  });

  it('returns nothing for one character or punctuation', async () => {
    expect(await titles('a')).toEqual([]);
    expect(await titles('**')).toEqual([]);
  });

  it('lists stops in the visible map area, most important first', async () => {
    const stops = await stopsInBounds(db, [9.19, 49.13, 9.24, 49.16], 50);
    expect(stops.length).toBeGreaterThan(10);
    expect(stops[0].name).toBe('Heilbronn Hbf');
  });

  it('snaps a long-press to the stop under your finger', async () => {
    const hbf = (await searchStops(db, 'Heilbronn Hbf'))[0];
    const snapped = await nearestStop(db, { latitude: hbf.latitude + 0.0004, longitude: hbf.longitude }, 120);
    expect(snapped?.name).toBe('Heilbronn Hbf');
    expect(await nearestStop(db, { latitude: 54.9, longitude: 7.0 }, 120)).toBeNull();
  });

  it('answers quickly', async () => {
    const started = performance.now();
    for (const q of ['b', 'ba', 'bah', 'bahn', 'bahnh', 'bahnho', 'bahnhof']) await searchStops(db, q, HEILBRONN);
    expect(performance.now() - started).toBeLessThan(2000);
  });
});
