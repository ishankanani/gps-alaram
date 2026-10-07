import { matchQuery, queryWords, splitName } from './text';

/** Minimal query interface, so the same search runs on expo-sqlite in the app and node:sqlite in tests. */
export interface StopsDb {
  all<T>(sql: string, params: (string | number)[]): Promise<T[]>;
}

type StopRow = { id: number; name: string; lat5: number; lon5: number; modes: number; rank: number };

export type Stop = {
  id: number;
  /** Full name as published, e.g. "Pfühlpark Süd, Heilbronn" or "Heilbronn Hbf". */
  name: string;
  title: string;
  place: string | null;
  latitude: number;
  longitude: number;
  /** Bitmask of MODE values (ICE, S-Bahn, bus, ...). */
  modes: number;
  /** Importance from passenger numbers: 0 for a village stop, about 640 for München Hbf. */
  rank: number;
};

export type LatLon = { latitude: number; longitude: number };

/** [west, south, east, north] in degrees. */
export type Bounds = [number, number, number, number];

const COLUMNS = 's.id, s.name, s.lat5, s.lon5, s.modes, s.rank';

function toStop(row: StopRow): Stop {
  const { title, place } = splitName(row.name);
  return {
    id: row.id,
    name: row.name,
    title,
    place,
    latitude: row.lat5 / 1e5,
    longitude: row.lon5 / 1e5,
    modes: row.modes,
    rank: row.rank,
  };
}

export function distanceKm(a: LatLon, b: LatLon): number {
  const x = (((b.longitude - a.longitude) * Math.PI) / 180) * Math.cos((((a.latitude + b.latitude) / 2) * Math.PI) / 180);
  const y = ((b.latitude - a.latitude) * Math.PI) / 180;
  return Math.hypot(x, y) * 6371;
}

function boundsAround(center: LatLon, radiusKm: number): Bounds {
  const dLat = radiusKm / 111.2;
  const dLon = radiusKm / (111.2 * Math.cos((center.latitude * Math.PI) / 180));
  return [center.longitude - dLon, center.latitude - dLat, center.longitude + dLon, center.latitude + dLat];
}

function boundsParams([west, south, east, north]: Bounds): number[] {
  return [Math.floor(south * 1e5), Math.ceil(north * 1e5), Math.floor(west * 1e5), Math.ceil(east * 1e5)];
}

/**
 * How well a stop answers a query: importance, minus distance from the user (a nearby Hbf beats
 * München Hbf when you type "hauptbahnhof"), plus a bonus when the name starts with what you typed.
 */
export function score(stop: Stop, typed: string[], near?: LatLon): number {
  let s = stop.rank;
  if (near) s -= 160 * Math.log10(1 + distanceKm(near, stop));
  const titleWords = queryWords(stop.title);
  if (typed.length > 0 && titleWords[0]?.startsWith(typed[0])) s += 60;
  if (typed.every((w) => titleWords.some((t) => t.startsWith(w)))) s += 40;
  return s;
}

/** Offline search across all stops in Germany. Needs two characters or more. */
export async function searchStops(db: StopsDb, input: string, near?: LatLon, limit = 25): Promise<Stop[]> {
  const match = matchQuery(input);
  if (!match || input.trim().length < 2) return [];
  const typed = queryWords(input);
  const sql = `SELECT ${COLUMNS} FROM stops_fts JOIN stops s ON s.id = stops_fts.rowid WHERE stops_fts MATCH ?`;

  const queries: Promise<StopRow[]>[] = [db.all<StopRow>(`${sql} ORDER BY s.rank DESC LIMIT 80`, [match])];
  if (near) {
    // Small local stops would never make the national top 80, so ask for the area separately.
    queries.push(
      db.all<StopRow>(`${sql} AND s.lat5 BETWEEN ? AND ? AND s.lon5 BETWEEN ? AND ? ORDER BY s.rank DESC LIMIT 80`, [
        match,
        ...boundsParams(boundsAround(near, 40)),
      ]),
    );
  }

  const seen = new Map<number, Stop>();
  for (const rows of await Promise.all(queries)) {
    for (const row of rows) if (!seen.has(row.id)) seen.set(row.id, toStop(row));
  }
  return [...seen.values()]
    .map((stop) => ({ stop, s: score(stop, typed, near) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.stop);
}

/** The most important stops inside the visible map area, optionally only the bigger ones. */
export async function stopsInBounds(db: StopsDb, bounds: Bounds, limit = 300, minRank = 0): Promise<Stop[]> {
  const rows = await db.all<StopRow>(
    `SELECT ${COLUMNS} FROM stops s WHERE s.lat5 BETWEEN ? AND ? AND s.lon5 BETWEEN ? AND ? AND s.rank >= ? ORDER BY s.rank DESC LIMIT ?`,
    [...boundsParams(bounds), minRank, limit],
  );
  return rows.map(toStop);
}

/** The closest stop to a point, if one is within maxMeters. Used to snap a long-press to a stop. */
export async function nearestStop(db: StopsDb, point: LatLon, maxMeters: number): Promise<Stop | null> {
  const candidates = await stopsInBounds(db, boundsAround(point, maxMeters / 1000), 200);
  let best: Stop | null = null;
  let bestKm = Infinity;
  for (const stop of candidates) {
    const km = distanceKm(point, stop);
    if (km < bestKm) {
      best = stop;
      bestKm = km;
    }
  }
  return best && bestKm * 1000 <= maxMeters ? best : null;
}
