// App settings (backend-spec 6.5, PATCH /v1/admin/settings): the form values per key, what
// changed, client-side checks matching the server's schemas, and the announcement draft. Pure.

import type { AdminSetting, AnnouncementSetting, ApiLang, PaidPlan, ProFeature, SettingKey } from '../../../api/types';
import type { AdminKey } from './text';

export type SettingValues = {
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

export const SETTING_KEYS: readonly SettingKey[] = [
  'limits.freeFavourites', 'pro.features', 'pricing.trialDays', 'announcement', 'support.email',
  'links.privacy', 'links.terms', 'app.minVersion', 'app.latestVersion', 'auth.signUpEnabled',
  'promo.redeemEnabled', 'plan.cacheDays', 'store.productPlans',
];

export const FALLBACK_VALUES: SettingValues = {
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

/** The current values and the defaults from GET /v1/admin/settings. */
export function valuesFrom(items: readonly AdminSetting[]): { values: SettingValues; defaults: SettingValues } {
  const values = { ...FALLBACK_VALUES } as Record<SettingKey, unknown>;
  const defaults = { ...FALLBACK_VALUES } as Record<SettingKey, unknown>;
  for (const item of items) {
    if (!(SETTING_KEYS as readonly string[]).includes(item.key)) continue;
    values[item.key] = item.value;
    defaults[item.key] = item.default;
  }
  return { values: values as SettingValues, defaults: defaults as SettingValues };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The keys whose value differs from what the server has. */
export function changedKeys(initial: SettingValues, current: SettingValues): SettingKey[] {
  return SETTING_KEYS.filter((k) => !same(initial[k], current[k]));
}

/** The PATCH body: changed keys only; a key set back to its default is sent as null (reset). */
export function settingsPatch(initial: SettingValues, current: SettingValues, defaults: SettingValues): Partial<Record<SettingKey, unknown>> {
  const out: Partial<Record<SettingKey, unknown>> = {};
  for (const key of changedKeys(initial, current)) {
    out[key] = same(current[key], defaults[key]) ? null : current[key];
  }
  return out;
}

const VERSION = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/;
const EMAIL = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;
const HTTPS = /^https:\/\/([a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(:\d{1,5})?([/?#][^\s]*)?$/i;

export const isVersion = (s: string) => VERSION.test(s);
export const isEmail = (s: string) => s.length <= 254 && EMAIL.test(s.trim());
export const isHttpsUrl = (s: string) => s.length <= 300 && HTTPS.test(s);

export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

export const ANNOUNCEMENT_TITLE_MAX = 60;
export const ANNOUNCEMENT_BODY_MAX = 280;
const codePoints = (s: string) => [...s].length;

export type SettingErrors = Partial<Record<string, AdminKey>>;

/** Field errors keyed by setting key, or `announcement.<field>` for the announcement editor. */
export function checkSettings(v: SettingValues): SettingErrors {
  const e: SettingErrors = {};
  const intIn = (n: number, min: number, max: number) => Number.isInteger(n) && n >= min && n <= max;
  if (!intIn(v['limits.freeFavourites'], 0, 100)) e['limits.freeFavourites'] = 'admin.settings.error.range';
  if (!intIn(v['pricing.trialDays'], 0, 30)) e['pricing.trialDays'] = 'admin.settings.error.range';
  if (!intIn(v['plan.cacheDays'], 1, 90)) e['plan.cacheDays'] = 'admin.settings.error.range';
  if (!isEmail(v['support.email'])) e['support.email'] = 'admin.settings.error.email';
  if (!isHttpsUrl(v['links.privacy'])) e['links.privacy'] = 'admin.settings.error.url';
  if (!isHttpsUrl(v['links.terms'])) e['links.terms'] = 'admin.settings.error.url';
  if (!isVersion(v['app.minVersion'])) e['app.minVersion'] = 'admin.settings.error.version';
  if (!isVersion(v['app.latestVersion'])) e['app.latestVersion'] = 'admin.settings.error.version';
  else if (isVersion(v['app.minVersion']) && compareVersions(v['app.minVersion'], v['app.latestVersion']) > 0 && v['app.latestVersion'] !== '0.0.0') {
    e['app.latestVersion'] = 'admin.settings.error.latestBelowMin';
  }
  const plans = Object.keys(v['store.productPlans']);
  if (plans.length > 50) e['store.productPlans'] = 'admin.settings.error.tooMany';
  if (plans.some((k) => !k.trim() || codePoints(k) > 100 || k.trim() !== k)) e['store.productPlans'] = 'admin.settings.error.productId';
  const a = v.announcement;
  if (a) Object.assign(e, checkAnnouncement(a));
  return e;
}

export function checkAnnouncement(a: AnnouncementSetting): SettingErrors {
  const e: SettingErrors = {};
  if (!/^[a-z0-9-]{1,64}$/.test(a.id)) e['announcement.id'] = 'admin.ann.error.id';
  for (const [lang, text] of Object.entries(a.texts)) {
    if (!text) continue;
    const body = text.body.trim();
    if (!body) e[`announcement.body.${lang}`] = 'admin.ann.error.bodyRequired';
    else if (codePoints(body) > ANNOUNCEMENT_BODY_MAX) e[`announcement.body.${lang}`] = 'admin.ann.error.bodyLong';
    if (text.title && codePoints(text.title.trim()) > ANNOUNCEMENT_TITLE_MAX) e[`announcement.title.${lang}`] = 'admin.ann.error.titleLong';
  }
  if (a.url !== null && !isHttpsUrl(a.url)) e['announcement.url'] = 'admin.settings.error.url';
  if (a.minAppVersion !== null && !isVersion(a.minAppVersion)) e['announcement.minAppVersion'] = 'admin.settings.error.version';
  if (a.maxAppVersion !== null && !isVersion(a.maxAppVersion)) e['announcement.maxAppVersion'] = 'admin.settings.error.version';
  if (a.minAppVersion && a.maxAppVersion && isVersion(a.minAppVersion) && isVersion(a.maxAppVersion) && compareVersions(a.minAppVersion, a.maxAppVersion) > 0) {
    e['announcement.maxAppVersion'] = 'admin.ann.error.versionOrder';
  }
  if (a.startsAt && a.endsAt && Date.parse(a.endsAt) <= Date.parse(a.startsAt)) e['announcement.endsAt'] = 'admin.ann.error.dateOrder';
  return e;
}

/** A fresh id from the date: "ann-2026-10-11-1642". */
export function announcementId(now: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `ann-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}`;
}

export function newAnnouncement(now: Date): AnnouncementSetting {
  return {
    id: announcementId(now),
    enabled: false,
    level: 'info',
    texts: { en: { title: null, body: '' } },
    url: null,
    countries: null,
    minAppVersion: null,
    maxAppVersion: null,
    startsAt: null,
    endsAt: null,
    dismissible: true,
  };
}

/** Cleans the draft before sending: trimmed texts, empty titles as null. */
export function cleanAnnouncement(a: AnnouncementSetting): AnnouncementSetting {
  const texts: Partial<Record<ApiLang, { title: string | null; body: string }>> = {};
  for (const [lang, text] of Object.entries(a.texts) as [ApiLang, { title?: string | null; body: string } | undefined][]) {
    if (!text) continue;
    const title = text.title?.trim() || null;
    texts[lang] = { title, body: text.body.trim() };
  }
  return {
    ...a,
    texts: texts as AnnouncementSetting['texts'],
    url: a.url?.trim() || null,
    countries: a.countries && a.countries.length ? a.countries : null,
    minAppVersion: a.minAppVersion?.trim() || null,
    maxAppVersion: a.maxAppVersion?.trim() || null,
  };
}

/** The other app languages, for "Add translation". */
export const ANNOUNCEMENT_LANGS: readonly ApiLang[] = ['de', 'fr', 'it', 'nl', 'da', 'sv', 'nb', 'fi', 'hi', 'ja'];

export const LANGUAGE_NAMES: Record<ApiLang, AdminKey> = {
  da: 'admin.lang.da',
  de: 'admin.lang.de',
  en: 'admin.lang.en',
  fi: 'admin.lang.fi',
  fr: 'admin.lang.fr',
  hi: 'admin.lang.hi',
  it: 'admin.lang.it',
  ja: 'admin.lang.ja',
  nb: 'admin.lang.nb',
  nl: 'admin.lang.nl',
  sv: 'admin.lang.sv',
};

/** The newest change among the items: who and when ("Last changed by …"). */
export function lastChange(items: readonly AdminSetting[]): AdminSetting | null {
  let found: AdminSetting | null = null;
  for (const item of items) {
    if (!item.updatedAt) continue;
    if (!found || Date.parse(item.updatedAt) > Date.parse(found.updatedAt ?? '')) found = item;
  }
  return found;
}
