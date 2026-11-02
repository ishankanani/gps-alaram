/// <reference types="node" />
/**
 * Builds the coverage layer of the home map (src/map/coverage.ts) and the coverage numbers for
 * the store (store/src/coverage-stats.json) from every stops database: Germany (built by
 * `npm run build:stations`) and all country packs of the stop-packs release.
 *
 *   node tools/build-coverage.ts [dir with the *.db.gz packs and packs.json]
 *
 * Without a directory it downloads packs.json and the packs (about 45 MB) to a temporary folder.
 * The output is committed: the app ships the coverage of every downloadable country, not only
 * the ones a phone has. Run it again after the stop-packs workflow published new packs.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { gunzipSync } from 'node:zlib';

import { coverageView, encodeCoverage, LEVELS, levelForZoom } from '../src/map/coverage.ts';
import { PACKS, packById } from '../src/lib/stations/countries.ts';
import { MODE, primaryKind } from '../src/lib/stations/text.ts';

/** Where the stop-packs workflow publishes the packs (src/lib/stations/packs.ts PACKS_URL). */
const PACKS_URL = 'https://github.com/ishankanani/gps-alaram/releases/download/stop-packs/';
const GERMANY_DB = 'assets/stations/germany-stops.db';
const OUT_DATA = 'src/map/coverage/data.json';
const OUT_STATS = 'store/src/coverage-stats.json';

type Manifest = { packs: { id: string; file: string; count: number; builtAt: string }[] };
type Row = { name: string; lat5: number; lon5: number; modes: number };

/** The kinds the store talks about: bus, tram, metro, train, ferry. */
type Kind = 'bus' | 'tram' | 'metro' | 'train' | 'ferry';

function kindOf(modes: number): Kind | null {
  const k = primaryKind(modes);
  if (k === 'train' || k === 'sbahn') return 'train';
  if (k === 'ubahn' || k === 'metro') return 'metro';
  if (k === 'tram' || k === 'bus' || k === 'ferry') return k;
  return null;
}

/** Every mode a stop is served by (a stop can count for several). */
function servedBy(modes: number): Kind[] {
  const out: Kind[] = [];
  if (modes & MODE.BUS) out.push('bus');
  if (modes & MODE.TRAM) out.push('tram');
  if (modes & (MODE.UBAHN | MODE.METRO)) out.push('metro');
  if (modes & (MODE.ICE | MODE.IC | MODE.RE | MODE.RB | MODE.SBAHN | MODE.TRAIN)) out.push('train');
  if (modes & MODE.FERRY) out.push('ferry');
  return out;
}

async function download(dir: string): Promise<void> {
  mkdirSync(dir, { recursive: true });
  const res = await fetch(`${PACKS_URL}packs.json`);
  if (!res.ok) throw new Error(`packs.json: HTTP ${res.status}`);
  const manifest = (await res.json()) as Manifest;
  writeFileSync(join(dir, 'packs.json'), JSON.stringify(manifest, null, 2));
  await Promise.all(
    manifest.packs.map(async (p) => {
      const out = join(dir, p.file);
      if (existsSync(out)) return;
      const file = await fetch(`${PACKS_URL}${p.file}`);
      if (!file.ok) throw new Error(`${p.file}: HTTP ${file.status}`);
      writeFileSync(out, Buffer.from(await file.arrayBuffer()));
      console.log(`downloaded ${p.file}`);
    }),
  );
}

function readRows(path: string): Row[] {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    return db.prepare('SELECT name, lat5, lon5, modes FROM stops').all() as Row[];
  } finally {
    db.close();
  }
}

/** Opens a pack: the .db next to the .db.gz, unpacked once. */
function packDb(dir: string, file: string): string {
  const db = join(dir, file.replace(/\.gz$/, ''));
  if (!existsSync(db)) writeFileSync(db, gunzipSync(readFileSync(join(dir, file))));
  return db;
}

async function main() {
  const started = Date.now();
  let dir = process.argv[2];
  if (!dir) {
    dir = join(tmpdir(), 'stopwake-packs');
    await download(dir);
  }
  if (!existsSync(GERMANY_DB)) throw new Error(`${GERMANY_DB} is missing: run npm run build:stations first.`);
  const manifest = JSON.parse(readFileSync(join(dir, 'packs.json'), 'utf8')) as Manifest;

  const sources: { id: string; path: string }[] = [{ id: 'de', path: GERMANY_DB }];
  for (const p of manifest.packs) if (packById(p.id)) sources.push({ id: p.id, path: packDb(dir, p.file) });

  // A stop near a border can be in two databases (Germany has the stations of its neighbours
  // that DB serves): count it once, by name and position to about 100 m.
  const seen = new Set<string>();
  const points: [number, number][] = [];
  type Stats = { stops: number; rows: number; kinds: Record<Kind, number>; servedBy: Record<Kind, number> };
  const zero = (): Record<Kind, number> => ({ bus: 0, tram: 0, metro: 0, train: 0, ferry: 0 });
  const byCountry = new Map<string, Stats>();
  const all: Stats = { stops: 0, rows: 0, kinds: zero(), servedBy: zero() };

  for (const source of sources) {
    const country = packById(source.id)?.country ?? source.id;
    const stats = byCountry.get(country) ?? { stops: 0, rows: 0, kinds: zero(), servedBy: zero() };
    byCountry.set(country, stats);
    for (const row of readRows(source.path)) {
      stats.rows++;
      all.rows++;
      const key = `${row.name}|${Math.round(row.lat5 / 100)}|${Math.round(row.lon5 / 100)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      points.push([row.lat5 / 1e5, row.lon5 / 1e5]);
      for (const s of [stats, all]) {
        s.stops++;
        const kind = kindOf(row.modes);
        if (kind) s.kinds[kind]++;
        for (const k of servedBy(row.modes)) s.servedBy[k]++;
      }
    }
  }

  const data = encodeCoverage(points);
  mkdirSync('src/map/coverage', { recursive: true });
  const json = JSON.stringify(data);
  writeFileSync(OUT_DATA, `${json}\n`);

  const countries = [...byCountry.entries()]
    .map(([country, s]) => ({
      country,
      flag: PACKS.find((p) => p.country === country)?.flag ?? '',
      packs: PACKS.filter((p) => p.country === country).map((p) => p.id),
      ...s,
    }))
    .sort((a, b) => b.stops - a.stops);
  const stats = {
    builtAt: data.builtAt,
    countries: countries.length,
    stops: all.stops,
    rows: all.rows,
    kinds: all.kinds,
    servedBy: all.servedBy,
    sources: Object.fromEntries([
      ['de', 'db-hafas-stations (built in)'],
      ...manifest.packs.map((p) => [p.id, `stop-packs release, built ${p.builtAt}`]),
    ]),
    byCountry: countries,
  };
  writeFileSync(OUT_STATS, `${JSON.stringify(stats, null, 2)}\n`);

  // What the app pays: the size of the data and the dots a phone screen shows at most.
  const views: [string, number, number][] = [
    ['Europe', 50, 3],
    ['Köln', 50.94, 6.96],
    ['London', 51.5, -0.12],
    ['Paris', 48.85, 2.35],
  ];
  let most = 0;
  for (const [, lat, lon] of views) {
    for (let zoom = 0; zoom < LEVELS[LEVELS.length - 1].maxZoom; zoom += 0.25) {
      if (!levelForZoom(data, zoom)) continue;
      // A 411 x 900 dp map; MapLibre's world is 512 dp wide at zoom 0.
      const dLon = (411 / (512 * 2 ** zoom)) * 360;
      const dLat = (900 / (512 * 2 ** zoom)) * 180 * Math.cos((lat * Math.PI) / 180);
      const view = coverageView(data, [lon - dLon / 2, lat - dLat / 2, lon + dLon / 2, lat + dLat / 2], zoom);
      most = Math.max(most, view.collection.features.length);
    }
  }
  const cells = data.levels.map((l) => `grid ${l.grid}: ${l.chunks.reduce((n, [, s]) => n + s.length / 3, 0)} cells`);
  console.log(`${all.rows} rows -> ${all.stops} stops in ${countries.length} countries`);
  console.log(cells.join(', '));
  console.log(`${OUT_DATA}: ${(statSync(OUT_DATA).size / 1024).toFixed(0)} KB; at most ${most} dots on screen`);
  console.log(`${OUT_STATS} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

await main();
