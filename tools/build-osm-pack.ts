/// <reference types="node" />
/**
 * Builds a country stop pack from the output of tools/osm-stops.py.
 *
 *   node tools/build-osm-pack.ts <pack id> <stops.ndjson> <out.db>
 *
 * Platforms, poles and stop positions of the same stop are merged into one entry, like the
 * Germany database. Importance comes from the number of lines that stop there, weighted by mode.
 */
import { createReadStream, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

import { packById } from '../src/lib/stations/countries.ts';
import { fold, MODE } from '../src/lib/stations/text.ts';
import { distanceM, writeStopsDb, type StopRecord } from './stops-db.ts';

/** Written next to the pack as <out>.json, for tools/pack-manifest.ts. */
export type PackInfo = { id: string; count: number; dbBytes: number; builtAt: string };

type OsmMode = 'train' | 'suburban' | 'metro' | 'tram' | 'bus' | 'ferry';

type Element = {
  name: string;
  lat: number;
  lon: number;
  modes: OsmMode[];
  routes: Partial<Record<OsmMode, number[]>>;
  station: boolean;
  en: string | null;
  alt: string[];
  area: number | null;
  area_name: string | null;
  place: string | null;
  place_en: string | null;
};

type Stop = {
  name: string;
  lat: number;
  lon: number;
  modes: Set<OsmMode>;
  routes: Map<number, OsmMode>;
  station: boolean;
  en: string | null;
  aliases: Set<string>;
  area: number | null;
  areaName: string | null;
  place: string | null;
  placeEn: string | null;
};

/** Entries with the same name closer than this are one stop. */
const MERGE_DISTANCE_M = 400;
/** Railway stations are longer: their platforms and entrances can be this far apart. */
const RAIL_MERGE_DISTANCE_M = 800;
/** Parts of one stop area (a station with its platforms, bus stops and entrances) within this. */
const AREA_MERGE_DISTANCE_M = 1000;
/** A stop this close to a station whose name contains its own (or the other way round) is part of it. */
const STATION_ABSORB_M = 250;

/** How much one line of each mode adds to a stop's importance. */
const ROUTE_WEIGHT: Record<OsmMode, number> = { train: 40, suburban: 30, metro: 25, tram: 10, ferry: 8, bus: 3 };

/** Where S-Bahn and U-Bahn are the words riders use, show those badges instead of Train and Metro. */
const SBAHN_COUNTRIES = new Set(['at', 'ch', 'lu', 'dk']);
const UBAHN_COUNTRIES = new Set(['at']);

/** Mode bits for this country. */
function modeBits(country: string, modes: Set<OsmMode>): number {
  let bits = 0;
  for (const mode of modes) {
    if (mode === 'train') bits |= MODE.TRAIN;
    else if (mode === 'suburban') bits |= SBAHN_COUNTRIES.has(country) ? MODE.SBAHN : MODE.TRAIN;
    else if (mode === 'metro') bits |= UBAHN_COUNTRIES.has(country) ? MODE.UBAHN : MODE.METRO;
    else if (mode === 'tram') bits |= MODE.TRAM;
    else if (mode === 'bus') bits |= MODE.BUS;
    else if (mode === 'ferry') bits |= MODE.FERRY;
  }
  return bits;
}

/**
 * Importance from the lines that stop here, on a scale like the Germany database: about 120 for a
 * bus stop with a few lines, 250 for a small station, 400 and up for big ones.
 */
export function rankOf(stop: { routes: Map<number, OsmMode>; station: boolean; modes: Set<OsmMode> }): number {
  let weight = 0;
  for (const mode of stop.routes.values()) weight += ROUTE_WEIGHT[mode];
  if (stop.station) weight += stop.modes.has('train') || stop.modes.has('suburban') ? 60 : 30;
  else if (stop.modes.has('train') || stop.modes.has('suburban')) weight += 20;
  else if (stop.modes.has('metro') || stop.modes.has('tram')) weight += 5;
  else weight += 1;
  return Math.round(140 * Math.log10(1 + weight));
}

function key(name: string): string {
  return fold(name).replace(/\s+/g, ' ').trim();
}

/** Japanese and other non-Latin names get their English name alongside, as many signs do. */
function isLatin(text: string): boolean {
  return !/[^\p{Script=Latin}\p{N}\p{P}\p{S}\p{Z}]/u.test(text);
}

function toStop(e: Element): Stop {
  const modes = new Set(e.modes);
  const routes = new Map<number, OsmMode>();
  for (const [mode, ids] of Object.entries(e.routes) as [OsmMode, number[]][]) for (const id of ids) routes.set(id, mode);
  return {
    name: e.name.trim(),
    lat: e.lat,
    lon: e.lon,
    modes,
    routes,
    station: e.station,
    en: e.en,
    aliases: new Set(e.alt),
    area: e.area ?? null,
    areaName: e.area_name ?? null,
    place: e.place,
    placeEn: e.place_en,
  };
}

function absorb(into: Stop, s: Stop) {
  for (const m of s.modes) into.modes.add(m);
  for (const [id, mode] of s.routes) into.routes.set(id, mode);
  for (const a of s.aliases) into.aliases.add(a);
  if (s.name !== into.name) into.aliases.add(s.name);
  into.station ||= s.station;
  into.en ??= s.en;
}

/** Stations first, then the stops with the most lines: their position wins when merging. */
function importance(s: Stop): number {
  return (s.station ? 1e6 : 0) + s.routes.size;
}

function isRail(s: Stop): boolean {
  return s.modes.has('train') || s.modes.has('suburban') || s.modes.has('metro');
}

/**
 * OpenStreetMap groups the parts of a station or stop in a stop area: the station, its
 * platforms, the bus stops in front. They become one stop, named after the station or the area.
 */
function mergeStopAreas(all: Stop[]): Stop[] {
  const out: Stop[] = [];
  const areas = new Map<number, Stop[]>();
  for (const s of all) {
    if (s.area == null) {
      out.push(s);
      continue;
    }
    const group = areas.get(s.area);
    if (group) group.push(s);
    else areas.set(s.area, [s]);
  }
  for (const group of areas.values()) {
    group.sort((a, b) => importance(b) - importance(a));
    const [main, ...rest] = group;
    for (const s of rest) {
      if (distanceM(main, s) <= AREA_MERGE_DISTANCE_M) absorb(main, s);
      else out.push(s);
    }
    if (!main.station && main.areaName && key(main.areaName) !== key(main.name)) {
      main.aliases.add(main.name);
      main.name = main.areaName;
    }
    out.push(main);
  }
  return out;
}

/** "Place d'Armes (Port)" and "Place d'Armes (TAM)" are platforms of "Place d'Armes". */
function baseKey(name: string): string {
  return key(name.replace(/\s*\([^)]*\)\s*$/, '')) || key(name);
}

/**
 * Merges elements of one base name (the name without a note in brackets) into stops: within
 * MERGE_DISTANCE_M, or RAIL_MERGE_DISTANCE_M for two railway stops.
 */
function mergeSameName(elements: Stop[]): Stop[] {
  const sorted = [...elements].sort((a, b) => importance(b) - importance(a));
  const stops: Stop[] = [];
  for (const e of sorted) {
    const k = key(e.name);
    const into = stops.find((s) => distanceM(s, e) <= (isRail(s) && isRail(e) ? RAIL_MERGE_DISTANCE_M : MERGE_DISTANCE_M));
    if (!into) {
      stops.push(e);
      continue;
    }
    absorb(into, e);
    // The plain name reads better than one platform's note.
    if (k === baseKey(e.name) && key(into.name) !== k) {
      into.aliases.add(into.name);
      into.name = e.name;
    }
  }
  return stops;
}

/**
 * "Hauptbahnhof" tram stop next to the "Wien Hauptbahnhof" station is the same place, and so is the
 * "Praterstern" U-Bahn station next to "Wien Praterstern": the smaller one joins the bigger one.
 */
function absorbIntoStations(stops: Stop[]): Stop[] {
  const cell = 0.01;
  const cellOf = (s: Stop) => [Math.floor(s.lat / cell), Math.floor(s.lon / cell)];
  const stations = new Map<string, Stop[]>();
  const kept: Stop[] = [];
  // Stations first, biggest first, so a stop always joins the most important match.
  for (const s of [...stops].sort((a, b) => importance(b) - importance(a))) {
    const [cy, cx] = cellOf(s);
    const name = key(s.name);
    let target: Stop | null = null;
    for (let dy = -1; dy <= 1 && !target; dy++) {
      for (let dx = -1; dx <= 1 && !target; dx++) {
        target =
          stations.get(`${cy + dy},${cx + dx}`)?.find((st) => {
            const stName = key(st.name);
            return (stName.includes(name) || name.includes(stName)) && distanceM(st, s) <= STATION_ABSORB_M;
          }) ?? null;
      }
    }
    if (target) {
      absorb(target, s);
      continue;
    }
    kept.push(s);
    if (s.station) {
      const c = `${cy},${cx}`;
      const list = stations.get(c);
      if (list) list.push(s);
      else stations.set(c, [s]);
    }
  }
  return kept;
}

/** A train station that only S-trains serve is an S-Bahn station. */
function tidyModes(s: Stop) {
  const routeModes = new Set(s.routes.values());
  if (s.modes.has('train') && !routeModes.has('train') && routeModes.has('suburban')) s.modes.delete('train');
}

/** "Hauptbahnhof, Wien": the place goes after the last comma, so commas inside names become slashes. */
export function displayName(s: Pick<Stop, 'name' | 'en' | 'place' | 'placeEn'>): string {
  let title = s.name.replace(/\s*,\s+/g, ' / ');
  const latin = isLatin(title);
  if (!latin && s.en && isLatin(s.en)) title = `${title} · ${s.en}`;
  const place = !latin && s.placeEn ? s.placeEn : s.place;
  if (!place || key(title).includes(key(place))) return title;
  return `${title}, ${place}`;
}

async function readElements(path: string): Promise<Stop[]> {
  const stops: Stop[] = [];
  const lines = createInterface({ input: createReadStream(path, 'utf8'), crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    const e = JSON.parse(line) as Element;
    if (e.name?.trim()) stops.push(toStop(e));
  }
  return stops;
}

function byBaseName(stops: Stop[]): Map<string, Stop[]> {
  const byName = new Map<string, Stop[]>();
  for (const stop of stops) {
    const k = baseKey(stop.name);
    const group = byName.get(k);
    if (group) group.push(stop);
    else byName.set(k, [stop]);
  }
  return byName;
}

/** Builds a pack (an id from src/lib/stations/countries.ts, such as "at" or "us-west"). */
export async function buildPack(packId: string, input: string, out: string) {
  const started = Date.now();
  const country = packById(packId)?.country ?? packId;
  const all = await readElements(input);
  const elements = all.length;
  let merged: Stop[] = [];
  for (const group of byBaseName(mergeStopAreas(all)).values()) merged.push(...mergeSameName(group));
  merged = absorbIntoStations(merged);
  const records: StopRecord[] = [];
  const ranked = merged.map((s) => ({ s, rank: rankOf(s) })).sort((a, b) => b.rank - a.rank || b.s.routes.size - a.s.routes.size);
  for (const { s, rank } of ranked) {
    tidyModes(s);
    const modes = modeBits(country, s.modes);
    if (!modes) continue;
    const aliases = [...s.aliases];
    if (s.en) aliases.push(s.en);
    records.push({ name: displayName(s), lat: s.lat, lon: s.lon, modes, rank, aliases });
  }
  const builtAt = new Date().toISOString();
  const bytes = writeStopsDb(out, records, {
    source: 'OpenStreetMap',
    license: 'Stop data: © OpenStreetMap contributors (ODbL)',
    country,
    pack: packId,
    built_at: builtAt,
  });
  const info: PackInfo = { id: packId, count: records.length, dbBytes: bytes, builtAt };
  writeFileSync(out.replace(/\.db$/, '.json'), `${JSON.stringify(info)}\n`);
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`${packId}: ${elements} elements -> ${records.length} stops, ${out} (${(bytes / 1e6).toFixed(1)} MB) in ${seconds}s`);
}

if (process.argv[1]?.endsWith('build-osm-pack.ts')) {
  const [packId, input, out] = process.argv.slice(2);
  if (!packId || !input || !out) {
    console.error('Usage: node tools/build-osm-pack.ts <pack id> <stops.ndjson> <out.db>');
    process.exit(1);
  }
  await buildPack(packId, input, out);
}
