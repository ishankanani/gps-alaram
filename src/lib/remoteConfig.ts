/**
 * Remote config, pure part (backend-spec 7.5): the built-in defaults and a merge that validates
 * every field with the server's ranges. Built-in < cached file < fresh answer; a field that is
 * missing, unknown or out of range keeps the value it had. Config can never touch the alarm.
 */
import type { Announcement, ProFeature, RemoteConfig } from '../api/types';
import { resolvePrice, type PriceFormat, type PriceRow } from './pricing';
import { FREE_FAVOURITES, TRIAL_DAYS } from './plans';

export const PRO_FEATURES: readonly ProFeature[] = ['heavyAlarm', 'unlimitedFavourites', 'offlineMap'];

/** The defaults before the first fetch (and in builds without a server). */
export function defaultConfig(region?: string | null): RemoteConfig {
  const prices = resolvePrice(region);
  return {
    configVersion: 'builtin',
    country: normalCountry(region) ?? 'DEFAULT',
    prices,
    trialDays: prices.trialDays ?? TRIAL_DAYS,
    limits: { freeFavourites: FREE_FAVOURITES },
    proFeatures: { heavyAlarm: true, unlimitedFavourites: true, offlineMap: true },
    features: { redeemCodes: true },
    announcement: null,
    support: { email: '' },
    links: { privacy: '', terms: '', accountDeletion: '' },
    app: { minVersion: '0.0.0', latestVersion: '0.0.0', updateUrl: '' },
    auth: { signUpEnabled: true, passwordReset: true },
    planCacheDays: 30,
  };
}

/** The defaults for no particular region (DEFAULT prices). */
export const DEFAULT_CONFIG: RemoteConfig = defaultConfig(null);

// ---- Validators ----

type Rec = Record<string, unknown>;
const isRecord = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max;
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const isString = (v: unknown, min: number, max: number): v is string => typeof v === 'string' && v.length >= min && v.length <= max;

const VERSION_RE = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;

function normalCountry(region: string | null | undefined): string | null {
  return region && /^[A-Za-z]{2}$/.test(region) ? region.toUpperCase() : null;
}

/** http(s) URLs up to 300 characters (a local server's links are http). */
export function isWebUrl(v: unknown, httpsOnly = false): v is string {
  if (!isString(v, 8, 300)) return false;
  if (!(httpsOnly ? /^https:\/\/[^\s]+$/ : /^https?:\/\/[^\s]+$/).test(v)) return false;
  try {
    new URL(v);
    return true;
  } catch {
    return false;
  }
}

export function isVersion(v: unknown): v is string {
  return typeof v === 'string' && VERSION_RE.test(v);
}

function validFormat(v: unknown): v is PriceFormat {
  if (!isRecord(v)) return false;
  return (
    isString(v.symbol, 1, 8) &&
    (v.position === 'before' || v.position === 'after') &&
    isBool(v.space) &&
    (v.decimal === '.' || v.decimal === ',') &&
    isString(v.group, 0, 2) &&
    (v.decimals === 0 || v.decimals === 2) &&
    isBool(v.trimWhole) &&
    (v.grouping === 'standard' || v.grouping === 'indian') &&
    isBool(v.wordSymbol)
  );
}

/** A complete, sane price row (prices in minor units, 1 to 10⁹). */
export function validPriceRow(v: unknown): v is PriceRow {
  if (!isRecord(v)) return false;
  return (
    isString(v.country, 2, 7) &&
    /^([A-Z]{2}|EU|DEFAULT)$/.test(v.country) &&
    typeof v.currency === 'string' &&
    /^[A-Z]{3}$/.test(v.currency) &&
    isInt(v.monthly, 1, 1e9) &&
    isInt(v.yearly, 1, 1e9) &&
    isInt(v.lifetime, 1, 1e9) &&
    (v.trialDays === null || isInt(v.trialDays, 0, 30)) &&
    validFormat(v.format)
  );
}

const LEVELS: readonly Announcement['level'][] = ['info', 'success', 'warning', 'critical'];

function validAnnouncement(v: unknown): v is Announcement {
  if (!isRecord(v)) return false;
  return (
    typeof v.id === 'string' &&
    /^[a-z0-9-]{1,64}$/.test(v.id) &&
    LEVELS.includes(v.level as Announcement['level']) &&
    (v.title === null || isString(v.title, 1, 60)) &&
    isString(v.body, 1, 280) &&
    (v.url === null || isWebUrl(v.url, true)) &&
    isBool(v.dismissible)
  );
}

function pick<T>(incoming: unknown, previous: T, valid: (v: unknown) => boolean): T {
  return valid(incoming) ? (incoming as T) : previous;
}

/**
 * `base` with every valid field of `input` applied. Never throws: anything that is not an object
 * leaves `base` as it is.
 */
export function mergeConfig(base: RemoteConfig, input: unknown): RemoteConfig {
  if (!isRecord(input)) return base;
  const limits = isRecord(input.limits) ? input.limits : {};
  const proFeatures = isRecord(input.proFeatures) ? input.proFeatures : {};
  const features = isRecord(input.features) ? input.features : {};
  const support = isRecord(input.support) ? input.support : {};
  const links = isRecord(input.links) ? input.links : {};
  const app = isRecord(input.app) ? input.app : {};
  const auth = isRecord(input.auth) ? input.auth : {};

  const nextFeatures = { ...base.proFeatures };
  for (const key of PRO_FEATURES) nextFeatures[key] = pick(proFeatures[key], base.proFeatures[key], isBool);

  return {
    configVersion: pick(input.configVersion, base.configVersion, (v) => isString(v, 1, 64)),
    country: pick(input.country, base.country, (v) => typeof v === 'string' && /^([A-Z]{2}|DEFAULT)$/.test(v)),
    prices: pick(input.prices, base.prices, validPriceRow),
    trialDays: pick(input.trialDays, base.trialDays, (v) => isInt(v, 0, 30)),
    limits: { freeFavourites: pick(limits.freeFavourites, base.limits.freeFavourites, (v) => isInt(v, 0, 100)) },
    proFeatures: nextFeatures,
    features: { redeemCodes: pick(features.redeemCodes, base.features.redeemCodes, isBool) },
    announcement: 'announcement' in input ? (input.announcement === null ? null : pick(input.announcement, base.announcement, validAnnouncement)) : base.announcement,
    support: { email: pick(support.email, base.support.email, (v) => typeof v === 'string' && v.length <= 254 && EMAIL_RE.test(v)) },
    links: {
      privacy: pick(links.privacy, base.links.privacy, (v) => isWebUrl(v)),
      terms: pick(links.terms, base.links.terms, (v) => isWebUrl(v)),
      accountDeletion: pick(links.accountDeletion, base.links.accountDeletion, (v) => isWebUrl(v)),
    },
    app: {
      minVersion: pick(app.minVersion, base.app.minVersion, isVersion),
      latestVersion: pick(app.latestVersion, base.app.latestVersion, isVersion),
      updateUrl: pick(app.updateUrl, base.app.updateUrl, (v) => isWebUrl(v, true)),
    },
    auth: {
      signUpEnabled: pick(auth.signUpEnabled, base.auth.signUpEnabled, isBool),
      passwordReset: pick(auth.passwordReset, base.auth.passwordReset, isBool),
    },
    planCacheDays: pick(input.planCacheDays, base.planCacheDays, (v) => isInt(v, 1, 90)),
  };
}

/** The cache key: a different country, language or app version means fetching again (7.3). */
export function configKey(country: string | null | undefined, lang: string, version: string): string {
  return `${normalCountry(country) ?? 'DEFAULT'}|${lang}|${version}`;
}

/** -1, 0 or 1, comparing x.y.z numerically; anything unparsable counts as 0.0.0. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => (isVersion(v) ? v.split('.').map(Number) : [0, 0, 0]);
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < 3; i++) {
    if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  }
  return 0;
}

/** Below app.minVersion: the map shows a persistent "Update StopWake" banner (6.5); alarms keep working. */
export function updateRequired(config: Pick<RemoteConfig, 'app'>, appVersion: string): boolean {
  return compareVersions(appVersion, config.app.minVersion) < 0;
}

/** A newer version than this one is out (a quiet hint, never blocking). */
export function updateAvailable(config: Pick<RemoteConfig, 'app'>, appVersion: string): boolean {
  return compareVersions(appVersion, config.app.latestVersion) < 0;
}
