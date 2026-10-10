/**
 * Remote config (spec 2.5, 7.5): the public, cacheable config the app merges over its built-in
 * defaults. Built per (country, lang, version), cached in memory (500 entries), and cleared on any
 * settings or prices write (config generation) or when an announcement window opens or closes.
 */
import type { Announcement, ApiLang, RemoteConfig } from '../../../src/api/types.ts';
import type { Config } from '../config.ts';
import type { Db } from '../db/database.ts';
import { isApiLang } from '../http/request.ts';
import { etagFor } from '../http/response.ts';
import { compareVersions, isVersion } from '../http/validate.ts';
import { resolveCountryPrice } from './prices.ts';
import { configGeneration, getSettings, type Settings } from './settings.ts';

export type ConfigQuery = { country: string; lang: ApiLang; version: string | null };

/** Every parameter is optional; invalid values count as absent (this endpoint never returns 400). */
export function parseConfigQuery(q: URLSearchParams): ConfigQuery {
  const country = q.get('country');
  const lang = q.get('lang');
  const version = q.get('version');
  return {
    country: country && /^[A-Za-z]{2}$/.test(country) ? country.toUpperCase() : 'DEFAULT',
    lang: isApiLang(lang) ? lang : 'en',
    version: isVersion(version) ? version : null,
  };
}

/**
 * The announcement the app should show: enabled, startsAt ≤ now < endsAt, country listed (or no
 * list), minAppVersion ≤ version ≤ maxAppVersion when a version is given. Text: texts[lang] ?? texts.en.
 */
export function visibleAnnouncement(a: Settings['announcement'], q: ConfigQuery, now: number): Announcement | null {
  if (!a || !a.enabled) return null;
  if (a.startsAt && now < Date.parse(a.startsAt)) return null;
  if (a.endsAt && now >= Date.parse(a.endsAt)) return null;
  if (a.countries && !a.countries.includes(q.country)) return null;
  if (q.version) {
    if (a.minAppVersion && compareVersions(q.version, a.minAppVersion) < 0) return null;
    if (a.maxAppVersion && compareVersions(q.version, a.maxAppVersion) > 0) return null;
  }
  const text = a.texts[q.lang] ?? a.texts.en;
  return { id: a.id, level: a.level, title: text.title ?? null, body: text.body, url: a.url, dismissible: a.dismissible };
}

/** The next time the announcement's visibility changes by itself (a window bound in the future). */
function nextBoundary(a: Settings['announcement'], now: number): number {
  let next = Infinity;
  for (const bound of [a?.startsAt, a?.endsAt]) {
    const t = bound ? Date.parse(bound) : NaN;
    if (Number.isFinite(t) && t > now) next = Math.min(next, t);
  }
  return next;
}

type ConfigEnv = Pick<Config, 'supportEmail' | 'publicUrl' | 'mailMode' | 'appPackage'>;

export type BuiltConfig = { body: string; etag: string; config: RemoteConfig; validUntil: number };

export function buildRemoteConfig(db: Db, env: ConfigEnv, q: ConfigQuery, now: number): BuiltConfig {
  const s = getSettings(db, env);
  const prices = resolveCountryPrice(db, q.country);
  const content: Omit<RemoteConfig, 'configVersion'> = {
    country: q.country,
    prices,
    trialDays: prices.trialDays ?? s['pricing.trialDays'],
    limits: { freeFavourites: s['limits.freeFavourites'] },
    proFeatures: { ...s['pro.features'] },
    features: { redeemCodes: s['promo.redeemEnabled'] },
    announcement: visibleAnnouncement(s.announcement, q, now),
    support: { email: s['support.email'] },
    links: { privacy: s['links.privacy'], terms: s['links.terms'], accountDeletion: `${env.publicUrl}/account-deletion` },
    app: {
      minVersion: s['app.minVersion'],
      latestVersion: s['app.latestVersion'],
      updateUrl: `https://play.google.com/store/apps/details?id=${env.appPackage}`,
    },
    auth: { signUpEnabled: s['auth.signUpEnabled'], passwordReset: env.mailMode === 'smtp' || env.mailMode === 'log' },
    planCacheDays: s['plan.cacheDays'],
  };
  // configVersion is the ETag without quotes; it is part of the body, so it hashes everything else.
  const etag = etagFor(JSON.stringify(content));
  const config: RemoteConfig = { configVersion: etag.slice(1, -1), ...content };
  return { body: JSON.stringify(config), etag, config, validUntil: nextBoundary(s.announcement, now) };
}

export type ConfigCache = {
  get(db: Db, env: ConfigEnv, q: ConfigQuery, now: number): BuiltConfig;
  clear(): void;
  size(): number;
};

export function createConfigCache(maxEntries = 500): ConfigCache {
  const entries = new Map<string, BuiltConfig>();
  let generation = -1;
  return {
    get(db, env, q, now) {
      const gen = configGeneration(db);
      if (gen !== generation) {
        entries.clear();
        generation = gen;
      }
      const key = `${q.country}|${q.lang}|${q.version ?? ''}`;
      const hit = entries.get(key);
      if (hit && now < hit.validUntil) return hit;
      const built = buildRemoteConfig(db, env, q, now);
      entries.delete(key);
      if (entries.size >= maxEntries) {
        const oldest = entries.keys().next().value;
        if (oldest !== undefined) entries.delete(oldest);
      }
      entries.set(key, built);
      return built;
    },
    clear: () => entries.clear(),
    size: () => entries.size,
  };
}
