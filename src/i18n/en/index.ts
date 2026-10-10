import { core } from './core';

/**
 * English strings: the keys here define the full set every other language must provide. Each
 * feature area keeps its strings in its own file in this folder; add new areas to the spread.
 */
export const en = {
  ...core,
};

export type Strings = Record<keyof typeof en, string>;
