import type { FeatureCollection, Point } from 'geojson';

// The coverage layer of the home map: every stop StopWake knows (Germany built in and every
// downloadable country pack) as a light density of dots when the map is zoomed out, so people see
// "all these stops work". tools/build-coverage.ts aggregates the stops databases into grid cells
// at a few resolutions and encodes them; this module decodes only the cells in view. Pure (no
// react-native), so it is tested.

/** Below this zoom the coverage dots show; from here on the map shows real stops (geo.ts). */
export const COVERAGE_MAX_ZOOM = 8.5;

/**
 * One resolution of the grid. The world (Web Mercator) is 2^grid cells wide; cells are stored in
 * chunks of 2^chunk per side, so only chunks in view are decoded.
 */
export type CoverageLevelSpec = { grid: number; chunk: number; minZoom: number; maxZoom: number };

export type CoverageLevel = CoverageLevelSpec & {
  /** Lowest stop count of density class 1, 2 and 3 (class 0 below the first). */
  classes: number[];
  /**
   * ["x/y" of the chunk at zoom `chunk`, its cells (3 characters each, see encodeCell)], as a list
   * so the JSON stays cheap to type-check and parse.
   */
  chunks: [string, string][];
};

export type CoverageData = {
  version: 1;
  builtAt: string;
  /** Stops counted into the cells. */
  stops: number;
  levels: CoverageLevel[];
};

export type Bounds = [west: number, south: number, east: number, north: number];

/**
 * The levels the app ships: a cell is 4 to 22 dp apart on screen within each level's zoom range,
 * and a phone screen shows at most about 4,000 cells (measured on Köln, London and Paris).
 */
export const LEVELS: readonly CoverageLevelSpec[] = [
  { grid: 9, chunk: 4, minZoom: 0, maxZoom: 3.5 },
  { grid: 10, chunk: 5, minZoom: 3.5, maxZoom: 5 },
  { grid: 11, chunk: 6, minZoom: 5, maxZoom: 6.5 },
  { grid: 12, chunk: 7, minZoom: 6.5, maxZoom: COVERAGE_MAX_ZOOM },
];

/** A cell's dot sits at the mean position of its stops, rounded to a quarter cell. */
const SUB_BITS = 2;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const INDEX: Record<string, number> = Object.fromEntries([...ALPHABET].map((c, i) => [c, i]));
const MAX_LAT = 85.05112878;

// ---- Web Mercator, as fractions of the world (0..1) ----

export function lonToX(lon: number): number {
  return (lon + 180) / 360;
}

export function latToY(lat: number): number {
  const clamped = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
  const s = Math.sin((clamped * Math.PI) / 180);
  return Math.max(0, Math.min(1, 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)));
}

export function xToLon(x: number): number {
  return x * 360 - 180;
}

export function yToLat(y: number): number {
  return (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;
}

// ---- Encoding (tools/build-coverage.ts) ----

/** Sub-cell steps per chunk side; a position within a chunk takes 8 bits per axis. */
function chunkSteps(level: CoverageLevelSpec): number {
  const steps = 2 ** (level.grid - level.chunk + SUB_BITS);
  if (steps > 256) throw new Error(`grid ${level.grid} and chunk ${level.chunk} are too far apart`);
  return steps;
}

export function encodeCell(sx: number, sy: number, cls: number): string {
  const v = (sx << 10) | (sy << 2) | (cls & 3);
  return ALPHABET[(v >> 12) & 63] + ALPHABET[(v >> 6) & 63] + ALPHABET[v & 63];
}

export function decodeCell(s: string, at = 0): { sx: number; sy: number; cls: number } {
  const v = (INDEX[s[at]] << 12) | (INDEX[s[at + 1]] << 6) | INDEX[s[at + 2]];
  return { sx: (v >> 10) & 255, sy: (v >> 2) & 255, cls: v & 3 };
}

/** Thresholds for density classes 1 to 3: the 50th, 85th and 97th percentile of the counts. */
export function densityClasses(counts: number[]): number[] {
  const sorted = [...counts].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 1;
  const out: number[] = [];
  // Strictly increasing and above 1, so a lone stop is class 0 and every class means something.
  for (const q of [0.5, 0.85, 0.97]) out.push(Math.max((out[out.length - 1] ?? 1) + 1, at(q)));
  return out;
}

export function classOf(count: number, classes: number[]): number {
  let cls = 0;
  for (const t of classes) if (count >= t) cls++;
  return cls;
}

/** Aggregates stops ([latitude, longitude]) into the levels' cells. */
export function encodeCoverage(
  stops: Iterable<readonly [number, number]>,
  levels: readonly CoverageLevelSpec[] = LEVELS,
  builtAt = new Date().toISOString(),
): CoverageData {
  type Cell = { n: number; x: number; y: number };
  const grids = levels.map(() => new Map<number, Cell>());
  let total = 0;
  for (const [lat, lon] of stops) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const x = Math.min(lonToX(lon), 1 - 1e-12);
    const y = Math.min(latToY(lat), 1 - 1e-12);
    total++;
    levels.forEach((level, i) => {
      const n = 2 ** level.grid;
      const key = Math.floor(y * n) * n + Math.floor(x * n);
      const cell = grids[i].get(key);
      if (cell) {
        cell.n++;
        cell.x += x;
        cell.y += y;
      } else {
        grids[i].set(key, { n: 1, x, y });
      }
    });
  }

  const out = levels.map((level, i): CoverageLevel => {
    const cells = [...grids[i].values()];
    const classes = densityClasses(cells.map((c) => c.n));
    const per = 2 ** level.chunk;
    const steps = chunkSteps(level);
    const byChunk = new Map<string, string[]>();
    // A stable order (row by row) keeps the output diffable between builds.
    const sorted = [...grids[i].entries()].sort((a, b) => a[0] - b[0]).map(([, c]) => c);
    for (const c of sorted) {
      const mx = c.x / c.n;
      const my = c.y / c.n;
      const cx = Math.floor(mx * per);
      const cy = Math.floor(my * per);
      const sx = Math.min(steps - 1, Math.floor((mx * per - cx) * steps));
      const sy = Math.min(steps - 1, Math.floor((my * per - cy) * steps));
      const key = `${cx}/${cy}`;
      const list = byChunk.get(key) ?? [];
      list.push(encodeCell(sx, sy, classOf(c.n, classes)));
      byChunk.set(key, list);
    }
    const chunks = [...byChunk.keys()].sort().map((key): [string, string] => [key, byChunk.get(key)!.join('')]);
    return { ...level, classes, chunks };
  });
  return { version: 1, builtAt, stops: total, levels: out };
}

// ---- Decoding (the app) ----

const indexes = new WeakMap<CoverageLevel, Map<string, string>>();

/** A level's chunks by key, built once. */
function chunkIndex(level: CoverageLevel): Map<string, string> {
  let index = indexes.get(level);
  if (!index) {
    index = new Map(level.chunks);
    indexes.set(level, index);
  }
  return index;
}

/** The level for a zoom, or null from COVERAGE_MAX_ZOOM on (the map shows real stops there). */
export function levelForZoom(data: CoverageData, zoom: number): CoverageLevel | null {
  if (!Number.isFinite(zoom)) return null;
  return data.levels.find((l) => zoom >= l.minZoom && zoom < l.maxZoom) ?? null;
}

/**
 * The chunks to draw for a view: its bounds grown by `margin` of their size on each side (so a
 * short pan has dots already), clipped to the world and wrapped across the antimeridian.
 * Only chunks that have cells are returned.
 */
export function chunksInView(level: CoverageLevel, bounds: Bounds, margin = 0.25): string[] {
  const per = 2 ** level.chunk;
  let [west, south, east, north] = bounds;
  if (east < west) east += 360;
  const w = east - west;
  const h = north - south;
  west -= w * margin;
  east += w * margin;
  south = Math.max(-MAX_LAT, south - h * margin);
  north = Math.min(MAX_LAT, north + h * margin);

  const y0 = Math.max(0, Math.floor(latToY(north) * per));
  const y1 = Math.min(per - 1, Math.floor(latToY(south) * per));
  const xs = new Set<number>();
  if (east - west >= 360) {
    for (let x = 0; x < per; x++) xs.add(x);
  } else {
    const x0 = Math.floor(lonToX(west) * per);
    const x1 = Math.floor(lonToX(east) * per);
    for (let x = x0; x <= x1; x++) xs.add(((x % per) + per) % per);
  }
  const index = chunkIndex(level);
  const out: string[] = [];
  for (const x of [...xs].sort((a, b) => a - b)) {
    for (let y = y0; y <= y1; y++) {
      const key = `${x}/${y}`;
      if (index.has(key)) out.push(key);
    }
  }
  return out;
}

export type CoverageCell = { longitude: number; latitude: number; cls: number };

/** The cells of one chunk with their positions. */
export function decodeChunk(level: CoverageLevel, key: string): CoverageCell[] {
  const data = chunkIndex(level).get(key);
  if (!data) return [];
  const [cx, cy] = key.split('/').map(Number);
  const per = 2 ** level.chunk;
  const steps = chunkSteps(level);
  const cells: CoverageCell[] = [];
  for (let i = 0; i + 2 < data.length; i += 3) {
    const { sx, sy, cls } = decodeCell(data, i);
    // Five decimals (about 1 m) keep the GeoJSON sent to the map small.
    cells.push({
      longitude: round5(xToLon((cx + (sx + 0.5) / steps) / per)),
      latitude: round5(yToLat((cy + (sy + 0.5) / steps) / per)),
      cls,
    });
  }
  return cells;
}

function round5(v: number): number {
  return Math.round(v * 1e5) / 1e5;
}

/** Decoded chunks by level and key; a chunk is decoded once per app run. */
const decoded = new Map<string, CoverageCell[]>();

function cellsOf(level: CoverageLevel, key: string): CoverageCell[] {
  const id = `${level.grid}:${key}`;
  let cells = decoded.get(id);
  if (!cells) {
    cells = decodeChunk(level, key);
    decoded.set(id, cells);
  }
  return cells;
}

export type CoverageView = {
  /** Changes only when other cells are needed: compare it to skip a source update. */
  key: string;
  collection: FeatureCollection<Point>;
};

const EMPTY: CoverageView = { key: '', collection: { type: 'FeatureCollection', features: [] } };

/** The coverage dots for a view, as GeoJSON points with their density class `c` (0 to 3). */
export function coverageView(data: CoverageData, bounds: Bounds, zoom: number): CoverageView {
  const level = levelForZoom(data, zoom);
  if (!level) return EMPTY;
  const keys = chunksInView(level, bounds);
  if (keys.length === 0) return EMPTY;
  const features: FeatureCollection<Point>['features'] = [];
  for (const key of keys) {
    for (const cell of cellsOf(level, key)) {
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [cell.longitude, cell.latitude] },
        properties: { c: cell.cls },
      });
    }
  }
  return { key: `${level.grid}|${keys.join(',')}`, collection: { type: 'FeatureCollection', features } };
}

/**
 * Where a tap on a coverage dot zooms to: two levels closer, at least into the next level, and
 * at most to where the real stops show.
 */
export function expandZoom(data: CoverageData, zoom: number): number {
  const level = levelForZoom(data, zoom);
  const next = level ? data.levels[data.levels.indexOf(level) + 1] : undefined;
  const target = Math.max(zoom + 2, next ? next.minZoom + 0.5 : COVERAGE_MAX_ZOOM + 0.5);
  return Math.min(target, COVERAGE_MAX_ZOOM + 1.5);
}
