import type { StopKind } from '../lib/stations/text';

// Plain constants, no React Native imports, so map helpers and tests can use them.

/** Colours riders know from German stations: DB red trains, green S-Bahn, blue U-Bahn. */
export const KIND_COLOR: Record<StopKind | 'place', string> = {
  train: '#E3001B',
  sbahn: '#008D4F',
  ubahn: '#1565C0',
  tram: '#E8590C',
  bus: '#8E24AA',
  ferry: '#0097A7',
  other: '#607D8B',
  place: '#3352FF',
};

export const KIND_ICON = {
  train: 'train',
  sbahn: 'train-variant',
  ubahn: 'subway-variant',
  tram: 'tram',
  bus: 'bus',
  ferry: 'ferry',
  other: 'map-marker',
  place: 'map-marker',
} as const satisfies Record<StopKind | 'place', string>;

export const BADGE_COLOR: Record<string, string> = {
  ICE: '#E3001B',
  IC: '#E3001B',
  RE: '#9E1B32',
  S: '#008D4F',
  U: '#1565C0',
  Tram: '#E8590C',
  Bus: '#8E24AA',
  Ferry: '#0097A7',
};
