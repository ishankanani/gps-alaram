import type { StopKind } from '../lib/stations/text';
import type { Scheme } from './tokens';

// Transport and map colours (ui-direction-a 2.1). Plain constants with no React Native import, so
// map helpers (src/map/geo.ts) and tests can use them. Transport colours are the same in light
// and dark, so riders recognise them; white text on each reaches at least 4.5:1.

/** Colours riders know from German stations: DB red trains, green S-Bahn, blue U-Bahn. */
export const KIND_COLOR: Record<StopKind | 'place', string> = {
  train: '#E3001B',
  sbahn: '#00854A',
  ubahn: '#1565C0',
  metro: '#1565C0',
  tram: '#C9480A',
  bus: '#8E24AA',
  ferry: '#007D8A',
  other: '#546E7A',
  // An address or a dropped pin: StopWake indigo, fixed in both schemes (the dark theme's lighter
  // primary would give its white glyph only 2.7:1).
  place: '#4146D8',
};

export const KIND_ICON = {
  train: 'train',
  sbahn: 'train-variant',
  ubahn: 'subway-variant',
  metro: 'subway-variant',
  tram: 'tram',
  bus: 'bus',
  ferry: 'ferry',
  other: 'map-marker',
  place: 'map-marker',
} as const satisfies Record<StopKind | 'place', string>;

/** Fill of each badge from modeBadges() (src/lib/stations/text.ts). */
export const BADGE_COLOR: Record<string, string> = {
  ICE: '#E3001B',
  IC: '#E3001B',
  RE: '#9E1B32',
  S: '#00854A',
  Train: '#E3001B',
  U: '#1565C0',
  Metro: '#1565C0',
  Tram: '#C9480A',
  Bus: '#8E24AA',
  Ferry: '#007D8A',
};

/** Badges drawn like German station signs: S in a circle, U in a square. */
export const BADGE_SHAPE: Record<string, 'circle' | 'square'> = { S: 'circle', U: 'square' };

/** Badges whose text is a word in the user's language (i18n key); the others are names (ICE, IC, RE, S, U). */
export const BADGE_TEXT_KEY = {
  Train: 'mode.train',
  Metro: 'mode.metro',
  Tram: 'mode.tram',
  Bus: 'mode.bus',
  Ferry: 'mode.ferry',
} as const satisfies Record<string, string>;

/** What TalkBack says for a badge (i18n key), where it differs from the badge text. */
export const BADGE_SPOKEN_KEY = {
  RE: 'mode.regional',
  S: 'kind.sbahn',
  U: 'kind.ubahn',
  Train: 'mode.train',
  Metro: 'mode.metro',
  Tram: 'mode.tram',
  Bus: 'mode.bus',
  Ferry: 'mode.ferry',
} as const satisfies Record<string, string>;

/** Fallback fill for a badge that has no colour of its own. */
export const BADGE_FALLBACK = KIND_COLOR.other;

/** Base-map recolour (2.1.1) and StopWake's own map layers. */
export type MapPalette = {
  land: string;
  landuse: string;
  park: string;
  water: string;
  building: string;
  buildingLine: string;
  road: string;
  roadMajor: string;
  motorway: string;
  casing: string;
  casingMajor: string;
  rail: string;
  railTunnel: string;
  path: string;
  boundary: string;
  labelPlace: string;
  labelMinor: string;
  labelRoad: string;
  labelWater: string;
  halo: string;
  stopStroke: string;
  stopStrokeWidth: number;
  stopLabelMajor: string;
  stopLabelMid: string;
  stopLabelMinor: string;
  zoneFill: string;
  /** 3.4:1 on land. */
  zoneLine: string;
  trail: string;
  trailOpacity: number;
  /** The dotted line from you to the stop. */
  ahead: string;
  aheadOpacity: number;
  /** Before tiles load (and the first launch offline). */
  placeholder: string;
  /** Your position on the trip map: indigo in both schemes. */
  puck: string;
};

export const MAP_COLORS: Record<Scheme, MapPalette> = {
  light: {
    land: '#F2F3F5',
    landuse: '#ECEEF1',
    park: '#DCEBD8',
    water: '#C4DCF4',
    building: '#E2E5EA',
    buildingLine: '#D5D9E0',
    road: '#FFFFFF',
    roadMajor: '#FFFFFF',
    motorway: '#FFFFFF',
    casing: '#D9DDE3',
    casingMajor: '#C8CED7',
    rail: '#9AA2AE',
    railTunnel: '#C3C9D2',
    path: '#FFFFFF',
    boundary: '#A3A9B3',
    labelPlace: '#27303F',
    labelMinor: '#556070',
    labelRoad: '#6B7480',
    labelWater: '#4E74A0',
    halo: '#FFFFFF',
    stopStroke: '#FFFFFF',
    stopStrokeWidth: 2,
    stopLabelMajor: '#111827',
    stopLabelMid: '#263041',
    stopLabelMinor: '#3A4556',
    zoneFill: 'rgba(255,176,32,0.16)',
    zoneLine: '#B87400',
    trail: '#4146D8',
    trailOpacity: 0.85,
    ahead: '#646F82',
    aheadOpacity: 0.9,
    placeholder: '#EEF0F3',
    puck: '#4146D8',
  },
  dark: {
    land: '#121821',
    landuse: '#151C26',
    park: '#15251D',
    water: '#0D2136',
    building: '#1B2230',
    buildingLine: '#232B38',
    road: '#222A36',
    roadMajor: '#2A3342',
    motorway: '#333D4F',
    casing: '#0F141C',
    casingMajor: '#0B1017',
    rail: '#4A5466',
    railTunnel: '#343C4C',
    path: '#252E3C',
    boundary: '#4A5568',
    labelPlace: '#D6DCE5',
    labelMinor: '#A3AEBD',
    labelRoad: '#8A95A5',
    labelWater: '#6F93BC',
    halo: '#0E131A',
    stopStroke: '#E8ECF2',
    stopStrokeWidth: 1.5,
    stopLabelMajor: '#F1F4F8',
    stopLabelMid: '#D5DCE6',
    stopLabelMinor: '#B8C2CF',
    zoneFill: 'rgba(255,181,71,0.20)',
    zoneLine: '#FFB547',
    trail: '#8E94FF',
    trailOpacity: 0.9,
    ahead: '#8C97A9',
    aheadOpacity: 0.7,
    placeholder: '#121821',
    puck: '#4146D8',
  },
};

/** Admin charts. No status colours: every chart also has a legend with numbers. */
export type ChartPalette = {
  free: string;
  monthly: string;
  yearly: string;
  lifetime: string;
  store: string;
  gift: string;
  code: string;
  guests: string;
  accounts: string;
};

export const CHART_COLORS: Record<Scheme, ChartPalette> = {
  light: {
    free: '#A3ADBB',
    monthly: '#A5A8F0',
    yearly: '#4146D8',
    lifetime: '#FFB020',
    store: '#4146D8',
    gift: '#9C5BC9',
    code: '#2C8EA3',
    guests: '#A5A8F0',
    accounts: '#4146D8',
  },
  dark: {
    free: '#566274',
    monthly: '#4F55B8',
    yearly: '#8E94FF',
    lifetime: '#FFB547',
    store: '#8E94FF',
    gift: '#C49BEA',
    code: '#5FC1D6',
    guests: '#4F55B8',
    accounts: '#8E94FF',
  },
};
