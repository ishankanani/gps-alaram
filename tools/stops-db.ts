/// <reference types="node" />
/**
 * Writes a stops database in the format the app reads (src/lib/stations/search.ts). Shared by the
 * Germany builder (build-stations.ts) and the country pack builder (build-osm-pack.ts).
 */
import { mkdirSync, rmSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { indexTokens } from '../src/lib/stations/text.ts';

export type StopRecord = {
  /** "Title, Place" or just the title; the app splits it at the last ", ". */
  name: string;
  lat: number;
  lon: number;
  modes: number;
  rank: number;
  /** Other names the stop should be found by (English name, old names, ...). */
  aliases?: string[];
};

export function distanceM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const x = (((b.lon - a.lon) * Math.PI) / 180) * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
  const y = ((b.lat - a.lat) * Math.PI) / 180;
  return Math.hypot(x, y) * 6_371_000;
}

/**
 * Writes the stops in the given order, which should be most important first: row ids follow it,
 * and the app breaks ties in rank by row id. Returns the file size in bytes.
 */
export function writeStopsDb(out: string, stops: StopRecord[], meta: Record<string, string>): number {
  mkdirSync(dirname(out), { recursive: true });
  rmSync(out, { force: true });
  const db = new DatabaseSync(out);
  db.exec(`
    PRAGMA journal_mode = OFF;
    PRAGMA synchronous = OFF;
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    -- Coordinates are stored as integer degrees x 1e5 (about 1 m), which is half the size of REAL.
    CREATE TABLE stops (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      lat5 INTEGER NOT NULL,
      lon5 INTEGER NOT NULL,
      modes INTEGER NOT NULL,
      rank INTEGER NOT NULL
    );
    CREATE VIRTUAL TABLE stops_fts USING fts5(
      tokens, content = '', columnsize = 0, detail = none,
      tokenize = 'unicode61 remove_diacritics 2'
    );
  `);

  const insertStop = db.prepare('INSERT INTO stops (id, name, lat5, lon5, modes, rank) VALUES (?, ?, ?, ?, ?, ?)');
  const insertTokens = db.prepare('INSERT INTO stops_fts (rowid, tokens) VALUES (?, ?)');
  let [west, south, east, north] = [180, 90, -180, -90];
  db.exec('BEGIN');
  stops.forEach((s, i) => {
    const id = i + 1;
    insertStop.run(id, s.name, Math.round(s.lat * 1e5), Math.round(s.lon * 1e5), s.modes, s.rank);
    const tokens = new Set(indexTokens(s.name));
    for (const alias of s.aliases ?? []) for (const token of indexTokens(alias)) tokens.add(token);
    insertTokens.run(id, [...tokens].join(' '));
    west = Math.min(west, s.lon);
    east = Math.max(east, s.lon);
    south = Math.min(south, s.lat);
    north = Math.max(north, s.lat);
  });
  db.exec('COMMIT');
  db.exec(`
    CREATE INDEX stops_lat ON stops (lat5);
    INSERT INTO stops_fts (stops_fts) VALUES ('optimize');
  `);
  const insertMeta = db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)');
  const all: Record<string, string> = {
    built_at: new Date().toISOString(),
    count: String(stops.length),
    bbox: [west, south, east, north].map((v) => v.toFixed(4)).join(','),
    ...meta,
  };
  for (const [key, value] of Object.entries(all)) insertMeta.run(key, value);
  db.exec('VACUUM');
  db.close();
  return statSync(out).size;
}
