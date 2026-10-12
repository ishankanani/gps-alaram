import { describe, expect, it } from 'vitest';

import { distanceKm } from '../../lib/stations/search';
import {
  bearingDeg,
  boundsOf,
  circlePolygon,
  GERMANY_CENTER,
  GERMANY_ZOOM,
  headingOf,
  initialViewFor,
  lineFeature,
  puckFeature,
  stopPlaceId,
  stopQueryForZoom,
  stopsToGeoJSON,
  trailLengthM,
} from '../geo';

describe('map geometry', () => {
  it('draws the alarm circle at the right size', () => {
    const ring = circlePolygon(49.14, 9.21, 300).geometry.coordinates[0];
    expect(ring[0][0]).toBeCloseTo(ring[ring.length - 1][0], 9);
    expect(ring[0][1]).toBeCloseTo(ring[ring.length - 1][1], 9);
    for (const [lon, lat] of ring) {
      const m = distanceKm({ latitude: 49.14, longitude: 9.21 }, { latitude: lat, longitude: lon }) * 1000;
      expect(Math.abs(m - 300)).toBeLessThan(3);
    }
  });

  it('fits points with padding', () => {
    const [w, s, e, n] = boundsOf([
      { latitude: 49.1, longitude: 9.2 },
      { latitude: 49.2, longitude: 9.4 },
    ]);
    expect(w).toBeLessThan(9.2);
    expect(e).toBeGreaterThan(9.4);
    expect(s).toBeLessThan(49.1);
    expect(n).toBeGreaterThan(49.2);
  });

  it('shows more stops as you zoom in', () => {
    expect(stopQueryForZoom(6)).toBeNull();
    expect(stopQueryForZoom(10)!.minRank).toBeGreaterThan(stopQueryForZoom(12)!.minRank);
    expect(stopQueryForZoom(15)!.minRank).toBe(0);
  });

  it('colours stops by kind', () => {
    const fc = stopsToGeoJSON([
      { id: 1, name: 'Ulm Hbf', title: 'Ulm Hbf', place: null, latitude: 48.4, longitude: 9.98, modes: 1, rank: 500 },
    ]);
    expect(fc.features[0].properties).toMatchObject({ id: 1, pid: 'stop:Ulm Hbf', kind: 'train', color: '#E3001B' });
    expect(stopPlaceId({ name: 'Ulm Hbf' })).toBe('stop:Ulm Hbf');
    expect(fc.features[0].geometry.coordinates).toEqual([9.98, 48.4]);
  });
});

describe('bearingDeg', () => {
  const here = { latitude: 48.14, longitude: 11.56 };
  it('points north, east, south and west', () => {
    expect(bearingDeg(here, { latitude: 48.15, longitude: 11.56 })).toBeCloseTo(0, 5);
    expect(bearingDeg(here, { latitude: 48.14, longitude: 11.57 })).toBeCloseTo(90, 5);
    expect(bearingDeg(here, { latitude: 48.13, longitude: 11.56 })).toBeCloseTo(180, 5);
    expect(bearingDeg(here, { latitude: 48.14, longitude: 11.55 })).toBeCloseTo(270, 5);
  });
  it('has no direction for points a few metres apart', () => {
    expect(bearingDeg(here, { latitude: 48.14001, longitude: 11.56 })).toBeNull();
  });
});

describe('trip geometry', () => {
  const a = { latitude: 48.14, longitude: 11.56 };
  const b = { latitude: 48.15, longitude: 11.56 };

  it('draws lines and the puck in GeoJSON order (longitude first)', () => {
    expect(lineFeature([a, b]).geometry.coordinates).toEqual([
      [11.56, 48.14],
      [11.56, 48.15],
    ]);
    expect(puckFeature(a, 90, true).properties).toEqual({ heading: 90, hasHeading: true, estimated: true });
    expect(puckFeature(a, null, false).properties).toMatchObject({ hasHeading: false, heading: 0 });
  });

  it('points the way you came from, or towards the stop without a trail', () => {
    expect(headingOf([a], b, a)).toBeCloseTo(0, 5);
    expect(headingOf([], a, b)).toBeCloseTo(0, 5);
    expect(headingOf([], a, a)).toBeNull();
  });

  it('measures the trail', () => {
    expect(trailLengthM([a, b])).toBeCloseTo(1105, -1);
    expect(trailLengthM([a])).toBe(0);
  });
});

describe('initialViewFor', () => {
  it('opens on Germany by default', () => {
    expect(initialViewFor(null)).toEqual({ center: GERMANY_CENTER, zoom: GERMANY_ZOOM });
    expect(initialViewFor('DE')).toEqual({ center: GERMANY_CENTER, zoom: GERMANY_ZOOM });
    expect(initialViewFor('BR')).toEqual({ center: GERMANY_CENTER, zoom: GERMANY_ZOOM });
  });

  it('opens on a covered country, all of its regions', () => {
    expect(initialViewFor('AT')).toEqual({ bounds: [9.5, 46.37, 17.17, 49.02] });
    const us = initialViewFor('US');
    expect('bounds' in us && us.bounds[0]).toBe(-124.85);
    expect('bounds' in us && us.bounds[2]).toBe(-66.93);
  });
});
