import type { Feature, FeatureCollection, LineString, Point, Polygon } from 'geojson';

import { PACKS, type Box } from '../lib/stations/countries';
import type { Stop } from '../lib/stations/search';
import { primaryKind } from '../lib/stations/text';
import { KIND_COLOR } from '../ui/colors';

// Map geometry and GeoJSON for the home and trip maps. Pure (no react-native), so it is tested.

/** Free vector map tiles from OpenStreetMap data, no API key needed. */
export const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

/** [longitude, latitude] of the middle of Germany, and a zoom that shows all of it. */
export const GERMANY_CENTER: [number, number] = [10.45, 51.16];
export const GERMANY_ZOOM = 5.2;

/** Stop dots appear from this zoom; below it only the big stations. */
export const ALL_STOPS_ZOOM = 13.5;

/** The zoom hint ("Zoom in to see all stops") shows from here up to ALL_STOPS_ZOOM. */
export const ZOOM_HINT_FROM = 8.5;

export type LatLon = { latitude: number; longitude: number };

/** Which stops to draw at a zoom level: nothing when zoomed far out, then the big ones, then all. */
export function stopQueryForZoom(zoom: number): { minRank: number; limit: number } | null {
  if (zoom < 8.5) return null;
  if (zoom < 11) return { minRank: 380, limit: 120 };
  if (zoom < ALL_STOPS_ZOOM) return { minRank: 150, limit: 250 };
  return { minRank: 0, limit: 450 };
}

/** The id a stop gets as a destination (the same as stopToPlace), so the selected stop can be hidden. */
export function stopPlaceId(stop: Pick<Stop, 'name'>): string {
  return `stop:${stop.name}`;
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
        properties: { id: s.id, pid: stopPlaceId(s), title: s.title, rank: s.rank, kind, color: KIND_COLOR[kind] },
      };
    }),
  };
}

/** A circle of radiusM around a point as a polygon, for drawing the wake zone. */
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

/** A line through points (the trail, or the dotted line ahead to the stop). */
export function lineFeature(points: LatLon[]): Feature<LineString> {
  return {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: points.map((p) => [p.longitude, p.latitude]) },
    properties: {},
  };
}

/**
 * Your position on the trip map, drawn as GL layers (a disc and an arrow), so it moves with the
 * map instead of lagging behind it like a view marker. `heading` null draws a dot instead.
 */
export function puckFeature(position: LatLon, heading: number | null, estimated: boolean): Feature<Point> {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [position.longitude, position.latitude] },
    properties: { heading: heading ?? 0, hasHeading: heading != null, estimated },
  };
}

/** Bounds [west, south, east, north] that contain all points, padded by a fraction of their span. */
export function boundsOf(points: LatLon[], pad = 0.15): [number, number, number, number] {
  const lats = points.map((p) => p.latitude);
  const lons = points.map((p) => p.longitude);
  let [w, s, e, n] = [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
  const padLon = Math.max((e - w) * pad, 0.003);
  const padLat = Math.max((n - s) * pad, 0.002);
  [w, s, e, n] = [w - padLon, s - padLat, e + padLon, n + padLat];
  return [w, s, e, n];
}

/** Compass bearing from a to b in degrees (0 = north, 90 = east), or null when they are a few metres apart. */
export function bearingDeg(a: LatLon, b: LatLon): number | null {
  const north = (b.latitude - a.latitude) * 110_540;
  const east = (b.longitude - a.longitude) * 111_320 * Math.cos((a.latitude * Math.PI) / 180);
  if (Math.hypot(north, east) < 3) return null;
  return ((Math.atan2(east, north) * 180) / Math.PI + 360) % 360;
}

/**
 * The way you are going: from the last trail point a few metres back to where you are, or towards
 * the stop before there is a trail. Null when nothing gives a direction.
 */
export function headingOf(trail: LatLon[], position: LatLon, destination: LatLon): number | null {
  for (let i = trail.length - 1; i >= 0; i--) {
    const b = bearingDeg(trail[i], position);
    if (b != null) return b;
  }
  return bearingDeg(position, destination);
}

/** Path length of a trail in metres. */
export function trailLengthM(points: LatLon[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const north = (b.latitude - a.latitude) * 110_540;
    const east = (b.longitude - a.longitude) * 111_320 * Math.cos((a.latitude * Math.PI) / 180);
    total += Math.hypot(north, east);
  }
  return total;
}

export type InitialView = { center: [number, number]; zoom: number } | { bounds: [number, number, number, number] };

function unionBox(boxes: readonly Box[]): [number, number, number, number] {
  return [
    Math.min(...boxes.map((b) => b[0])),
    Math.min(...boxes.map((b) => b[1])),
    Math.max(...boxes.map((b) => b[2])),
    Math.max(...boxes.map((b) => b[3])),
  ];
}

/**
 * Where the map opens before the position is known: the phone's region country when we cover it
 * (all of its regional packs), otherwise Germany at zoom 5.2.
 */
export function initialViewFor(regionCode: string | null | undefined): InitialView {
  const code = (regionCode ?? '').toLowerCase();
  const packs = code && code !== 'de' ? PACKS.filter((p) => p.country === code) : [];
  if (packs.length === 0) return { center: GERMANY_CENTER, zoom: GERMANY_ZOOM };
  return { bounds: unionBox(packs.map((p) => p.box)) };
}
