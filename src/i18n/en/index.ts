import { account } from './account';
import { activity } from './activity';
import { alarm } from './alarm';
import { ads } from './ads';
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
  ...ads,
  ...alarm,
};

export type Strings = Record<keyof typeof en, string>;

/** Keys of the English-only admin area, which the other languages may leave out. */
export const ADMIN_KEYS: ReadonlySet<string> = new Set(Object.keys(admin));

/** The base of every key that comes in a .one and an .other form. */
export type PluralBase = {
  [K in keyof typeof en]: K extends `${infer B}.one` ? (`${B}.other` extends keyof typeof en ? B : never) : never;
}[keyof typeof en];

/** Plural forms beyond one and other (Polish and Czech "few", Arabic "zero", "two", "few", "many"). */
export type ExtraPluralKey = `${PluralBase}.${'zero' | 'two' | 'few' | 'many'}`;

/**
 * A language's strings: every key of English (the dictionaries test checks them), plus the extra
 * plural forms that language needs. Missing extra forms fall back to the .other form.
 */
export type Dictionary = Partial<Strings> & Partial<Record<ExtraPluralKey, string>>;
