import type { StyleSpecification } from '@maplibre/maplibre-gl-style-spec';
import { describe, expect, it } from 'vitest';

import { prepareStyle } from '../style';

// Layers as they appear in the OpenFreeMap "liberty" style.
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

function layer(style: StyleSpecification, id: string) {
  return style.layers.find((l) => l.id === id) as { filter?: unknown; layout?: Record<string, unknown> };
}

describe('prepareStyle', () => {
  const de = prepareStyle(STYLE, 'de');

  it('labels places with local names ("München", not "Munich")', () => {
    expect(layer(de, 'label_city').layout?.['text-field']).toEqual(LOCAL);
    expect(layer(de, 'poi_old').layout?.['text-field']).toEqual(LOCAL);
    expect(layer(prepareStyle(STYLE, 'en'), 'label_city').layout?.['text-field']).toEqual(LOCAL);
  });

  it('names countries in the app language, English for Hindi', () => {
    const inEnglish = [['get', 'name:en'], ['get', 'name_en'], ['get', 'name']];
    expect(layer(de, 'label_country_1').layout?.['text-field']).toEqual(['coalesce', ['get', 'name:de'], ['get', 'name_de'], ...inEnglish]);
    expect(layer(prepareStyle(STYLE, 'nb'), 'label_country_1').layout?.['text-field']).toEqual(['coalesce', ['get', 'name:no'], ['get', 'name_no'], ...inEnglish]);
    const english = ['coalesce', ['get', 'name:en'], ['get', 'name_en'], ['get', 'name']];
    expect(layer(prepareStyle(STYLE, 'en'), 'label_country_1').layout?.['text-field']).toEqual(english);
    expect(layer(prepareStyle(STYLE, 'hi'), 'label_country_1').layout?.['text-field']).toEqual(english);
  });

  it('leaves bus and rail stations to the stops layer but keeps airports', () => {
    expect(layer(de, 'poi_transit').filter).toEqual(['==', ['get', 'class'], 'airport']);
    expect(layer(de, 'poi_transit').layout?.['text-field']).toEqual(LOCAL);
  });

  it('keeps road numbers, other layout and other layers', () => {
    expect(layer(de, 'highway-shield-non-us').layout?.['text-field']).toEqual(['to-string', ['get', 'ref']]);
    expect(layer(de, 'label_city').layout?.['text-font']).toEqual(['Noto Sans Bold']);
    expect(de.layers[0]).toBe(STYLE.layers[0]);
    expect(de.layers).toHaveLength(STYLE.layers.length);
  });

  it('does not change the original style', () => {
    expect(layer(STYLE, 'label_city').layout?.['text-field']).toEqual(NAME_FIELD);
    expect(layer(STYLE, 'poi_transit').filter).toEqual(['match', ['get', 'class'], ['airport', 'bus', 'rail'], true, false]);
  });
});
