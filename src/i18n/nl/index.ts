import type { Strings } from '../en';
import { core } from './core';

/** Missing keys fall back to English at runtime; the dictionaries test requires every key. */
export const nl: Partial<Strings> = {
  ...core,
};
