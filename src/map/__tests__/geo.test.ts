import { describe, expect, it } from 'vitest';

import { distanceKm } from '../../lib/stations/search';
import { boundsOf, circlePolygon, stopQueryForZoom, stopsToGeoJSON } from '../geo';

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
    expect(fc.features[0].properties).toMatchObject({ id: 1, kind: 'train', color: '#E3001B' });
    expect(fc.features[0].geometry.coordinates).toEqual([9.98, 48.4]);
  });
});
