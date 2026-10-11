/**
 * GET /v1/config (spec 2.5, 5.3, 5.4, 6.5): price resolution, ETag / 304, Cache-Control,
 * announcement filtering, and the fields that come from settings and the environment.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { DAY, HOUR } from '../src/clock.ts';
import { createConfigCache } from '../src/domain/config.ts';
import { startTestServer, type TestServer } from './helpers.ts';

let s: TestServer;
let admin: string;
before(async () => {
  s = await startTestServer();
  admin = await s.adminToken();
});
after(() => s.close());

const config = (query = '', headers: Record<string, string> = {}) => s.request('GET', `/v1/config${query ? `?${query}` : ''}`, { headers });
const body = async (query = '') => {
  const res = await config(query);
  assert.equal(res.status, 200, res.text);
  return res.body;
};
const setSettings = async (values: Record<string, unknown>) => {
  const res = await s.request('PATCH', '/v1/admin/settings', { token: admin, body: { values } });
  assert.equal(res.status, 200, res.text);
};

const EURO_AFTER = {
  symbol: '€', position: 'after', space: true, decimal: ',', group: '.', decimals: 2, trimWhole: false, grouping: 'standard', wordSymbol: false,
};

describe('price resolution', () => {
  it('DE: the example response of 2.5', async () => {
    const res = await config('country=DE&lang=en');
    assert.equal(res.status, 200);
    const etag = res.headers.get('etag')!;
    assert.deepEqual(res.body, {
      configVersion: etag.slice(1, -1),
      country: 'DE',
      prices: { country: 'DE', currency: 'EUR', monthly: 199, yearly: 999, lifetime: 1499, trialDays: null, format: EURO_AFTER },
      trialDays: 7,
      limits: { freeFavourites: 3 },
      proFeatures: { heavyAlarm: true, unlimitedFavourites: true, offlineMap: true },
      features: { redeemCodes: true },
      announcement: null,
      support: { email: 'support@example.com' },
      links: {
        privacy: 'https://api.example.com/privacy', terms: 'https://api.example.com/terms',
        accountDeletion: 'https://api.example.com/account-deletion',
      },
      app: { minVersion: '0.0.0', latestVersion: '0.0.0', updateUrl: 'https://play.google.com/store/apps/details?id=com.ishankanani.gpsalarm' },
      // MAIL_MODE=memory in tests: passwordReset is true only for smtp and log.
      auth: { signUpEnabled: true, passwordReset: false },
      planCacheDays: 30,
    });
  });

  it('AT has its own row; IT resolves to EU; BR to DEFAULT', async () => {
    const at = await body('country=AT');
    assert.equal(at.prices.country, 'AT');
    assert.equal(at.prices.format.position, 'before');
    const it_ = await body('country=IT');
    assert.equal(it_.country, 'IT');
    assert.equal(it_.prices.country, 'EU');
    assert.equal(it_.prices.currency, 'EUR');
    const br = await body('country=BR');
    assert.equal(br.country, 'BR');
    assert.equal(br.prices.country, 'DEFAULT');
    assert.equal(br.prices.currency, 'USD');
    assert.equal(br.prices.format.symbol, 'US$');
  });

  it('lowercase de is DE; invalid and absent countries mean DEFAULT; the endpoint never answers 400', async () => {
    assert.equal((await body('country=de')).prices.country, 'DE');
    for (const query of ['country=D3', 'country=DEU', '', 'country=', 'country=%00']) {
      const b = await body(query);
      assert.equal(b.country, 'DEFAULT', query);
      assert.equal(b.prices.country, 'DEFAULT', query);
    }
    const junk = await config('country=123&lang=klingon&version=1.0&platform=web&x=%FF');
    assert.equal(junk.status, 200);
    assert.equal(junk.body.country, 'DEFAULT');
  });
});

describe('caching headers', () => {
  it('ETag is the first 16 hex chars of a SHA-256, equal to configVersion; Cache-Control public, max-age=300', async () => {
    const res = await config('country=DE');
    const etag = res.headers.get('etag')!;
    assert.match(etag, /^"[0-9a-f]{16}"$/);
    assert.equal(res.body.configVersion, etag.slice(1, -1));
    assert.equal(res.headers.get('cache-control'), 'public, max-age=300');
    assert.equal(res.headers.get('content-type'), 'application/json; charset=utf-8');
    assert.equal((await config('country=DE')).headers.get('etag'), etag, 'stable');
    assert.notEqual((await config('country=AT')).headers.get('etag'), etag);
    // Without an announcement the language changes nothing, so the tag is the same.
    assert.equal((await config('country=DE&lang=de')).headers.get('etag'), etag);
  });

  it('304 when If-None-Match matches (W/ ignored, lists and * accepted)', async () => {
    const etag = (await config('country=DE')).headers.get('etag')!;
    for (const inm of [etag, `W/${etag}`, `"0000000000000000", ${etag}`, '*']) {
      const res = await config('country=DE', { 'If-None-Match': inm });
      assert.equal(res.status, 304, inm);
      assert.equal(res.text, '');
      assert.equal(res.headers.get('etag'), etag);
      assert.equal(res.headers.get('cache-control'), 'public, max-age=300');
    }
    const miss = await config('country=DE', { 'If-None-Match': '"0000000000000000"' });
    assert.equal(miss.status, 200);
    // The tag of another resolution does not match.
    assert.equal((await config('country=AT', { 'If-None-Match': etag })).status, 200);
  });

  it('a price override changes the config and its ETag; removing it restores both', async () => {
    const before_ = await config('country=DE');
    const put = await s.request('PUT', '/v1/admin/prices/DE', { token: admin, body: { currency: 'EUR', monthly: 249, yearly: 1199, lifetime: 1799 } });
    assert.equal(put.status, 200, put.text);
    const changed = await config('country=DE', { 'If-None-Match': before_.headers.get('etag')! });
    assert.equal(changed.status, 200);
    assert.equal(changed.body.prices.monthly, 249);
    assert.notEqual(changed.headers.get('etag'), before_.headers.get('etag'));
    assert.equal((await s.request('DELETE', '/v1/admin/prices/DE', { token: admin })).status, 204);
    const restored = await config('country=DE');
    assert.equal(restored.body.prices.monthly, 199);
    assert.equal(restored.headers.get('etag'), before_.headers.get('etag'));
  });
});

describe('announcement filtering', () => {
  const announcement = (over: Record<string, unknown> = {}) => ({
    id: 'winter-timetables',
    enabled: true,
    level: 'warning',
    texts: { en: { title: 'New timetables', body: 'Trains change their schedules.' }, de: { body: 'Die Fahrpläne ändern sich.' } },
    url: 'https://example.com/timetables',
    countries: ['DE', 'AT'],
    minAppVersion: '1.0.0',
    maxAppVersion: '1.5.0',
    startsAt: new Date(s.clock.now() + HOUR).toISOString(),
    endsAt: new Date(s.clock.now() + 10 * DAY).toISOString(),
    dismissible: false,
    ...over,
  });
  after(() => setSettings({ announcement: null }));

  it('shows it only inside its window, opening and closing by itself', async () => {
    await setSettings({ announcement: announcement() });
    assert.equal((await body('country=DE&version=1.2.0')).announcement, null, 'not started');
    s.clock.advance(2 * HOUR);
    assert.deepEqual((await body('country=DE&version=1.2.0')).announcement, {
      id: 'winter-timetables', level: 'warning', title: 'New timetables', body: 'Trains change their schedules.',
      url: 'https://example.com/timetables', dismissible: false,
    });
    s.clock.advance(10 * DAY);
    assert.equal((await body('country=DE&version=1.2.0')).announcement, null, 'ended');
  });

  it('filters by enabled, country and version; the text falls back to English', async () => {
    await setSettings({ announcement: announcement({ startsAt: null, endsAt: null }) });
    const shown = async (query: string) => (await body(query)).announcement;
    assert.ok(await shown('country=DE&version=1.0.0'));
    assert.ok(await shown('country=at&version=1.5.0'));
    assert.ok(await shown('country=DE'), 'no version: the bounds are not checked');
    assert.ok(await shown('country=DE&version=banana'), 'an invalid version counts as absent');
    assert.equal(await shown('country=FR&version=1.2.0'), null);
    assert.equal(await shown('version=1.2.0'), null, 'DEFAULT is not in the list');
    assert.equal(await shown('country=DE&version=0.9.9'), null);
    assert.equal(await shown('country=DE&version=1.5.1'), null);
    assert.equal(await shown('country=DE&version=1.10.0'), null, 'semver, not string comparison');

    const de = await shown('country=DE&lang=de');
    assert.equal(de.body, 'Die Fahrpläne ändern sich.');
    assert.equal(de.title, null);
    assert.equal((await shown('country=DE&lang=fr')).body, 'Trains change their schedules.');
    assert.equal((await shown('country=DE&lang=xx')).body, 'Trains change their schedules.');

    await setSettings({ announcement: announcement({ countries: null, minAppVersion: null, maxAppVersion: null, startsAt: null, endsAt: null }) });
    assert.ok(await shown('country=BR&version=0.1.0'));
    assert.ok(await shown(''));
    await setSettings({ announcement: announcement({ enabled: false, startsAt: null, endsAt: null }) });
    assert.equal(await shown('country=DE&version=1.2.0'), null);
  });
});

describe('fields from settings and the environment', () => {
  after(() =>
    setSettings({
      'limits.freeFavourites': null, 'pro.features': null, 'pricing.trialDays': null, 'plan.cacheDays': null, 'promo.redeemEnabled': null,
      'auth.signUpEnabled': null, 'app.minVersion': null, 'app.latestVersion': null, 'support.email': null, 'links.privacy': null, 'links.terms': null,
    }));

  it('limits, proFeatures, features, auth, app, support, links and planCacheDays follow the settings', async () => {
    const etag = (await config('country=DE')).headers.get('etag');
    await setSettings({
      'limits.freeFavourites': 5,
      'pro.features': { heavyAlarm: false, unlimitedFavourites: true, offlineMap: false },
      'plan.cacheDays': 14,
      'promo.redeemEnabled': false,
      'auth.signUpEnabled': false,
      'app.minVersion': '1.0.0',
      'app.latestVersion': '1.2.0',
      'support.email': 'help@example.com',
      'links.privacy': 'https://example.com/privacy',
      'links.terms': 'https://example.com/terms',
    });
    const res = await config('country=DE');
    assert.notEqual(res.headers.get('etag'), etag);
    const b = res.body;
    assert.deepEqual(b.limits, { freeFavourites: 5 });
    assert.deepEqual(b.proFeatures, { heavyAlarm: false, unlimitedFavourites: true, offlineMap: false });
    assert.deepEqual(b.features, { redeemCodes: false });
    assert.deepEqual(b.auth, { signUpEnabled: false, passwordReset: false });
    assert.equal(b.app.minVersion, '1.0.0');
    assert.equal(b.app.latestVersion, '1.2.0');
    assert.deepEqual(b.support, { email: 'help@example.com' });
    assert.deepEqual(b.links, {
      privacy: 'https://example.com/privacy', terms: 'https://example.com/terms', accountDeletion: 'https://api.example.com/account-deletion',
    });
    assert.equal(b.planCacheDays, 14);
  });

  it('trialDays: the row override first, then the pricing.trialDays setting', async () => {
    await setSettings({ 'pricing.trialDays': 10 });
    assert.equal((await body('country=DE')).trialDays, 10);
    const put = await s.request('PUT', '/v1/admin/prices/DE', {
      token: admin, body: { currency: 'EUR', monthly: 199, yearly: 999, lifetime: 1499, trialDays: 3 },
    });
    assert.equal(put.status, 200, put.text);
    const de = await body('country=DE');
    assert.equal(de.trialDays, 3);
    assert.equal(de.prices.trialDays, 3);
    assert.equal((await body('country=AT')).trialDays, 10);
    await s.request('DELETE', '/v1/admin/prices/DE', { token: admin });
    assert.equal((await body('country=DE')).trialDays, 10);
  });

  it('auth.passwordReset is true for MAIL_MODE log and smtp; APP_PACKAGE sets the update URL', async () => {
    const t = await startTestServer({ env: { MAIL_MODE: 'log', APP_PACKAGE: 'com.example.other', PUBLIC_URL: 'https://cloud.example.org' } });
    try {
      const b = (await t.request('GET', '/v1/config')).body;
      assert.equal(b.auth.passwordReset, true);
      assert.equal(b.app.updateUrl, 'https://play.google.com/store/apps/details?id=com.example.other');
      assert.equal(b.links.accountDeletion, 'https://cloud.example.org/account-deletion');
      assert.equal(b.links.privacy, 'https://cloud.example.org/privacy');
    } finally {
      await t.close();
    }
  });
});

describe('the config cache', () => {
  it('keeps at most the configured number of entries', async () => {
    const t = await startTestServer();
    try {
      const cache = createConfigCache(3);
      for (const country of ['DE', 'AT', 'CH', 'FR', 'GB']) {
        cache.get(t.db, t.config, { country, lang: 'en', version: null }, t.clock.now());
        assert.ok(cache.size() <= 3);
      }
      assert.equal(cache.size(), 3);
      cache.clear();
      assert.equal(cache.size(), 0);
    } finally {
      await t.close();
    }
  });
});
