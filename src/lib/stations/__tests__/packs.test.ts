/// <reference types="node" />
import { mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { writeStopsDb, type StopRecord } from '../../../../tools/stops-db.ts';
import { boxContains, PACKS, packsFor, packsNear } from '../countries';
import { nearestStopAll, searchAllStops, SLOT_SIZE, stopsInBoundsAll, withoutDuplicates, type StopsSource } from '../search';
import { MODE, primaryKind, spellings } from '../text';

const require = createRequire(import.meta.url);

function source(slot: number, bounds: StopsSource['bounds'], stops: StopRecord[]): StopsSource {
  const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');
  const path = join(mkdtempSync(join(tmpdir(), 'stops-')), 'stops.db');
  writeStopsDb(path, stops, {});
  const db = new DatabaseSync(path, { readOnly: true });
  return { slot, bounds, db: { all: async <T,>(sql: string, params: (string | number)[]) => db.prepare(sql).all(...params) as T[] } };
}

// A tiny Germany and Austria around Salzburg, where both databases have the main station.
const germany = source(0, [5.5, 47.0, 15.5, 55.2], [
  { name: 'Salzburg Hbf', lat: 47.8128, lon: 13.0457, modes: MODE.ICE | MODE.RE, rank: 420 },
  { name: 'Freilassing', lat: 47.8371, lon: 12.9777, modes: MODE.RE | MODE.SBAHN, rank: 330 },
]);
const austria = source(1, [9.5, 46.37, 17.17, 49.02], [
  { name: 'Salzburg Hauptbahnhof', lat: 47.8129, lon: 13.0456, modes: MODE.TRAIN, rank: 480, aliases: ['Salzburg Hbf'] },
  { name: 'Mirabellplatz, Salzburg', lat: 47.8053, lon: 13.0428, modes: MODE.BUS, rank: 210 },
  { name: 'Wien Hauptbahnhof', lat: 48.1852, lon: 16.3758, modes: MODE.TRAIN | MODE.UBAHN | MODE.TRAM, rank: 560 },
]);
const sources = [germany, austria];

describe('stops from several countries', () => {
  it('searches all databases and ranks the results together', async () => {
    const found = await searchAllStops(sources, 'Mirabell');
    expect(found.map((s) => s.title)).toEqual(['Mirabellplatz']);
    expect(found[0].place).toBe('Salzburg');
    expect(found[0].id).toBeGreaterThan(SLOT_SIZE);

    const wien = await searchAllStops(sources, 'wien hbf');
    expect(wien[0].name).toBe('Wien Hauptbahnhof');
  });

  it('finds aliases', async () => {
    const found = await searchAllStops([austria], 'Salzburg Hbf');
    expect(found[0].name).toBe('Salzburg Hauptbahnhof');
  });

  it('keeps ids unique across databases', async () => {
    const found = await stopsInBoundsAll(sources, [12.9, 47.7, 13.1, 47.9]);
    const ids = found.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('only asks databases that cover the map area', async () => {
    const vienna = await stopsInBoundsAll(sources, [16.3, 48.15, 16.45, 48.22]);
    expect(vienna.map((s) => s.name)).toEqual(['Wien Hauptbahnhof']);
  });

  it('snaps a long-press to the closest stop in any database', async () => {
    const stop = await nearestStopAll(sources, { latitude: 47.8054, longitude: 13.0429 }, 60);
    expect(stop?.title).toBe('Mirabellplatz');
  });

  it('shows a station once when two databases have it, with the local name', () => {
    const fromGermany = { id: 7, name: 'Wien Hbf', title: 'Wien Hbf', place: null, latitude: 48.1851, longitude: 16.3766, modes: MODE.ICE | MODE.IC | MODE.SBAHN, rank: 520 };
    const fromAustria = { id: SLOT_SIZE + 1, name: 'Wien Hauptbahnhof', title: 'Wien Hauptbahnhof', place: null, latitude: 48.185, longitude: 16.3779, modes: MODE.TRAIN | MODE.SBAHN | MODE.TRAM, rank: 477 };
    const busStop = { ...fromAustria, id: SLOT_SIZE + 2, name: 'Hauptbahnhof Ost', title: 'Hauptbahnhof Ost', modes: MODE.BUS, rank: 200 };
    const result = withoutDuplicates([fromGermany, fromAustria, busStop]);
    expect(result.map((s) => s.name)).toEqual(['Wien Hauptbahnhof', 'Hauptbahnhof Ost']);
    expect(result[0].modes).toBe(MODE.ICE | MODE.IC | MODE.SBAHN | MODE.TRAM);
    expect(result[0].rank).toBe(520);
  });

  it('drops the second copy of a border station', () => {
    const a = { id: 1, name: 'Basel SBB', title: 'Basel SBB', place: null, latitude: 47.5476, longitude: 7.5897, modes: MODE.IC, rank: 500 };
    const b = { ...a, id: SLOT_SIZE + 1, latitude: 47.5477, rank: 450 };
    const c = { ...a, id: 3, latitude: 47.6, title: 'Basel SBB', rank: 100 };
    expect(withoutDuplicates([b, a, c]).map((s) => s.id)).toEqual([1, 3]);
  });
});

describe('country catalog', () => {
  it('has unique ids, boxes that make sense and a source for every download', () => {
    expect(new Set(PACKS.map((p) => p.id)).size).toBe(PACKS.length);
    for (const p of PACKS) {
      const [west, south, east, north] = p.box;
      expect(west < east && south < north, p.id).toBe(true);
      expect(p.id === 'de' || !!p.source, p.id).toBe(true);
    }
  });

  it('picks the right regional pack', () => {
    expect(packsFor('us', 40.7128, -74.006).map((p) => p.id)).toEqual(['us-northeast']);
    expect(packsFor('us', 34.05, -118.24).map((p) => p.id)).toEqual(['us-west']);
    expect(packsFor('US', 41.88, -87.63)[0].id).toBe('us-midwest');
    expect(packsFor('at', 48.2, 16.37).map((p) => p.id)).toEqual(['at']);
    expect(packsFor('xx', 0, 0)).toEqual([]);
  });

  it('knows which packs might cover a point', () => {
    const ids = packsNear(48.2082, 16.3738).map((p) => p.id);
    expect(ids).toContain('at');
    expect(boxContains(PACKS[0].box, 52.52, 13.405)).toBe(true);
  });
});

describe('modes and spellings for other countries', () => {
  it('shows trains and metros abroad', () => {
    expect(primaryKind(MODE.TRAIN | MODE.BUS)).toBe('train');
    expect(primaryKind(MODE.METRO | MODE.BUS)).toBe('metro');
  });

  it('finds København typed as Kobenhavn or Koebenhavn', () => {
    expect(spellings('københavn')).toEqual(['koebenhavn', 'kobenhavn']);
  });
});
