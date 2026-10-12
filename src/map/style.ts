import type {
  ExpressionSpecification,
  FilterSpecification,
  LayerSpecification,
  StyleSpecification,
  SymbolLayerSpecification,
} from '@maplibre/maplibre-gl-style-spec';

import type { Lang } from '../i18n';
import { MAP_COLORS, type MapPalette } from '../ui/colors';
import type { Scheme } from '../ui/tokens';

// The base map for StopWake (ui-direction-a 2.1.1): the OpenFreeMap Liberty style, recoloured into
// a calm map where only the stops and the trip carry colour. Only paint, layout.visibility and
// filters change, so offline packs and the tile cache keep working with the same style URL. Pure,
// so it is tested against a pinned copy of Liberty (src/map/__tests__/fixtures/liberty.json).

/**
 * Place names as they are written locally ("München", not "Munich"), the same way as the stop
 * names, station signs and announcements. The OpenFreeMap styles prefer English names.
 */
const LOCAL_NAME: ExpressionSpecification = ['coalesce', ['get', 'name'], ['get', 'name:latin'], ['get', 'name_en']];

/** The map data's name key per language, where it differs from the app's code. */
const MAP_LANGUAGE: Partial<Record<Lang, string>> = { nb: 'no' };

/**
 * Country names in the app's language: "Schweiz" or "Switzerland" rather than the local
 * "Schweiz/Suisse/Svizzera/Svizra". Hindi gets English, because the map cannot shape Devanagari.
 */
export function countryName(lang: Lang): ExpressionSpecification {
  const english: ExpressionSpecification = ['coalesce', ['get', 'name:en'], ['get', 'name_en'], ['get', 'name']];
  if (lang === 'en' || lang === 'hi') return english;
  const key = MAP_LANGUAGE[lang] ?? lang;
  return ['coalesce', ['get', `name:${key}`], ['get', `name_${key}`], ['get', 'name:en'], ['get', 'name_en'], ['get', 'name']];
}

/** Bus and rail stations are drawn by our own stops layer, which can be tapped. Keep airports. */
const AIRPORTS_ONLY: FilterSpecification = ['==', ['get', 'class'], 'airport'];

type Layer = LayerSpecification;
type Apply = (layer: Layer, p: MapPalette, scheme: Scheme) => Layer;

/** A recolour rule: which Liberty layers it matches and what it changes. */
export type RecolourRule = { name: string; test: (layer: Layer) => boolean; apply: Apply };

function withPaint(layer: Layer, paint: Record<string, unknown>): Layer {
  return { ...layer, paint: { ...(layer as { paint?: object }).paint, ...paint } } as Layer;
}

function withLayout(layer: Layer, layout: Record<string, unknown>): Layer {
  return { ...layer, layout: { ...(layer as { layout?: object }).layout, ...layout } } as Layer;
}

function hide(layer: Layer): Layer {
  return withLayout(layer, { visibility: 'none' });
}

function sourceLayer(layer: Layer): string | undefined {
  return (layer as { 'source-layer'?: string })['source-layer'];
}

/** A number, or an interpolate expression of numbers, with every output at most `max`. */
export function capOpacity(value: unknown, max: number): unknown {
  if (typeof value === 'number') return Math.min(value, max);
  if (Array.isArray(value) && value[0] === 'interpolate') {
    // ['interpolate', interpolation, input, stop1, out1, stop2, out2, ...]
    return value.map((v, i) => (i >= 4 && (i - 4) % 2 === 0 && typeof v === 'number' ? Math.min(v, max) : v));
  }
  return max;
}

const label = (color: keyof MapPalette): Apply => (layer, p) =>
  withPaint(layer, { 'text-color': p[color], 'text-halo-color': p.halo, 'text-halo-width': 1.5 });

const lineColor = (pick: (layer: Layer, p: MapPalette) => string): Apply => (layer, p) =>
  withPaint(layer, { 'line-color': pick(layer, p) });

const fillColor = (color: keyof MapPalette, outline = false): Apply => (layer, p) =>
  withPaint(layer, outline ? { 'fill-color': p[color], 'fill-outline-color': p[color] } : { 'fill-color': p[color] });

const ids = (...list: string[]) => {
  const set = new Set(list);
  return (layer: Layer) => set.has(layer.id);
};

const isLine = (layer: Layer) => layer.type === 'line';
const MAJOR_CASING = /motorway|trunk_primary|secondary_tertiary|link/;

/** The rules of ui-direction-a 2.1.1, in order: the first rule that matches a layer applies. */
export const RECOLOUR_RULES: readonly RecolourRule[] = [
  { name: 'background', test: ids('background'), apply: (l, p) => withPaint(l, { 'background-color': p.land }) },
  {
    name: 'natural earth',
    test: ids('natural_earth'),
    apply: (l, _p, scheme) =>
      scheme === 'dark'
        ? hide(l)
        : withPaint(l, { 'raster-opacity': capOpacity((l as { paint?: Record<string, unknown> }).paint?.['raster-opacity'], 0.25) }),
  },
  {
    name: 'hidden',
    test: (l) => ['building-3d', 'park_outline', 'poi_r20', 'poi_r7'].includes(l.id) || l.id.startsWith('road_one_way_arrow'),
    apply: hide,
  },
  {
    name: 'hidden in dark',
    test: ids('landcover_wetland', 'road_area_pattern'),
    apply: (l, _p, scheme) => (scheme === 'dark' ? hide(l) : l),
  },
  {
    name: 'park',
    test: ids('park', 'landcover_wood', 'landcover_grass', 'landuse_pitch', 'landuse_track', 'landuse_cemetery'),
    apply: (l, p) => {
      const next = withPaint(l, { 'fill-color': p.park, 'fill-outline-color': p.park });
      return l.id === 'landcover_wood' || l.id === 'landcover_grass' ? withPaint(next, { 'fill-opacity': 0.6 }) : next;
    },
  },
  {
    name: 'landuse',
    test: ids('landuse_residential', 'landuse_hospital', 'landuse_school', 'landcover_sand', 'landcover_ice', 'aeroway_fill'),
    apply: fillColor('landuse'),
  },
  { name: 'water', test: ids('water'), apply: fillColor('water') },
  { name: 'waterways', test: (l) => isLine(l) && l.id.startsWith('waterway_'), apply: lineColor((_l, p) => p.water) },
  {
    name: 'building',
    test: ids('building'),
    apply: (l, p) => withPaint(l, { 'fill-color': p.building, 'fill-outline-color': p.buildingLine }),
  },
  {
    name: 'casings',
    test: (l) => isLine(l) && l.id.endsWith('_casing'),
    apply: lineColor((l, p) => (MAJOR_CASING.test(l.id) ? p.casingMajor : p.casing)),
  },
  { name: 'motorways', test: (l) => isLine(l) && /_motorway(_link)?$/.test(l.id), apply: lineColor((_l, p) => p.motorway) },
  {
    name: 'major roads',
    test: (l) => isLine(l) && /_(trunk_primary|secondary_tertiary|link)$/.test(l.id),
    apply: lineColor((_l, p) => p.roadMajor),
  },
  {
    name: 'roads',
    test: (l) => isLine(l) && (/_(minor|street|service_track)$/.test(l.id) || l.id === 'aeroway_runway' || l.id === 'aeroway_taxiway'),
    apply: lineColor((_l, p) => p.road),
  },
  { name: 'paths', test: (l) => isLine(l) && /_path_pedestrian$/.test(l.id), apply: lineColor((_l, p) => p.path) },
  {
    name: 'rail',
    test: (l) => isLine(l) && /_(major_rail|transit_rail)/.test(l.id),
    apply: lineColor((l, p) => (l.id.startsWith('tunnel_') ? p.railTunnel : p.rail)),
  },
  { name: 'boundaries', test: (l) => isLine(l) && l.id.startsWith('boundary_'), apply: lineColor((_l, p) => p.boundary) },
  {
    name: 'place labels',
    test: (l) => /^label_city/.test(l.id) || l.id === 'label_town' || l.id === 'label_state' || /^label_country_/.test(l.id),
    apply: label('labelPlace'),
  },
  {
    name: 'minor labels',
    test: ids('label_village', 'label_other', 'poi_r1', 'airport', 'poi_transit'),
    apply: (l, p, scheme) => {
      const next = label('labelMinor')(l, p, scheme);
      if (l.id === 'label_village' || l.id === 'label_other') return next;
      // POI icons were drawn for a light map: quieter in light, gone in dark (their labels stay).
      return withPaint(next, { 'icon-opacity': scheme === 'dark' ? 0 : 0.7 });
    },
  },
  { name: 'road names', test: (l) => l.id.startsWith('highway-name-'), apply: label('labelRoad') },
  {
    name: 'water names',
    test: (l) => l.id.startsWith('water_name_') || l.id === 'waterway_line_label',
    apply: label('labelWater'),
  },
  {
    name: 'road shields',
    test: (l) => l.id.startsWith('highway-shield') || l.id === 'road_shield_us',
    // The white shields glare on the dark map.
    apply: (l, _p, scheme) => (scheme === 'dark' ? hide(l) : l),
  },
];

/**
 * Fallbacks for layers no rule names, keyed on what they draw. OpenFreeMap updates its live style;
 * a renamed layer then stays calm instead of reverting to yellow roads.
 */
export const FALLBACK_RULES: readonly RecolourRule[] = [
  { name: 'other transportation lines', test: (l) => isLine(l) && sourceLayer(l) === 'transportation', apply: lineColor((_l, p) => p.road) },
  { name: 'other waterways', test: (l) => isLine(l) && sourceLayer(l) === 'waterway', apply: lineColor((_l, p) => p.water) },
  { name: 'other boundaries', test: (l) => isLine(l) && sourceLayer(l) === 'boundary', apply: lineColor((_l, p) => p.boundary) },
  { name: 'other parks', test: (l) => l.type === 'fill' && sourceLayer(l) === 'park', apply: fillColor('park', true) },
  {
    name: 'other land',
    test: (l) => l.type === 'fill' && (sourceLayer(l) === 'landcover' || sourceLayer(l) === 'landuse' || sourceLayer(l) === 'aeroway'),
    apply: fillColor('landuse'),
  },
  { name: 'other water', test: (l) => l.type === 'fill' && sourceLayer(l) === 'water', apply: fillColor('water') },
  { name: 'other buildings', test: (l) => l.type === 'fill' && sourceLayer(l) === 'building', apply: fillColor('building') },
  { name: 'other 3D', test: (l) => l.type === 'fill-extrusion', apply: hide },
];

/** The rule that recolours a layer (a 2.1.1 rule, else a fallback), or null when it stays as it is. */
export function ruleFor(layer: Layer): RecolourRule | null {
  return RECOLOUR_RULES.find((r) => r.test(layer)) ?? FALLBACK_RULES.find((r) => r.test(layer)) ?? null;
}

function localNames(layer: Layer, lang: Lang): Layer {
  if (layer.type !== 'symbol') return layer;
  let next: SymbolLayerSpecification = layer;
  if (layer.id === 'poi_transit') next = { ...next, filter: AIRPORTS_ONLY };
  const field = layer.layout?.['text-field'];
  if (field != null && JSON.stringify(field).includes('name')) {
    const name = layer.id.startsWith('label_country') ? countryName(lang) : LOCAL_NAME;
    next = { ...next, layout: { ...next.layout, 'text-field': name } };
  }
  return next;
}

/**
 * The base map adjusted for the app: the calm recolour for the colour scheme, local place names,
 * country names in the app's language and no duplicate station labels (our stops layer has them).
 * Layers no rule matches are returned unchanged (the same object).
 */
export function prepareStyle(style: StyleSpecification, lang: Lang, scheme: Scheme = 'light'): StyleSpecification {
  const palette = MAP_COLORS[scheme];
  return {
    ...style,
    layers: style.layers.map((layer) => {
      const rule = ruleFor(layer);
      const recoloured = rule ? rule.apply(layer, palette, scheme) : layer;
      return localNames(recoloured, lang);
    }),
  };
}
