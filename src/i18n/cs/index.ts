import type { Dictionary } from '../en';
import { account } from './account';
import { activity } from './activity';
import { ads } from './ads';
import { alarm } from './alarm';
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
 * Missing keys fall back to English at runtime; the dictionaries test requires every key except
 * the English-only admin area.
 */
export const cs: Dictionary = {
  ...core,
  ...ui,
  ...account,
  ...paywall,
  ...errors,
  ...map,
  ...trip,
  ...saved,
  ...activity,
  ...settings,
  ...onboarding,
  ...ads,
  ...alarm,
};
