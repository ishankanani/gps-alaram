/**
 * App settings (spec 6.5): keys, schemas, defaults, validation, read and an all-or-nothing patch.
 * The table holds only values that differ from the defaults; null (or the default value) resets a
 * key by deleting its row. Any write bumps the config generation, which clears the remote-config
 * cache (2.5).
 */
import type {
  AdminSetting, AnnouncementSetting, ApiLang, FieldError, PaidPlan, ProFeature, SettingKey,
} from '../../../src/api/types.ts';
import type { Config } from '../config.ts';
import { isoOrNull } from '../clock.ts';
import { many, run, tx, type Db } from '../db/database.ts';
import { validationFailed } from '../http/errors.ts';
import { API_LANGS } from '../http/request.ts';
import { cleanText, codePoints, compareVersions, isHttpsUrl, isVersion, normalizeEmail, parseIsoDate } from '../http/validate.ts';
import { adminRef } from './users.ts';

export const SETTING_KEYS = [
  'limits.freeFavourites', 'pro.features', 'pricing.trialDays', 'announcement', 'support.email',
  'links.privacy', 'links.terms', 'app.minVersion', 'app.latestVersion', 'auth.signUpEnabled',
  'promo.redeemEnabled', 'plan.cacheDays', 'store.productPlans',
] as const satisfies readonly SettingKey[];

export type Settings = {
  'limits.freeFavourites': number;
  'pro.features': Record<ProFeature, boolean>;
  'pricing.trialDays': number;
  announcement: AnnouncementSetting | null;
  'support.email': string;
  'links.privacy': string;
  'links.terms': string;
  'app.minVersion': string;
  'app.latestVersion': string;
  'auth.signUpEnabled': boolean;
  'promo.redeemEnabled': boolean;
  'plan.cacheDays': number;
  'store.productPlans': Record<string, PaidPlan>;
};

export const PRO_FEATURES: readonly ProFeature[] = ['heavyAlarm', 'unlimitedFavourites', 'offlineMap'];

export function settingDefaults(config: Pick<Config, 'supportEmail' | 'publicUrl'>): Settings {
  return {
    'limits.freeFavourites': 3,
    'pro.features': { heavyAlarm: true, unlimitedFavourites: true, offlineMap: true },
    'pricing.trialDays': 7,
    announcement: null,
    'support.email': config.supportEmail,
    'links.privacy': `${config.publicUrl}/privacy`,
    'links.terms': `${config.publicUrl}/terms`,
    'app.minVersion': '0.0.0',
    'app.latestVersion': '0.0.0',
    'auth.signUpEnabled': true,
    'promo.redeemEnabled': true,
    'plan.cacheDays': 30,
    'store.productPlans': {},
  };
}

type Result<T> = { ok: true; value: T } | { ok: false; error: FieldError };
const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const bad = <T>(error: FieldError = 'invalid'): Result<T> => ({ ok: false, error });

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

const int = (min: number, max: number) => (v: unknown): Result<number> => {
  if (typeof v !== 'number' || !Number.isSafeInteger(v)) return bad();
  return v < min || v > max ? bad('out_of_range') : ok(v);
};
const bool = (v: unknown): Result<boolean> => (typeof v === 'boolean' ? ok(v) : bad());
const version = (v: unknown): Result<string> => (isVersion(v) ? ok(v) : bad());
const httpsUrl = (v: unknown): Result<string> => (isHttpsUrl(v) ? ok(v) : bad());

function email(v: unknown): Result<string> {
  if (typeof v !== 'string') return bad();
  const r = normalizeEmail(v);
  return 'email' in r ? ok(r.email) : bad();
}

function proFeatures(v: unknown): Result<Record<ProFeature, boolean>> {
  if (!isObject(v)) return bad();
  const keys = Object.keys(v);
  if (keys.length !== PRO_FEATURES.length || !PRO_FEATURES.every((k) => typeof v[k] === 'boolean')) return bad();
  return ok({ heavyAlarm: v.heavyAlarm as boolean, unlimitedFavourites: v.unlimitedFavourites as boolean, offlineMap: v.offlineMap as boolean });
}

function productPlans(v: unknown): Result<Record<string, PaidPlan>> {
  if (!isObject(v)) return bad();
  const entries = Object.entries(v);
  if (entries.length > 50) return bad('out_of_range');
  const out: Record<string, PaidPlan> = {};
  for (const [key, plan] of entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const k = cleanText(key);
    if (!k || k !== key || codePoints(k) > 100) return bad();
    if (plan !== 'monthly' && plan !== 'yearly' && plan !== 'lifetime') return bad();
    out[k] = plan;
  }
  return ok(out);
}

const LEVELS = ['info', 'success', 'warning', 'critical'] as const;

/** AnnouncementSetting or null; id [a-z0-9-]{1,64}, texts.en.body 1–280 chars, titles ≤ 60. */
function announcement(v: unknown): Result<AnnouncementSetting | null> {
  if (v === null) return ok(null);
  if (!isObject(v)) return bad();
  if (typeof v.id !== 'string' || !/^[a-z0-9-]{1,64}$/.test(v.id)) return bad();
  if (typeof v.enabled !== 'boolean' || typeof v.dismissible !== 'boolean') return bad();
  if (typeof v.level !== 'string' || !(LEVELS as readonly string[]).includes(v.level)) return bad();
  if (!isObject(v.texts) || !isObject(v.texts.en)) return bad();
  const texts: Partial<Record<ApiLang, { title: string | null; body: string }>> = {};
  for (const [lang, text] of Object.entries(v.texts)) {
    if (!(API_LANGS as readonly string[]).includes(lang) || !isObject(text)) return bad();
    if (typeof text.body !== 'string') return bad();
    const body = cleanText(text.body, { multiline: true });
    if (!body || codePoints(body) > 280) return bad();
    let title: string | null = null;
    if (text.title !== undefined && text.title !== null) {
      if (typeof text.title !== 'string') return bad();
      const t = cleanText(text.title);
      if (t === null || codePoints(t) > 60) return bad();
      title = t === '' ? null : t;
    }
    texts[lang as ApiLang] = { title, body };
  }
  const nullable = <T>(x: unknown, check: (y: unknown) => y is T): T | null | undefined =>
    x === undefined || x === null ? null : check(x) ? x : undefined;
  const url = nullable(v.url, isHttpsUrl);
  if (url === undefined) return bad();
  let countries: string[] | null = null;
  if (v.countries !== undefined && v.countries !== null) {
    if (!Array.isArray(v.countries) || v.countries.length < 1 || v.countries.length > 250) return bad();
    if (!v.countries.every((c) => typeof c === 'string' && /^[A-Z]{2}$/.test(c))) return bad();
    countries = [...new Set(v.countries as string[])];
  }
  const minAppVersion = nullable(v.minAppVersion, isVersion);
  const maxAppVersion = nullable(v.maxAppVersion, isVersion);
  if (minAppVersion === undefined || maxAppVersion === undefined) return bad();
  if (minAppVersion && maxAppVersion && compareVersions(minAppVersion, maxAppVersion) > 0) return bad();
  const date = (x: unknown): string | null | undefined => {
    if (x === undefined || x === null) return null;
    const t = typeof x === 'string' ? parseIsoDate(x) : null;
    return t === null ? undefined : new Date(t).toISOString();
  };
  const startsAt = date(v.startsAt);
  const endsAt = date(v.endsAt);
  if (startsAt === undefined || endsAt === undefined) return bad();
  if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) return bad();
  return ok({
    id: v.id,
    enabled: v.enabled,
    level: v.level as AnnouncementSetting['level'],
    texts: texts as AnnouncementSetting['texts'],
    url,
    countries,
    minAppVersion,
    maxAppVersion,
    startsAt,
    endsAt,
    dismissible: v.dismissible,
  });
}

const VALIDATORS: { [K in SettingKey]: (v: unknown) => Result<Settings[K]> } = {
  'limits.freeFavourites': int(0, 100),
  'pro.features': proFeatures,
  'pricing.trialDays': int(0, 30),
  announcement,
  'support.email': email,
  'links.privacy': httpsUrl,
  'links.terms': httpsUrl,
  'app.minVersion': version,
  'app.latestVersion': version,
  'auth.signUpEnabled': bool,
  'promo.redeemEnabled': bool,
  'plan.cacheDays': int(1, 90),
  'store.productPlans': productPlans,
};

export const isSettingKey = (k: string): k is SettingKey => (SETTING_KEYS as readonly string[]).includes(k);

export function validateSetting<K extends SettingKey>(key: K, value: unknown): Result<Settings[K]> {
  return VALIDATORS[key](value);
}

// ---- Config generation: bumped on every settings or prices write (clears the config cache) ----

const generations = new WeakMap<Db, number>();
export const configGeneration = (db: Db): number => generations.get(db) ?? 0;
export const bumpConfigGeneration = (db: Db): void => {
  generations.set(db, configGeneration(db) + 1);
};

type SettingRow = { key: string; value: string; updated_at: number; updated_by: string | null };

function storedRows(db: Db): Map<SettingKey, SettingRow> {
  const rows = new Map<SettingKey, SettingRow>();
  for (const r of many<SettingRow>(db, 'SELECT key, value, updated_at, updated_by FROM settings')) {
    if (isSettingKey(r.key)) rows.set(r.key, r);
  }
  return rows;
}

function parseStored<K extends SettingKey>(key: K, row: SettingRow | undefined): Settings[K] | undefined {
  if (!row) return undefined;
  try {
    const r = validateSetting(key, JSON.parse(row.value));
    return r.ok ? r.value : undefined;
  } catch {
    return undefined;
  }
}

/** All settings: stored overrides over the defaults (an unreadable stored value falls back to the default). */
export function getSettings(db: Db, config: Pick<Config, 'supportEmail' | 'publicUrl'>): Settings {
  const out = settingDefaults(config);
  const rows = storedRows(db);
  const target = out as Record<SettingKey, unknown>;
  for (const key of SETTING_KEYS) {
    const v = parseStored(key, rows.get(key));
    if (v !== undefined) target[key] = v;
  }
  return out;
}

export const getSetting = <K extends SettingKey>(db: Db, config: Pick<Config, 'supportEmail' | 'publicUrl'>, key: K): Settings[K] =>
  getSettings(db, config)[key];

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Audit form of a value: announcement texts are summarized as { id, enabled }. */
export function auditValue(key: SettingKey, value: unknown): unknown {
  if (key === 'announcement' && isObject(value)) return { id: value.id, enabled: value.enabled };
  return value;
}

export type SettingsPatch = { keys: SettingKey[]; before: Record<string, unknown>; after: Record<string, unknown> };

/**
 * PATCH /v1/admin/settings: `{ values: { key: value | null } }`. Unknown keys get
 * fields[key] = 'unknown_key', invalid values 'invalid' or 'out_of_range'. All or nothing.
 * Returns the audit payload { keys, before, after } (announcement summarized).
 */
export function patchSettings(
  db: Db,
  config: Pick<Config, 'supportEmail' | 'publicUrl'>,
  values: unknown,
  meta: { by: string | null; now: number },
): SettingsPatch {
  if (!isObject(values) || Object.keys(values).length === 0) throw validationFailed({ values: 'invalid' });
  const fields: Record<string, FieldError> = {};
  const updates: Array<{ key: SettingKey; value: unknown }> = [];
  for (const [key, raw] of Object.entries(values)) {
    if (!isSettingKey(key)) {
      fields[key] = 'unknown_key';
      continue;
    }
    if (raw === null) {
      updates.push({ key, value: null });
      continue;
    }
    const r = validateSetting(key, raw);
    if (!r.ok) fields[key] = r.error;
    else updates.push({ key, value: r.value });
  }
  if (Object.keys(fields).length > 0) throw validationFailed(fields);

  return tx(db, () => {
    const before = getSettings(db, config);
    const defaults = settingDefaults(config);
    for (const { key, value } of updates) {
      if (value === null || same(value, defaults[key])) {
        run(db, 'DELETE FROM settings WHERE key = ?', key);
      } else {
        run(
          db,
          `INSERT INTO settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)
           ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
          key, JSON.stringify(value), meta.now, meta.by,
        );
      }
    }
    bumpConfigGeneration(db);
    const after = getSettings(db, config);
    const keys = updates.map((u) => u.key);
    const pick = (s: Settings): Record<string, unknown> =>
      Object.fromEntries(keys.map((k) => [k, auditValue(k, s[k])]));
    return { keys, before: pick(before), after: pick(after) };
  });
}

/** GET /v1/admin/settings items. */
export function listAdminSettings(db: Db, config: Pick<Config, 'supportEmail' | 'publicUrl'>): AdminSetting[] {
  const defaults = settingDefaults(config);
  const current = getSettings(db, config);
  const rows = storedRows(db);
  return SETTING_KEYS.map((key) => {
    const row = rows.get(key);
    const overridden = row !== undefined && parseStored(key, row) !== undefined;
    return {
      key,
      value: current[key],
      default: defaults[key],
      overridden,
      updatedAt: overridden ? isoOrNull(row!.updated_at) : null,
      updatedBy: overridden ? adminRef(db, row!.updated_by) : null,
    };
  });
}
