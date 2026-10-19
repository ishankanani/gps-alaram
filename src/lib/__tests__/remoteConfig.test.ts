import { beforeAll, describe, expect, it } from 'vitest';

import type { RemoteConfig } from '../../api/types';
import { canAddFavourite, effectiveStrength, offlineMapAllowed, planRules, setPlanRules, strengthAllowed, DEFAULT_PLAN_RULES } from '../plans';
import { BUILTIN_PRICES, resolvePrice } from '../pricing';
import {
  compareVersions,
  configKey,
  DEFAULT_CONFIG,
  defaultConfig,
  mergeConfig,
  updateAvailable,
  updateRequired,
  validPriceRow,
} from '../remoteConfig';
import { setRemoteMonetizationMode } from '../monetization';

// These gates are the premium mode's; free_ads unlocks everything (monetization.test.ts).
beforeAll(() => setRemoteMonetizationMode('premium'));

// The example answer of backend-spec 2.5.
const SERVER: RemoteConfig = {
  configVersion: 'c1f0a9e2b7d4410e',
  country: 'DE',
  prices: {
    country: 'DE',
    currency: 'EUR',
    monthly: 199,
    yearly: 999,
    lifetime: 1499,
    trialDays: null,
    format: { symbol: '€', position: 'after', space: true, decimal: ',', group: '.', decimals: 2, trimWhole: false, grouping: 'standard', wordSymbol: false },
  },
  trialDays: 7,
  limits: { freeFavourites: 3 },
  proFeatures: { heavyAlarm: true, unlimitedFavourites: true, offlineMap: true },
  features: { redeemCodes: true },
  announcement: null,
  support: { email: 'support@example.com' },
  links: {
    privacy: 'https://api.example.com/privacy',
    terms: 'https://api.example.com/terms',
    accountDeletion: 'https://api.example.com/account-deletion',
  },
  app: { minVersion: '0.0.0', latestVersion: '1.0.0', updateUrl: 'https://play.google.com/store/apps/details?id=com.ishankanani.gpsalarm' },
  auth: { signUpEnabled: true, passwordReset: true },
  planCacheDays: 30,
};

describe('defaults', () => {
  it('uses the built-in prices for the phone region', () => {
    expect(defaultConfig('CH').prices).toEqual(resolvePrice('CH'));
    expect(defaultConfig('it').prices.country).toBe('EU');
    expect(defaultConfig('it').country).toBe('IT');
    expect(defaultConfig('BR').prices.country).toBe('DEFAULT');
    expect(defaultConfig(null).country).toBe('DEFAULT');
    expect(DEFAULT_CONFIG.trialDays).toBe(7);
    expect(DEFAULT_CONFIG.limits.freeFavourites).toBe(3);
    expect(DEFAULT_CONFIG.proFeatures).toEqual({ heavyAlarm: true, unlimitedFavourites: true, offlineMap: true });
  });

  it('accepts every built-in price row', () => {
    for (const row of BUILTIN_PRICES) expect(validPriceRow(row), row.country).toBe(true);
  });
});

describe('mergeConfig', () => {
  it('takes a complete, valid answer as it is', () => {
    expect(mergeConfig(DEFAULT_CONFIG, SERVER)).toEqual(SERVER);
  });

  it('keeps the previous value of every invalid field', () => {
    const base = mergeConfig(DEFAULT_CONFIG, SERVER);
    const merged = mergeConfig(base, {
      ...SERVER,
      configVersion: 42,
      country: 'Germany',
      prices: { ...SERVER.prices, monthly: -1 },
      trialDays: 31,
      limits: { freeFavourites: 101 },
      proFeatures: { heavyAlarm: 'yes', offlineMap: false, teleport: true },
      features: { redeemCodes: null },
      support: { email: 'not an email' },
      links: { privacy: 'javascript:alert(1)', terms: 'https://example.com/new-terms', accountDeletion: 12 },
      app: { minVersion: '1.0', latestVersion: '2.0.0', updateUrl: 'http://insecure.example.com' },
      auth: { signUpEnabled: false, passwordReset: 'maybe' },
      planCacheDays: 0,
    });
    expect(merged.configVersion).toBe(SERVER.configVersion);
    expect(merged.country).toBe('DE');
    expect(merged.prices).toEqual(SERVER.prices);
    expect(merged.trialDays).toBe(7);
    expect(merged.limits.freeFavourites).toBe(3);
    expect(merged.proFeatures).toEqual({ heavyAlarm: true, unlimitedFavourites: true, offlineMap: false });
    expect(merged.proFeatures).not.toHaveProperty('teleport');
    expect(merged.features.redeemCodes).toBe(true);
    expect(merged.support.email).toBe('support@example.com');
    expect(merged.links).toEqual({ ...SERVER.links, terms: 'https://example.com/new-terms' });
    expect(merged.app).toEqual({ ...SERVER.app, latestVersion: '2.0.0' });
    expect(merged.auth).toEqual({ signUpEnabled: false, passwordReset: true });
    expect(merged.planCacheDays).toBe(30);
  });

  it('keeps everything for missing fields and non-objects', () => {
    expect(mergeConfig(SERVER, {})).toEqual(SERVER);
    expect(mergeConfig(SERVER, null)).toBe(SERVER);
    expect(mergeConfig(SERVER, 'nope')).toBe(SERVER);
    expect(mergeConfig(SERVER, [1, 2])).toBe(SERVER);
  });

  it('validates price rows field by field', () => {
    const bad = (over: object) => mergeConfig(SERVER, { prices: { ...SERVER.prices, ...over } }).prices;
    expect(bad({ currency: 'euro' })).toEqual(SERVER.prices);
    expect(bad({ yearly: 9.99 })).toEqual(SERVER.prices);
    expect(bad({ trialDays: 45 })).toEqual(SERVER.prices);
    expect(bad({ format: { ...SERVER.prices.format, decimals: 3 } })).toEqual(SERVER.prices);
    expect(bad({ format: undefined })).toEqual(SERVER.prices);
    const chf = resolvePrice('CH');
    expect(mergeConfig(SERVER, { prices: chf }).prices).toEqual(chf);
    const pl = { ...chf, country: 'PL', currency: 'PLN', monthly: 899, yearly: 4499, lifetime: 6499, trialDays: 14 };
    expect(mergeConfig(SERVER, { prices: pl }).prices).toEqual(pl);
  });

  it('accepts, replaces and clears announcements', () => {
    const announcement = { id: 'france-2026', level: 'info', title: 'New', body: 'Stops for France are here.', url: null, dismissible: true };
    const withBanner = mergeConfig(SERVER, { announcement });
    expect(withBanner.announcement).toEqual(announcement);
    expect(mergeConfig(withBanner, { announcement: { ...announcement, level: 'promo' } }).announcement).toEqual(announcement);
    expect(mergeConfig(withBanner, { announcement: { ...announcement, body: 'x'.repeat(281) } }).announcement).toEqual(announcement);
    expect(mergeConfig(withBanner, { announcement: { ...announcement, id: 'Bad Id' } }).announcement).toEqual(announcement);
    expect(mergeConfig(withBanner, { announcement: null }).announcement).toBeNull();
    expect(mergeConfig(withBanner, {}).announcement).toEqual(announcement);
  });
});

describe('config helpers', () => {
  it('keys the cache by country, language and version', () => {
    expect(configKey('de', 'en', '1.0.0')).toBe('DE|en|1.0.0');
    expect(configKey(null, 'de', '1.0.0')).toBe('DEFAULT|de|1.0.0');
    expect(configKey('D3', 'de', '1.0.0')).toBe('DEFAULT|de|1.0.0');
  });

  it('compares versions numerically', () => {
    expect(compareVersions('1.10.0', '1.9.9')).toBe(1);
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('0.9.0', '1.0.0')).toBe(-1);
    expect(updateRequired({ app: { ...SERVER.app, minVersion: '1.2.0' } }, '1.1.9')).toBe(true);
    expect(updateRequired({ app: SERVER.app }, '0.1.0')).toBe(false);
    expect(updateAvailable({ app: SERVER.app }, '0.1.0')).toBe(true);
  });
});

describe('the gates read the config', () => {
  it('follows proFeatures and limits', () => {
    const free = { heavyAlarm: false, unlimitedFavourites: false, offlineMap: false };
    expect(strengthAllowed('heavy', false, free)).toBe(true);
    expect(effectiveStrength('heavy', false, SERVER.proFeatures)).toBe('normal');
    expect(canAddFavourite(5, false, { freeFavourites: 10 })).toBe(true);
    expect(canAddFavourite(10, false, { freeFavourites: 10 })).toBe(false);
    expect(canAddFavourite(50, false, { freeFavourites: 3 }, free)).toBe(true);
    expect(offlineMapAllowed(false)).toBe(false);
    expect(offlineMapAllowed(false, free)).toBe(true);
    expect(offlineMapAllowed(true)).toBe(true);
  });

  it('uses the latest config when callers pass none', () => {
    try {
      setPlanRules({ limits: { freeFavourites: 5 }, proFeatures: { heavyAlarm: false, unlimitedFavourites: true, offlineMap: true } });
      expect(planRules().limits.freeFavourites).toBe(5);
      expect(canAddFavourite(4, false)).toBe(true);
      expect(canAddFavourite(5, false)).toBe(false);
      expect(effectiveStrength('heavy', false)).toBe('heavy');
    } finally {
      setPlanRules(DEFAULT_PLAN_RULES);
    }
    expect(effectiveStrength('heavy', false)).toBe('normal');
  });
});
