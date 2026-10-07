/// <reference types="node" />
/**
 * Builds the offline Germany stops database the app ships with.
 *
 *   node tools/build-stations.ts [source.ndjson] [out.db]
 *
 * Source: the db-hafas-stations npm package (DB InfraGO, CC BY 4.0, and OpenStreetMap
 * contributors), about 290k stations and stops including buses and trams. Platforms and poles of
 * the same stop are merged into one entry. Names are indexed with the same rules the app uses to
 * query (src/lib/stations/text.ts).
 */
import { createReadStream, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { createInterface } from 'node:readline';
import { DatabaseSync } from 'node:sqlite';

import { indexTokens, MODE } from '../src/lib/stations/text.ts';

const SOURCE = process.argv[2] ?? 'node_modules/db-hafas-stations/full.ndjson';
const OUT = process.argv[3] ?? 'assets/stations/germany-stops.db';
/** Entries with the same name closer than this are one stop (platforms, poles, entrances). */
const MERGE_DISTANCE_M = 400;

type Entry = { name: string; lat: number; lon: number; modes: number; weight: number };

type RawStation = {
  name?: string;
  location?: { latitude?: number; longitude?: number };
  products?: Record<string, boolean>;
  weight?: number;
};

const PRODUCT_BITS: Record<string, number> = {
  nationalExpress: MODE.ICE,
  national: MODE.IC,
  regionalExpress: MODE.RE,
  regional: MODE.RB,
  suburban: MODE.SBAHN,
  subway: MODE.UBAHN,
  tram: MODE.TRAM,
  bus: MODE.BUS,
  ferry: MODE.FERRY,
};

function modesOf(products: Record<string, boolean> | undefined): number {
  let bits = 0;
  for (const [key, on] of Object.entries(products ?? {})) {
    if (on && PRODUCT_BITS[key]) bits |= PRODUCT_BITS[key];
  }
  return bits;
}

function distanceM(a: Entry, b: Entry): number {
  const x = ((b.lon - a.lon) * Math.PI) / 180 * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
  const y = ((b.lat - a.lat) * Math.PI) / 180;
  return Math.hypot(x, y) * 6_371_000;
}

/** 0 for a tiny village stop, about 640 for München Hbf. */
function rankOf(weight: number): number {
  return Math.round(100 * Math.log10(1 + Math.max(0, weight)));
}

async function readEntries(path: string): Promise<Map<string, Entry[]>> {
  const byName = new Map<string, Entry[]>();
  const lines = createInterface({ input: createReadStream(path, 'utf8'), crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    const raw = JSON.parse(line) as RawStation;
    const name = raw.name?.trim();
    const lat = raw.location?.latitude;
    const lon = raw.location?.longitude;
    if (!name || typeof lat !== 'number' || typeof lon !== 'number') continue;
    const entry = { name, lat, lon, modes: modesOf(raw.products), weight: raw.weight ?? 0 };
    const group = byName.get(name);
    if (group) group.push(entry);
    else byName.set(name, [entry]);
  }
  return byName;
}

/** Merges entries of one name into stops, keeping the most important entry's position. */
function mergeGroup(entries: Entry[]): Entry[] {
  const sorted = [...entries].sort((a, b) => b.weight - a.weight);
  const stops: Entry[] = [];
  for (const e of sorted) {
    const into = stops.find((s) => distanceM(s, e) <= MERGE_DISTANCE_M);
    if (into) {
      into.modes |= e.modes;
      into.weight = Math.max(into.weight, e.weight);
    } else {
      stops.push({ ...e });
    }
  }
  return stops;
}

function sourceVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync('node_modules/db-hafas-stations/package.json', 'utf8')) as { version: string };
    return `db-hafas-stations@${pkg.version}`;
  } catch {
    return 'unknown';
  }
}

async function main() {
  const started = Date.now();
  const groups = await readEntries(SOURCE);
  const stops: Entry[] = [];
  let rawCount = 0;
  for (const entries of groups.values()) {
    rawCount += entries.length;
    stops.push(...mergeGroup(entries));
  }

  mkdirSync(dirname(OUT), { recursive: true });
  rmSync(OUT, { force: true });
  const db = new DatabaseSync(OUT);
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
  db.exec('BEGIN');
  stops.sort((a, b) => b.weight - a.weight);
  stops.forEach((s, i) => {
    const id = i + 1;
    insertStop.run(id, s.name, Math.round(s.lat * 1e5), Math.round(s.lon * 1e5), s.modes, rankOf(s.weight));
    insertTokens.run(id, indexTokens(s.name).join(' '));
  });
  db.exec('COMMIT');
  db.exec(`
    CREATE INDEX stops_lat ON stops (lat5);
    INSERT INTO stops_fts (stops_fts) VALUES ('optimize');
  `);
  const meta = db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)');
  meta.run('source', sourceVersion());
  meta.run('license', 'Station data: DB InfraGO (CC BY 4.0) and OpenStreetMap contributors (ODbL)');
  meta.run('built_at', new Date().toISOString());
  meta.run('count', String(stops.length));
  db.exec('VACUUM');
  db.close();

  const mb = (statSync(OUT).size / 1e6).toFixed(1);
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`${rawCount} entries -> ${stops.length} stops, ${OUT} (${mb} MB) in ${seconds}s`);
}

await main();
