/**
 * The countries StopWake covers. Germany ships inside the app; the others are stop packs built
 * from OpenStreetMap by .github/workflows/stop-packs.yml and downloaded on demand. Big countries
 * are split into regions, one pack each. Free of imports so the workflow can read it with Node.
 */

/** [west, south, east, north] in degrees. */
export type Box = readonly [number, number, number, number];

export type Region = 'europe' | 'americas' | 'asiaPacific';

export type CountryPack = {
  /** Pack id, also the file name: at.db.gz. */
  id: string;
  /** ISO 3166-1 alpha-2 country code, lowercase. */
  country: string;
  flag: string;
  region: Region;
  /** Rollout wave (1 = first), for the plan in README. Germany is 0. */
  wave: 0 | 1 | 2 | 3 | 4;
  /** Rough area the pack covers, to suggest it and to skip it when the map is elsewhere. */
  box: Box;
  /** Geofabrik extract the pack is built from (download.geofabrik.de/<source>-latest.osm.pbf). */
  source: string | null;
};

export const PACKS: readonly CountryPack[] = [
  { id: 'de', country: 'de', flag: '🇩🇪', region: 'europe', wave: 0, box: [5.5, 47.0, 15.5, 55.2], source: null },
  // Wave 1: German-speaking neighbours.
  { id: 'at', country: 'at', flag: '🇦🇹', region: 'europe', wave: 1, box: [9.5, 46.37, 17.17, 49.02], source: 'europe/austria' },
  { id: 'ch', country: 'ch', flag: '🇨🇭', region: 'europe', wave: 1, box: [5.95, 45.82, 10.49, 47.81], source: 'europe/switzerland' },
  { id: 'lu', country: 'lu', flag: '🇱🇺', region: 'europe', wave: 1, box: [5.73, 49.44, 6.53, 50.19], source: 'europe/luxembourg' },
  // Wave 2: Benelux, the British Isles and the Nordics.
  { id: 'nl', country: 'nl', flag: '🇳🇱', region: 'europe', wave: 2, box: [3.31, 50.75, 7.23, 53.56], source: 'europe/netherlands' },
  { id: 'be', country: 'be', flag: '🇧🇪', region: 'europe', wave: 2, box: [2.54, 49.49, 6.41, 51.51], source: 'europe/belgium' },
  { id: 'gb', country: 'gb', flag: '🇬🇧', region: 'europe', wave: 2, box: [-8.65, 49.86, 1.77, 60.86], source: 'europe/united-kingdom' },
  { id: 'ie', country: 'ie', flag: '🇮🇪', region: 'europe', wave: 2, box: [-10.48, 51.42, -5.99, 55.39], source: 'europe/ireland-and-northern-ireland' },
  { id: 'se', country: 'se', flag: '🇸🇪', region: 'europe', wave: 2, box: [10.96, 55.33, 24.17, 69.06], source: 'europe/sweden' },
  { id: 'no', country: 'no', flag: '🇳🇴', region: 'europe', wave: 2, box: [4.5, 57.95, 31.17, 71.19], source: 'europe/norway' },
  { id: 'dk', country: 'dk', flag: '🇩🇰', region: 'europe', wave: 2, box: [8.07, 54.55, 15.2, 57.76], source: 'europe/denmark' },
  { id: 'fi', country: 'fi', flag: '🇫🇮', region: 'europe', wave: 2, box: [20.45, 59.8, 31.59, 70.09], source: 'europe/finland' },
  // Wave 3: France.
  { id: 'fr', country: 'fr', flag: '🇫🇷', region: 'europe', wave: 3, box: [-5.15, 41.33, 9.57, 51.09], source: 'europe/france' },
  // Wave 4: big markets where most riders use iPhones.
  { id: 'us-northeast', country: 'us', flag: '🇺🇸', region: 'americas', wave: 4, box: [-80.52, 38.92, -66.93, 47.46], source: 'north-america/us-northeast' },
  { id: 'us-midwest', country: 'us', flag: '🇺🇸', region: 'americas', wave: 4, box: [-104.06, 35.99, -80.51, 49.39], source: 'north-america/us-midwest' },
  { id: 'us-south', country: 'us', flag: '🇺🇸', region: 'americas', wave: 4, box: [-106.65, 24.39, -75.04, 40.64], source: 'north-america/us-south' },
  { id: 'us-west', country: 'us', flag: '🇺🇸', region: 'americas', wave: 4, box: [-124.85, 31.33, -102.04, 49.0], source: 'north-america/us-west' },
  { id: 'ca', country: 'ca', flag: '🇨🇦', region: 'americas', wave: 4, box: [-141.0, 41.67, -52.62, 83.11], source: 'north-america/canada' },
  { id: 'au', country: 'au', flag: '🇦🇺', region: 'asiaPacific', wave: 4, box: [112.92, -43.65, 153.64, -10.67], source: 'australia-oceania/australia' },
  { id: 'jp', country: 'jp', flag: '🇯🇵', region: 'asiaPacific', wave: 4, box: [122.93, 24.04, 153.99, 45.56], source: 'asia/japan' },
];

/** The pack that ships with the app. */
export const BUILT_IN_PACK = 'de';

export function packById(id: string): CountryPack | undefined {
  return PACKS.find((p) => p.id === id);
}

export function boxContains([west, south, east, north]: Box, latitude: number, longitude: number): boolean {
  return latitude >= south && latitude <= north && longitude >= west && longitude <= east;
}

export function boxesIntersect(a: Box, b: Box): boolean {
  return a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
}

/**
 * The packs for a point in a country (by its ISO code), smallest area first: a regional US pack
 * whose box contains the point, or the country's only pack.
 */
export function packsFor(country: string, latitude: number, longitude: number): CountryPack[] {
  const ofCountry = PACKS.filter((p) => p.country === country.toLowerCase());
  if (ofCountry.length <= 1) return ofCountry;
  const area = (b: Box) => (b[2] - b[0]) * (b[3] - b[1]);
  return ofCountry.filter((p) => boxContains(p.box, latitude, longitude)).sort((a, b) => area(a.box) - area(b.box));
}

/** Packs whose box contains the point; a cheap first check before asking where exactly that is. */
export function packsNear(latitude: number, longitude: number): CountryPack[] {
  return PACKS.filter((p) => boxContains(p.box, latitude, longitude));
}
