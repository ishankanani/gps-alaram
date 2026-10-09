import type { Feature, FeatureCollection, Point, Polygon } from 'geojson';

import type { Stop } from '../lib/stations/search';
import { primaryKind } from '../lib/stations/text';
import { KIND_COLOR } from '../ui/colors';

/** Free vector map tiles from OpenStreetMap data, no API key needed. */
export const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

/** [longitude, latitude] of the middle of Germany, and a zoom that shows all of it. */
export const GERMANY_CENTER: [number, number] = [10.45, 51.16];
export const GERMANY_ZOOM = 5.2;

/** Stop dots appear from this zoom; below it only the big stations. */
export const ALL_STOPS_ZOOM = 13.5;

/** Which stops to draw at a zoom level: nothing when zoomed far out, then the big ones, then all. */
export function stopQueryForZoom(zoom: number): { minRank: number; limit: number } | null {
  if (zoom < 8.5) return null;
  if (zoom < 11) return { minRank: 380, limit: 120 };
  if (zoom < ALL_STOPS_ZOOM) return { minRank: 150, limit: 250 };
  return { minRank: 0, limit: 450 };
}

export function stopsToGeoJSON(stops: Stop[]): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: stops.map((s) => {
      const kind = primaryKind(s.modes);
      return {
        type: 'Feature',
        id: s.id,
        geometry: { type: 'Point', coordinates: [s.longitude, s.latitude] },
        properties: { id: s.id, title: s.title, rank: s.rank, kind, color: KIND_COLOR[kind] },
      };
    }),
  };
}

/** A circle of radiusM around a point as a polygon, for drawing the alarm radius. */
export function circlePolygon(latitude: number, longitude: number, radiusM: number, steps = 72): Feature<Polygon> {
  const coords: [number, number][] = [];
  const dLat = radiusM / 111_320;
  const dLon = radiusM / (111_320 * Math.cos((latitude * Math.PI) / 180));
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    coords.push([longitude + dLon * Math.cos(a), latitude + dLat * Math.sin(a)]);
  }
  return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [coords] }, properties: {} };
}

/** Bounds [west, south, east, north] that contain all points, padded by a fraction of their span. */
export function boundsOf(points: { latitude: number; longitude: number }[], pad = 0.15): [number, number, number, number] {
  const lats = points.map((p) => p.latitude);
  const lons = points.map((p) => p.longitude);
  let [w, s, e, n] = [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
  const padLon = Math.max((e - w) * pad, 0.003);
  const padLat = Math.max((n - s) * pad, 0.002);
  [w, s, e, n] = [w - padLon, s - padLat, e + padLon, n + padLat];
  return [w, s, e, n];
}

/** Compass bearing from a to b in degrees (0 = north, 90 = east), or null when they are a few metres apart. */
export function bearingDeg(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number | null {
  const north = (b.latitude - a.latitude) * 110_540;
  const east = (b.longitude - a.longitude) * 111_320 * Math.cos((a.latitude * Math.PI) / 180);
  if (Math.hypot(north, east) < 3) return null;
  return ((Math.atan2(east, north) * 180) / Math.PI + 360) % 360;
}
