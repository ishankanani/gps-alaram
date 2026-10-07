import type { ExpressionSpecification, FilterSpecification, StyleSpecification } from '@maplibre/maplibre-gl-style-spec';

import type { Lang } from '../i18n';

/**
 * Place names as they are written locally ("München", not "Munich"), the same way as the stop
 * names, station signs and announcements. The OpenFreeMap styles prefer English names.
 */
const LOCAL_NAME: ExpressionSpecification = ['coalesce', ['get', 'name'], ['get', 'name:latin'], ['get', 'name_en']];

/**
 * Country names in the app's language: "Schweiz" or "Switzerland" rather than the local
 * "Schweiz/Suisse/Svizzera/Svizra". Hindi gets English, because the map cannot shape Devanagari.
 */
function countryName(lang: Lang): ExpressionSpecification {
  return lang === 'de'
    ? ['coalesce', ['get', 'name:de'], ['get', 'name_de'], ['get', 'name']]
    : ['coalesce', ['get', 'name:en'], ['get', 'name_en'], ['get', 'name']];
}

/** Bus and rail stations are drawn by our own stops layer, which can be tapped. Keep airports. */
const AIRPORTS_ONLY: FilterSpecification = ['==', ['get', 'class'], 'airport'];

/** The base map adjusted for the app: local place names and no duplicate station labels. */
export function prepareStyle(style: StyleSpecification, lang: Lang): StyleSpecification {
  return {
    ...style,
    layers: style.layers.map((layer) => {
      if (layer.type !== 'symbol') return layer;
      let next = layer;
      if (layer.id === 'poi_transit') next = { ...next, filter: AIRPORTS_ONLY };
      const field = layer.layout?.['text-field'];
      if (field != null && JSON.stringify(field).includes('name')) {
        const name = layer.id.startsWith('label_country') ? countryName(lang) : LOCAL_NAME;
        next = { ...next, layout: { ...layer.layout, 'text-field': name } };
      }
      return next;
    }),
  };
}
