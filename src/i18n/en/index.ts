import { account } from './account';
import { activity } from './activity';
import { admin } from './admin';
import { core } from './core';
import { errors } from './errors';
import { map } from './map';
import { onboarding } from './onboarding';
import { paywall } from './paywall';
import { saved } from './saved';
import { settings } from './settings';
import { trip } from './trip';
import { ui } from './ui';

/**
 * English strings: the keys here define the full set every other language must provide. Each
 * feature area keeps its strings in its own file in this folder; add new areas to the spread.
 * The admin area is English only (staff-facing): other languages fall back to English for it.
 */
export const en = {
  ...core,
  ...ui,
  ...account,
  ...paywall,
  ...errors,
  ...admin,
  ...map,
  ...trip,
  ...saved,
  ...activity,
  ...settings,
  ...onboarding,
};

export type Strings = Record<keyof typeof en, string>;

/** Keys of the English-only admin area, which the other languages may leave out. */
export const ADMIN_KEYS: ReadonlySet<string> = new Set(Object.keys(admin));
