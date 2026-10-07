import type { StopKind } from './stations/text';

export type Place = {
  id: string;
  name: string;
  /** City, region, country: what tells two "Hauptbahnhof"s apart. */
  context: string;
  latitude: number;
  longitude: number;
  /** A transit stop or station, from the map data. */
  isStop?: boolean;
  /** Stops from the offline database: which kind it is and which lines serve it. */
  kind?: StopKind;
  modes?: number;
};

/** [west, south, east, north] around Germany, with a margin for border stations. */
export const GERMANY_BBOX = [5.5, 47.0, 15.5, 55.2] as const;

const STOP_VALUES = new Set([
  'station',
  'halt',
  'stop',
  'stop_position',
  'platform',
  'bus_stop',
  'bus_station',
  'tram_stop',
  'subway_entrance',
]);

/**
 * Accepts "49.1427, 9.2109", "49.1427 9.2109" and Google/OSM map links that carry coordinates,
 * so a pin copied from any map app works without search.
 */
export function parseCoordinates(input: string): { latitude: number; longitude: number } | null {
  const text = input.trim();
  const patterns = [
    /@(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/, // google.com/maps/@lat,lon,zoom
    /[?&](?:q|query|ll|destination)=(-?\d{1,2}(?:\.\d+)?)(?:,|%2C)\s*(-?\d{1,3}(?:\.\d+)?)/i,
    /[?&]mlat=(-?\d{1,2}(?:\.\d+)?)&mlon=(-?\d{1,3}(?:\.\d+)?)/, // openstreetmap.org
    /^(-?\d{1,2}(?:\.\d+)?)\s*[,; ]\s*(-?\d{1,3}(?:\.\d+)?)$/,
  ];
  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (!m) continue;
    const latitude = Number(m[1]);
    const longitude = Number(m[2]);
    if (Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) return { latitude, longitude };
  }
  return null;
}

type PhotonFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: Record<string, string | number | undefined>;
};

/** Turns a Photon (OpenStreetMap) GeoJSON response into places, dropping duplicates. */
export function parsePhoton(json: unknown): Place[] {
  const features = (json as { features?: PhotonFeature[] })?.features ?? [];
  const places: Place[] = [];
  const seen = new Set<string>();
  for (const f of features) {
    const coords = f.geometry?.coordinates;
    const p = f.properties ?? {};
    if (!coords || coords.length < 2) continue;
    const street = [p.street, p.housenumber].filter(Boolean).join(' ');
    const name = String(p.name ?? (street || p.city || ''));
    if (!name) continue;
    const context = unique([p.name ? street : '', p.district, p.city, p.state, p.country].map(String))
      .filter((part) => part && part !== 'undefined' && part !== name)
      .join(', ');
    const key = `${name}|${context}`;
    if (seen.has(key)) continue;
    seen.add(key);
    places.push({
      id: `osm:${p.osm_type ?? ''}${p.osm_id ?? `${coords[1]},${coords[0]}`}`,
      name,
      context,
      latitude: coords[1],
      longitude: coords[0],
      isStop: STOP_VALUES.has(String(p.osm_value ?? '')),
    });
  }
  return places;
}

function unique(values: string[]): string[] {
  return values.filter((v, i) => values.indexOf(v) === i);
}

export type SearchOptions = {
  near?: { latitude: number; longitude: number };
  language?: string;
  signal?: AbortSignal;
};

/**
 * Searches OpenStreetMap through the public Photon service. Fine for a prototype; a launch needs
 * our own Photon instance or a paid geocoder (the public one asks for fair use).
 */
export async function searchPlaces(query: string, options: SearchOptions = {}): Promise<Place[]> {
  const coords = parseCoordinates(query);
  if (coords) {
    return [
      {
        id: `coords:${coords.latitude},${coords.longitude}`,
        name: 'Dropped pin',
        context: `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`,
        ...coords,
      },
    ];
  }
  const params: Record<string, string> = { q: query, limit: '8' };
  if (options.near) {
    params.lat = options.near.latitude.toFixed(4);
    params.lon = options.near.longitude.toFixed(4);
  }
  const lang = (options.language ?? 'en').slice(0, 2);
  if (['en', 'de', 'fr'].includes(lang)) params.lang = lang;
  params.bbox = GERMANY_BBOX.join(',');
  const qs = Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  const res = await fetch(`https://photon.komoot.io/api/?${qs}`, { signal: options.signal });
  if (!res.ok) throw new Error(`Search failed (${res.status})`);
  return parsePhoton(await res.json());
}

/** The address at a point, for a pin dropped on the map. Needs internet; null when unknown. */
export async function reversePlace(
  latitude: number,
  longitude: number,
  options: { language?: string; signal?: AbortSignal } = {},
): Promise<Place | null> {
  const lang = (options.language ?? 'en').slice(0, 2);
  const langParam = ['en', 'de', 'fr'].includes(lang) ? `&lang=${lang}` : '';
  const res = await fetch(
    `https://photon.komoot.io/reverse?lat=${latitude.toFixed(6)}&lon=${longitude.toFixed(6)}&limit=1${langParam}`,
    { signal: options.signal },
  );
  if (!res.ok) return null;
  const found = parsePhoton(await res.json())[0];
  return found ? { ...found, latitude, longitude } : null;
}
