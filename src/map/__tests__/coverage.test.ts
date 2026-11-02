import { describe, expect, it } from 'vitest';

import shipped from '../coverage/data.json';
import {
  chunksInView,
  classOf,
  COVERAGE_MAX_ZOOM,
  coverageView,
  decodeCell,
  decodeChunk,
  densityClasses,
  encodeCell,
  encodeCoverage,
  expandZoom,
  latToY,
  LEVELS,
  levelForZoom,
  lonToX,
  xToLon,
  yToLat,
  type Bounds,
  type CoverageData,
} from '../coverage';

const data = shipped as CoverageData;

/** A view of a 411 x 900 dp phone map around a point. */
function viewAround(lat: number, lon: number, zoom: number): Bounds {
  const dLon = (411 / (512 * 2 ** zoom)) * 360;
  const dLat = (900 / (512 * 2 ** zoom)) * 180 * Math.cos((lat * Math.PI) / 180);
  return [lon - dLon / 2, lat - dLat / 2, lon + dLon / 2, lat + dLat / 2];
}

// A few hundred stops around Munich and Vienna, and one in Sydney.
const munich = Array.from({ length: 300 }, (_, i) => [48.1 + (i % 20) * 0.01, 11.5 + Math.floor(i / 20) * 0.01] as const);
const vienna = Array.from({ length: 40 }, (_, i) => [48.2 + (i % 5) * 0.004, 16.37 + Math.floor(i / 5) * 0.004] as const);
const sample = encodeCoverage([...munich, ...vienna, [-33.87, 151.21]], LEVELS, '2026-01-01T00:00:00Z');

describe('coverage layer', () => {
  it('projects to Web Mercator and back', () => {
    for (const [lat, lon] of [[0, 0], [48.14, 11.56], [-33.87, 151.21], [64.1, -21.9]]) {
      expect(yToLat(latToY(lat))).toBeCloseTo(lat, 9);
      expect(xToLon(lonToX(lon))).toBeCloseTo(lon, 9);
    }
    expect(latToY(90)).toBeGreaterThanOrEqual(0);
    expect(latToY(-90)).toBeLessThanOrEqual(1);
  });

  it('packs a cell into three characters', () => {
    for (const [sx, sy, cls] of [[0, 0, 0], [255, 255, 3], [17, 200, 2], [128, 1, 1]]) {
      const s = encodeCell(sx, sy, cls);
      expect(s).toMatch(/^[A-Za-z0-9_-]{3}$/);
      expect(decodeCell(s)).toEqual({ sx, sy, cls });
      expect(decodeCell(`xx${s}`, 2)).toEqual({ sx, sy, cls });
    }
  });

  it('splits counts into four density classes', () => {
    const counts = Array.from({ length: 100 }, (_, i) => i + 1);
    const classes = densityClasses(counts);
    expect(classes).toEqual([51, 86, 98]);
    expect(classOf(1, classes)).toBe(0);
    expect(classOf(60, classes)).toBe(1);
    expect(classOf(90, classes)).toBe(2);
    expect(classOf(1000, classes)).toBe(3);
    // Mostly lone stops still give increasing thresholds above 1.
    expect(densityClasses([1, 1, 1, 1, 2])).toEqual([2, 3, 4]);
    expect(densityClasses([])).toEqual([2, 3, 4]);
  });

  it('counts every stop and keeps cells near their stops', () => {
    expect(sample.stops).toBe(341);
    for (const level of sample.levels) {
      const cells = level.chunks.flatMap(([key]) => decodeChunk(level, key));
      // One cell per grid square with stops; every dot lies within one cell of a stop.
      const size = 360 / 2 ** level.grid;
      for (const cell of cells) {
        const near = [...munich, ...vienna, [-33.87, 151.21] as const].some(
          ([lat, lon]) => Math.abs(lat - cell.latitude) < size && Math.abs(lon - cell.longitude) < size,
        );
        expect(near).toBe(true);
      }
      expect(cells.some((c) => c.latitude < -30)).toBe(true);
    }
  });

  it('picks the level for the zoom and stops where the real stops show', () => {
    expect(levelForZoom(sample, 2)?.grid).toBe(9);
    expect(levelForZoom(sample, 4)?.grid).toBe(10);
    expect(levelForZoom(sample, 6)?.grid).toBe(11);
    expect(levelForZoom(sample, 8)?.grid).toBe(12);
    expect(levelForZoom(sample, COVERAGE_MAX_ZOOM)).toBeNull();
    expect(levelForZoom(sample, 14)).toBeNull();
    expect(levelForZoom(sample, Number.NaN)).toBeNull();
    expect(coverageView(sample, viewAround(48.14, 11.56, 12), 12).collection.features).toHaveLength(0);
  });

  it('decodes only the chunks in view', () => {
    const level = levelForZoom(sample, 7)!;
    const bavaria = chunksInView(level, viewAround(48.14, 11.56, 7));
    expect(bavaria.length).toBeGreaterThan(0);
    const sydney = chunksInView(level, viewAround(-33.87, 151.21, 7));
    expect(sydney).toHaveLength(1);
    expect(bavaria).not.toContain(sydney[0]);
    // Across the antimeridian (west > east) and wider than the world.
    expect(chunksInView(levelForZoom(sample, 1)!, [150, -60, -170, 0])).toEqual(
      chunksInView(levelForZoom(sample, 1)!, [150, -60, 190, 0]),
    );
    expect(chunksInView(levelForZoom(sample, 1)!, [150, -60, -170, 0])).toHaveLength(1);
    expect(chunksInView(levelForZoom(sample, 0)!, [-400, -85, 400, 85]).length).toBe(sample.levels[0].chunks.length);
  });

  it('gives the map points with their class, and a key that only changes with the chunks', () => {
    const a = coverageView(sample, viewAround(48.14, 11.56, 6), 6);
    const b = coverageView(sample, viewAround(48.141, 11.561, 6.1), 6.1);
    expect(a.collection.features.length).toBeGreaterThan(0);
    expect(a.key).toBe(b.key);
    for (const f of a.collection.features) expect([0, 1, 2, 3]).toContain(f.properties?.c);
    expect(coverageView(sample, viewAround(-33.87, 151.21, 6), 6).key).not.toBe(a.key);
  });

  it('zooms into the next level on a tap, up to where stops show', () => {
    expect(expandZoom(sample, 2)).toBe(4);
    expect(expandZoom(sample, 3.4)).toBe(5.4);
    expect(expandZoom(sample, 7)).toBe(9);
    expect(expandZoom(sample, 8.4)).toBe(COVERAGE_MAX_ZOOM + 1.5);
  });

  it('ships every stop of every country, light enough for a phone', () => {
    expect(data.version).toBe(1);
    expect(data.stops).toBeGreaterThan(1_000_000);
    expect(data.levels.map((l) => l.grid)).toEqual(LEVELS.map((l) => l.grid));
    // Dense places at every zoom: never more than about 8,000 dots at once.
    for (const [lat, lon] of [[50.94, 6.96], [51.5, -0.12], [48.85, 2.35], [35.68, 139.69], [40.71, -74.0]]) {
      for (let zoom = 0; zoom < COVERAGE_MAX_ZOOM; zoom += 0.5) {
        expect(coverageView(data, viewAround(lat, lon, zoom), zoom).collection.features.length).toBeLessThan(8000);
      }
    }
    // Tokyo and New York are covered, the middle of the Atlantic is not.
    expect(coverageView(data, viewAround(35.68, 139.69, 7), 7).collection.features.length).toBeGreaterThan(100);
    expect(coverageView(data, viewAround(40, -40, 7), 7).collection.features).toHaveLength(0);
  });
});
