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
import { createReadStream, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

import { MODE } from '../src/lib/stations/text.ts';
import { distanceM, writeStopsDb } from './stops-db.ts';

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

  const bytes = writeStopsDb(
    OUT,
    stops.sort((a, b) => b.weight - a.weight).map((s) => ({ ...s, rank: rankOf(s.weight) })),
    {
      source: sourceVersion(),
      license: 'Station data: DB InfraGO (CC BY 4.0) and OpenStreetMap contributors (ODbL)',
      country: 'de',
    },
  );

  const mb = (bytes / 1e6).toFixed(1);
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`${rawCount} entries -> ${stops.length} stops, ${OUT} (${mb} MB) in ${seconds}s`);
}

await main();
