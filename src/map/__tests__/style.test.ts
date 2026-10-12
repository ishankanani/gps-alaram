import type { LayerSpecification, StyleSpecification } from '@maplibre/maplibre-gl-style-spec';
import { describe, expect, it } from 'vitest';

import { MAP_COLORS } from '../../ui/colors';
import { capOpacity, FALLBACK_RULES, prepareStyle, RECOLOUR_RULES, ruleFor } from '../style';
import LIBERTY_JSON from './fixtures/liberty.json';

// A pinned copy of OpenFreeMap's Liberty style (layers, paint, layout and filters as published).
const LIBERTY = LIBERTY_JSON as unknown as StyleSpecification;

// Layers as they appear in the OpenFreeMap "liberty" style, for the label rules.
const ENGLISH_FIRST = ['coalesce', ['get', 'name_en'], ['get', 'name']];
const NAME_FIELD = ['case', ['has', 'name:nonlatin'], ['concat', ['get', 'name:latin'], '\n', ['get', 'name:nonlatin']], ENGLISH_FIRST];
const STYLE = {
  version: 8,
  sources: {},
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#fff' } },
    {
      id: 'poi_transit',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'poi',
      filter: ['match', ['get', 'class'], ['airport', 'bus', 'rail'], true, false],
      layout: { 'text-field': NAME_FIELD },
    },
    {
      id: 'label_city',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'place',
      layout: { 'text-field': NAME_FIELD, 'text-font': ['Noto Sans Bold'] },
    },
    {
      id: 'label_country_1',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'place',
      layout: { 'text-field': NAME_FIELD },
    },
    {
      id: 'highway-shield-non-us',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'transportation_name',
      layout: { 'text-field': ['to-string', ['get', 'ref']] },
    },
    { id: 'poi_old', type: 'symbol', source: 'openmaptiles', layout: { 'text-field': '{name:latin}' } },
  ],
} as unknown as StyleSpecification;

const LOCAL = ['coalesce', ['get', 'name'], ['get', 'name:latin'], ['get', 'name_en']];

type Loose = { filter?: unknown; layout?: Record<string, unknown>; paint?: Record<string, unknown> };

function layer(style: StyleSpecification, id: string) {
  const found = style.layers.find((l) => l.id === id);
  if (!found) throw new Error(`no layer ${id}`);
  return found as unknown as Loose;
}

describe('prepareStyle: names', () => {
  const de = prepareStyle(STYLE, 'de');

  it('labels places with local names ("München", not "Munich")', () => {
    expect(layer(de, 'label_city').layout?.['text-field']).toEqual(LOCAL);
    expect(layer(de, 'poi_old').layout?.['text-field']).toEqual(LOCAL);
    expect(layer(prepareStyle(STYLE, 'en'), 'label_city').layout?.['text-field']).toEqual(LOCAL);
  });

  it('names countries in the app language, English for Hindi', () => {
    const inEnglish = [['get', 'name:en'], ['get', 'name_en'], ['get', 'name']];
    expect(layer(de, 'label_country_1').layout?.['text-field']).toEqual(['coalesce', ['get', 'name:de'], ['get', 'name_de'], ...inEnglish]);
    expect(layer(prepareStyle(STYLE, 'nb'), 'label_country_1').layout?.['text-field']).toEqual([
      'coalesce',
      ['get', 'name:no'],
      ['get', 'name_no'],
      ...inEnglish,
    ]);
    const english = ['coalesce', ['get', 'name:en'], ['get', 'name_en'], ['get', 'name']];
    expect(layer(prepareStyle(STYLE, 'en'), 'label_country_1').layout?.['text-field']).toEqual(english);
    expect(layer(prepareStyle(STYLE, 'hi'), 'label_country_1').layout?.['text-field']).toEqual(english);
  });

  it('leaves bus and rail stations to the stops layer but keeps airports', () => {
    expect(layer(de, 'poi_transit').filter).toEqual(['==', ['get', 'class'], 'airport']);
    expect(layer(de, 'poi_transit').layout?.['text-field']).toEqual(LOCAL);
  });

  it('keeps road numbers, other layout and unknown layers', () => {
    expect(layer(de, 'highway-shield-non-us').layout?.['text-field']).toEqual(['to-string', ['get', 'ref']]);
    expect(layer(de, 'label_city').layout?.['text-font']).toEqual(['Noto Sans Bold']);
    expect(de.layers).toHaveLength(STYLE.layers.length);
  });

  it('does not change the original style', () => {
    expect(layer(STYLE, 'label_city').layout?.['text-field']).toEqual(NAME_FIELD);
    expect(layer(STYLE, 'poi_transit').filter).toEqual(['match', ['get', 'class'], ['airport', 'bus', 'rail'], true, false]);
    expect(layer(STYLE, 'background').paint?.['background-color']).toBe('#fff');
  });
});

describe('prepareStyle: calm recolour of Liberty (2.1.1)', () => {
  const light = prepareStyle(LIBERTY, 'en', 'light');
  const dark = prepareStyle(LIBERTY, 'en', 'dark');
  const L = MAP_COLORS.light;
  const D = MAP_COLORS.dark;

  it('matches every rule to at least one Liberty layer', () => {
    const unused = RECOLOUR_RULES.filter((rule) => !LIBERTY.layers.some((l) => rule.test(l))).map((r) => r.name);
    expect(unused).toEqual([]);
  });

  it('names every line and fill layer of Liberty in a rule (fallbacks are for renamed layers)', () => {
    const unmatched = LIBERTY.layers
      .filter((l) => l.type === 'line' || l.type === 'fill' || l.type === 'fill-extrusion')
      .filter((l) => !RECOLOUR_RULES.some((r) => r.test(l)))
      .map((l) => l.id);
    expect(unmatched).toEqual([]);
  });

  it('keeps yellow and orange out of every road', () => {
    const roadColours = light.layers
      .filter((l) => l.type === 'line' && (l as { 'source-layer'?: string })['source-layer'] === 'transportation')
      .map((l) => (l as unknown as Loose).paint?.['line-color']);
    const allowed = new Set([L.road, L.roadMajor, L.motorway, L.casing, L.casingMajor, L.path, L.rail, L.railTunnel]);
    expect(roadColours.filter((c) => !allowed.has(c as string))).toEqual([]);
  });

  it('recolours land, water, parks and buildings per scheme', () => {
    expect(layer(light, 'background').paint?.['background-color']).toBe(L.land);
    expect(layer(dark, 'background').paint?.['background-color']).toBe(D.land);
    expect(layer(light, 'water').paint?.['fill-color']).toBe(L.water);
    expect(layer(light, 'waterway_river').paint?.['line-color']).toBe(L.water);
    expect(layer(light, 'park').paint?.['fill-color']).toBe(L.park);
    expect(layer(light, 'landcover_wood').paint?.['fill-opacity']).toBe(0.6);
    expect(layer(light, 'landuse_residential').paint?.['fill-color']).toBe(L.landuse);
    expect(layer(dark, 'building').paint).toMatchObject({ 'fill-color': D.building, 'fill-outline-color': D.buildingLine });
  });

  it('sorts roads, casings and rail', () => {
    expect(layer(light, 'road_motorway').paint?.['line-color']).toBe(L.motorway);
    expect(layer(light, 'road_motorway_link').paint?.['line-color']).toBe(L.motorway);
    expect(layer(light, 'road_trunk_primary').paint?.['line-color']).toBe(L.roadMajor);
    expect(layer(light, 'tunnel_link').paint?.['line-color']).toBe(L.roadMajor);
    expect(layer(light, 'road_minor').paint?.['line-color']).toBe(L.road);
    expect(layer(light, 'road_motorway_casing').paint?.['line-color']).toBe(L.casingMajor);
    expect(layer(light, 'road_minor_casing').paint?.['line-color']).toBe(L.casing);
    expect(layer(light, 'road_path_pedestrian').paint?.['line-color']).toBe(L.path);
    expect(layer(light, 'road_major_rail').paint?.['line-color']).toBe(L.rail);
    expect(layer(light, 'tunnel_transit_rail_hatching').paint?.['line-color']).toBe(L.railTunnel);
  });

  it('hides 3D buildings, one-way arrows and busy POIs, and more in dark mode', () => {
    for (const id of ['building-3d', 'park_outline', 'road_one_way_arrow', 'road_one_way_arrow_opposite', 'poi_r20', 'poi_r7']) {
      expect(layer(light, id).layout?.visibility, id).toBe('none');
    }
    expect(layer(light, 'landcover_wetland').layout?.visibility).toBeUndefined();
    expect(layer(dark, 'landcover_wetland').layout?.visibility).toBe('none');
    expect(layer(dark, 'road_area_pattern').layout?.visibility).toBe('none');
    expect(layer(dark, 'natural_earth').layout?.visibility).toBe('none');
    expect(layer(dark, 'highway-shield-non-us').layout?.visibility).toBe('none');
    expect(layer(light, 'highway-shield-non-us').layout?.visibility).toBeUndefined();
    expect(layer(dark, 'poi_r1').paint?.['icon-opacity']).toBe(0);
    expect(layer(light, 'poi_r1').paint?.['icon-opacity']).toBe(0.7);
  });

  it('gives labels the calm colours with a halo', () => {
    expect(layer(light, 'label_city').paint).toMatchObject({ 'text-color': L.labelPlace, 'text-halo-color': L.halo, 'text-halo-width': 1.5 });
    expect(layer(dark, 'label_village').paint).toMatchObject({ 'text-color': D.labelMinor, 'text-halo-color': D.halo });
    expect(layer(light, 'highway-name-major').paint?.['text-color']).toBe(L.labelRoad);
    expect(layer(light, 'water_name_point_label').paint?.['text-color']).toBe(L.labelWater);
    expect(layer(light, 'waterway_line_label').paint?.['text-color']).toBe(L.labelWater);
  });

  it('caps the shaded relief in light mode', () => {
    const opacity = layer(light, 'natural_earth').paint?.['raster-opacity'] as unknown[];
    expect(opacity[0]).toBe('interpolate');
    expect(opacity.slice(4).filter((v, i) => i % 2 === 0)).toEqual([0.25, 0.1]);
    expect(capOpacity(0.6, 0.25)).toBe(0.25);
    expect(capOpacity(0.1, 0.25)).toBe(0.1);
  });

  it('falls back on what a renamed layer draws', () => {
    const renamed = { id: 'road_primary_new', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', paint: { 'line-color': '#fea' } };
    expect(ruleFor(renamed as unknown as LayerSpecification)?.name).toBe(FALLBACK_RULES[0].name);
    const style = { ...STYLE, layers: [renamed] } as unknown as StyleSpecification;
    expect(layer(prepareStyle(style, 'en', 'dark'), 'road_primary_new').paint?.['line-color']).toBe(D.road);
  });

  it('keeps every layer and the sources', () => {
    expect(light.layers.map((l) => l.id)).toEqual(LIBERTY.layers.map((l) => l.id));
    expect(light.sources).toBe(LIBERTY.sources);
  });

  it('matches the recorded recolour', () => {
    const summary = (style: StyleSpecification) =>
      style.layers.map((l) => {
        const loose = l as unknown as Loose;
        return { id: l.id, paint: loose.paint ?? null, visibility: loose.layout?.visibility ?? null };
      });
    expect({ light: summary(light), dark: summary(dark) }).toMatchSnapshot();
  });
});
