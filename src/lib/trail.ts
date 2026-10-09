import type { TripStatus } from '../../modules/trip-alarm/src/TripAlarm.types';

export type TrailPoint = { latitude: number; longitude: number };
export type Trail = { tripId: string | null; points: TrailPoint[] };

const MIN_STEP_M = 10;
const MAX_POINTS = 600;

export const EMPTY_TRAIL: Trail = { tripId: null, points: [] };

/**
 * Adds the position from a status update to the way travelled so far. Only real fixes count (not
 * the estimate while GPS is lost), a new trip starts a new trail, and points closer than 10 m to
 * the last one are skipped.
 */
export function extendTrail(trail: Trail, status: TripStatus): Trail {
  const tripId = status.trip?.id ?? null;
  const base = tripId === trail.tripId ? trail : { tripId, points: [] };
  if (status.latitude == null || status.longitude == null || status.estimated) return base;
  const point = { latitude: status.latitude, longitude: status.longitude };
  const last = base.points[base.points.length - 1];
  if (last) {
    const north = (point.latitude - last.latitude) * 110_540;
    const east = (point.longitude - last.longitude) * 111_320 * Math.cos((last.latitude * Math.PI) / 180);
    if (Math.hypot(north, east) < MIN_STEP_M) return base;
  }
  return { tripId, points: [...base.points, point].slice(-MAX_POINTS) };
}
