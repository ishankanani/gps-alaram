/**
 * The Supabase side of remote config, prices and settings. Pure (no React Native), so Vitest checks it.
 *
 * Supabase stores only what an admin changed (public.settings, public.country_prices); the app adds
 * the defaults and the built-in price rows here, exactly like server/src/domain/config.ts,
 * settings.ts and prices.ts did. The defaults must match public.setting() in the SQL.
 */
import { BUILTIN_PRICES, CURRENCY_FORMATS, EU_ALIAS, resolvePrice, type PriceFormat, type PriceRow } from '../../lib/pricing';
import { compareVersions, isVersion } from '../../lib/remoteConfig';
import type {
  AdminPriceRow,
  AdminRef,
  AdminSetting,
  Announcement,
  AnnouncementSetting,
  ApiLang,
  RemoteConfig,
  SettingKey,
} from '../types';

export const SETTING_KEYS: readonly SettingKey[] = [
  'limits.freeFavourites', 'pro.features', 'pricing.trialDays', 'announcement', 'support.email',
  'links.privacy', 'links.terms', 'app.minVersion', 'app.latestVersion', 'auth.signUpEnabled',
  'promo.redeemEnabled', 'plan.cacheDays', 'store.productPlans',
];

export const SETTING_DEFAULTS: Readonly<Record<SettingKey, unknown>> = {
  'limits.freeFavourites': 3,
  'pro.features': { heavyAlarm: true, unlimitedFavourites: true, offlineMap: true },
  'pricing.trialDays': 7,
  announcement: null,
  'support.email': '',
  'links.privacy': '',
  'links.terms': '',
  'app.minVersion': '0.0.0',
  'app.latestVersion': '0.0.0',
  'auth.signUpEnabled': true,
  'promo.redeemEnabled': true,
  'plan.cacheDays': 30,
  'store.productPlans': {},
};

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** What public.public_config() returns. */
export type PublicConfig = {
  settings: Record<string, unknown>;
  prices: PriceOverride[];
  version: string;
};

/** A row of public.country_prices as JSON (format null = the built-in or currency default). */
export type PriceOverride = Omit<PriceRow, 'format'> & {
  format: PriceFormat | null;
  updatedAt?: string | null;
  updatedBy?: AdminRef | null;
};

export function settingsWithDefaults(stored: Record<string, unknown>): Record<SettingKey, unknown> {
  const out = { ...SETTING_DEFAULTS } as Record<SettingKey, unknown>;
  for (const key of SETTING_KEYS) if (key in stored && stored[key] !== null && stored[key] !== undefined) out[key] = stored[key];
  if ('announcement' in stored) out.announcement = stored.announcement ?? null;
  return out;
}

/** The default format of a price key and currency: the built-in row's (same currency), then the currency's. */
export function defaultFormat(country: string, currency: string): PriceFormat | null {
  const builtin = BUILTIN_PRICES.find((r) => r.country === country);
  if (builtin && builtin.currency === currency) return builtin.format;
  return CURRENCY_FORMATS[currency] ?? null;
}

/** An override with its format filled in, or null when it has none and no default exists. */
export function overrideToRow(o: PriceOverride): PriceRow | null {
  const format = o.format ?? defaultFormat(o.country, o.currency);
  if (!format) return null;
  return { country: o.country, currency: o.currency, monthly: o.monthly, yearly: o.yearly, lifetime: o.lifetime, trialDays: o.trialDays ?? null, format };
}

export type ConfigQuery = { country?: string | null; lang?: string | null; version?: string | null };

const LANGS: readonly ApiLang[] = ['da', 'de', 'en', 'fi', 'fr', 'hi', 'it', 'ja', 'nb', 'nl', 'sv'];

/** The announcement for this phone, or null (server/src/domain/config.ts visibleAnnouncement). */
export function visibleAnnouncement(a: unknown, q: { country: string; lang: ApiLang; version: string | null }, now: number): Announcement | null {
  if (!isRecord(a)) return null;
  const s = a as Partial<AnnouncementSetting>;
  if (!s.enabled || !s.id || !s.texts?.en) return null;
  if (s.startsAt && now < Date.parse(s.startsAt)) return null;
  if (s.endsAt && now >= Date.parse(s.endsAt)) return null;
  if (s.countries && !s.countries.includes(q.country)) return null;
  if (q.version) {
    if (s.minAppVersion && compareVersions(q.version, s.minAppVersion) < 0) return null;
    if (s.maxAppVersion && compareVersions(q.version, s.maxAppVersion) > 0) return null;
  }
  const text = s.texts[q.lang] ?? s.texts.en;
  return {
    id: s.id,
    level: s.level ?? 'info',
    title: text.title ?? null,
    body: text.body,
    url: s.url ?? null,
    dismissible: s.dismissible ?? true,
  };
}

/** RemoteConfig from public_config() for a phone (GET /v1/config). */
export function buildRemoteConfig(input: unknown, query: ConfigQuery, now = Date.now()): RemoteConfig {
  const pc = isRecord(input) ? input : {};
  const s = settingsWithDefaults(isRecord(pc.settings) ? pc.settings : {});
  const overrides = (Array.isArray(pc.prices) ? pc.prices : [])
    .filter(isRecord)
    .map((o) => overrideToRow(o as unknown as PriceOverride))
    .filter((r): r is PriceRow => r !== null);
  const country = query.country && /^[A-Za-z]{2}$/.test(query.country) ? query.country.toUpperCase() : 'DEFAULT';
  const lang = (LANGS as readonly string[]).includes(query.lang ?? '') ? (query.lang as ApiLang) : 'en';
  const version = isVersion(query.version) ? query.version : null;
  const prices = resolvePrice(country, overrides);
  const features = isRecord(s['pro.features']) ? s['pro.features'] : {};
  return {
    configVersion: typeof pc.version === 'string' && pc.version ? `sb-${pc.version.slice(0, 32)}` : 'supabase',
    country,
    prices,
    trialDays: prices.trialDays ?? (s['pricing.trialDays'] as number),
    limits: { freeFavourites: s['limits.freeFavourites'] as number },
    proFeatures: {
      heavyAlarm: features.heavyAlarm !== false,
      unlimitedFavourites: features.unlimitedFavourites !== false,
      offlineMap: features.offlineMap !== false,
    },
    features: { redeemCodes: s['promo.redeemEnabled'] !== false },
    announcement: visibleAnnouncement(s.announcement, { country, lang, version }, now),
    support: { email: String(s['support.email'] ?? '') },
    links: { privacy: String(s['links.privacy'] ?? ''), terms: String(s['links.terms'] ?? ''), accountDeletion: '' },
    app: { minVersion: String(s['app.minVersion']), latestVersion: String(s['app.latestVersion']), updateUrl: '' },
    auth: { signUpEnabled: s['auth.signUpEnabled'] !== false, passwordReset: true },
    planCacheDays: s['plan.cacheDays'] as number,
  };
}

// ---- Admin: settings and prices with their defaults ----

type StoredSetting = { key: string; value: unknown; updatedAt: string | null; updatedBy: AdminRef | null };

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** GET /v1/admin/settings items from admin_settings() rows. */
export function adminSettingsFrom(input: unknown): { items: AdminSetting[] } {
  const rows = isRecord(input) && Array.isArray(input.items) ? (input.items as StoredSetting[]) : [];
  const byKey = new Map(rows.map((r) => [r.key, r]));
  return {
    items: SETTING_KEYS.map((key) => {
      const row = byKey.get(key);
      const overridden = row !== undefined && !same(row.value, SETTING_DEFAULTS[key]);
      return {
        key,
        value: row ? row.value : SETTING_DEFAULTS[key],
        default: SETTING_DEFAULTS[key],
        overridden,
        updatedAt: overridden ? (row?.updatedAt ?? null) : null,
        updatedBy: overridden ? (row?.updatedBy ?? null) : null,
      };
    }),
  };
}

/** GET /v1/admin/prices: built-in rows merged with the overrides, override-only rows too; EU and DEFAULT last. */
export function adminPricesFrom(input: unknown): { items: AdminPriceRow[]; defaultTrialDays: number; euAlias: string[] } {
  const rec = isRecord(input) ? input : {};
  const overrides = new Map(
    (Array.isArray(rec.items) ? rec.items : []).filter(isRecord).map((o) => [String(o.country), o as unknown as PriceOverride]),
  );
  const keys = new Set([...BUILTIN_PRICES.map((r) => r.country), ...overrides.keys()]);
  const rank = (k: string) => (k === 'EU' ? 1 : k === 'DEFAULT' ? 2 : 0);
  const items: AdminPriceRow[] = [];
  for (const key of [...keys].sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0))) {
    const builtin = BUILTIN_PRICES.find((r) => r.country === key) ?? null;
    const o = overrides.get(key);
    const row = o ? overrideToRow(o) : builtin;
    if (!row) continue;
    items.push({ ...row, builtin, overridden: !!o, updatedAt: o?.updatedAt ?? null, updatedBy: o?.updatedBy ?? null });
  }
  const trial = typeof rec.defaultTrialDays === 'number' ? rec.defaultTrialDays : (SETTING_DEFAULTS['pricing.trialDays'] as number);
  return { items, defaultTrialDays: trial, euAlias: [...EU_ALIAS] };
}

/** One saved override as an AdminPriceRow (PUT /v1/admin/prices/:country). */
export function adminPriceRowFrom(item: unknown): AdminPriceRow {
  const o = (isRecord(item) ? item : {}) as unknown as PriceOverride;
  const builtin = BUILTIN_PRICES.find((r) => r.country === o.country) ?? null;
  const row = overrideToRow(o) ?? { ...o, format: CURRENCY_FORMATS.USD! };
  return { ...row, builtin, overridden: true, updatedAt: o.updatedAt ?? null, updatedBy: o.updatedBy ?? null };
}
