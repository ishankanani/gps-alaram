/**
 * Admin settings (spec 2.10, 6.5, 4.6): GET with defaults, valid patches, unknown keys, invalid
 * values for each key, null resets, all-or-nothing, the 32 KB body limit and the audit row.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { iso } from '../src/clock.ts';
import { getUserByEmail, type UserRow } from '../src/domain/users.ts';
import { count, startTestServer, tracked, type TestServer } from './helpers.ts';

let s: TestServer;
let admin: string;
let adminUser: UserRow;
before(async () => {
  s = await startTestServer({ env: { SUPPORT_EMAIL: 'help@stopwake.example' } });
  admin = await s.adminToken();
  adminUser = getUserByEmail(s.db, 'root@example.com')!;
});
after(() => s.close());

const DEFAULTS: Record<string, unknown> = {
  'limits.freeFavourites': 3,
  'pro.features': { heavyAlarm: true, unlimitedFavourites: true, offlineMap: true },
  'pricing.trialDays': 7,
  announcement: null,
  'support.email': 'help@stopwake.example',
  'links.privacy': 'https://api.example.com/privacy',
  'links.terms': 'https://api.example.com/terms',
  'app.minVersion': '0.0.0',
  'app.latestVersion': '0.0.0',
  'auth.signUpEnabled': true,
  'promo.redeemEnabled': true,
  'plan.cacheDays': 30,
  'store.productPlans': {},
};

const ANNOUNCEMENT = {
  id: 'winter-timetables',
  enabled: true,
  level: 'info',
  texts: { en: { title: 'New timetables', body: 'Trains change\ntheir schedules.' }, de: { title: null, body: 'Neue Fahrpläne.' } },
  url: 'https://example.com/info',
  countries: ['DE', 'AT'],
  minAppVersion: '1.0.0',
  maxAppVersion: '2.0.0',
  startsAt: '2026-12-01T00:00:00.000Z',
  endsAt: '2026-12-20T00:00:00.000Z',
  dismissible: true,
};

const get = async () => {
  const res = await s.request('GET', '/v1/admin/settings', { token: admin });
  assert.equal(res.status, 200, res.text);
  return Object.fromEntries((res.body.items as any[]).map((i) => [i.key, i]));
};
const patch = (values: unknown) => tracked(s, () => s.request('PATCH', '/v1/admin/settings', { token: admin, body: { values } }));

describe('GET /v1/admin/settings', () => {
  it('lists every key of 6.5 with its value, default and override state', async () => {
    const res = await s.request('GET', '/v1/admin/settings', { token: admin });
    assert.deepEqual(Object.keys(res.body), ['items']);
    assert.deepEqual(res.body.items.map((i: any) => i.key), Object.keys(DEFAULTS));
    for (const item of res.body.items) {
      assert.deepEqual(Object.keys(item).sort(), ['default', 'key', 'overridden', 'updatedAt', 'updatedBy', 'value']);
      assert.deepEqual(item.value, DEFAULTS[item.key], item.key);
      assert.deepEqual(item.default, DEFAULTS[item.key], item.key);
      assert.equal(item.overridden, false);
      assert.equal(item.updatedAt, null);
      assert.equal(item.updatedBy, null);
    }
  });
});

describe('PATCH /v1/admin/settings', () => {
  it('stores valid values, returns the GET shape and writes one audit row', async () => {
    const t = await patch({ 'limits.freeFavourites': 5, 'plan.cacheDays': 14, 'store.productPlans': { 'stopwake_pro:weekly': 'monthly' } });
    const res = t.result;
    assert.equal(res.status, 200, res.text);
    assert.deepEqual(Object.keys(res.body), ['items']);
    const items = Object.fromEntries((res.body.items as any[]).map((i) => [i.key, i]));
    assert.equal(items['limits.freeFavourites'].value, 5);
    assert.equal(items['limits.freeFavourites'].default, 3);
    assert.equal(items['limits.freeFavourites'].overridden, true);
    assert.equal(items['limits.freeFavourites'].updatedAt, iso(s.clock.now()));
    assert.deepEqual(items['limits.freeFavourites'].updatedBy, { id: adminUser.id, publicId: adminUser.public_id, displayName: null });
    assert.deepEqual(items['store.productPlans'].value, { 'stopwake_pro:weekly': 'monthly' });
    assert.equal(items['pricing.trialDays'].overridden, false);
    assert.equal(t.audit.length, 1);
    const a = t.audit[0]!;
    assert.equal(a.action, 'settings.update');
    assert.equal(a.actor_id, adminUser.id);
    assert.equal(a.target_type, 'settings');
    assert.equal(a.target_label, 'limits.freeFavourites,plan.cacheDays,store.productPlans');
    assert.deepEqual(JSON.parse(a.details), {
      keys: ['limits.freeFavourites', 'plan.cacheDays', 'store.productPlans'],
      before: { 'limits.freeFavourites': 3, 'plan.cacheDays': 30, 'store.productPlans': {} },
      after: { 'limits.freeFavourites': 5, 'plan.cacheDays': 14, 'store.productPlans': { 'stopwake_pro:weekly': 'monthly' } },
    });
    assert.deepEqual(t.mail, []);
  });

  it('null resets a key to its default (its row is deleted); setting the default value also clears the row', async () => {
    await patch({ 'pricing.trialDays': 10, 'auth.signUpEnabled': false });
    assert.equal(count(s.db, "SELECT count(*) AS n FROM settings WHERE key IN ('pricing.trialDays', 'auth.signUpEnabled')"), 2);
    const t = await patch({ 'pricing.trialDays': null, 'auth.signUpEnabled': true });
    assert.equal(t.result.status, 200);
    const items = await get();
    assert.equal(items['pricing.trialDays'].value, 7);
    assert.equal(items['pricing.trialDays'].overridden, false);
    assert.equal(items['auth.signUpEnabled'].overridden, false);
    assert.equal(count(s.db, "SELECT count(*) AS n FROM settings WHERE key IN ('pricing.trialDays', 'auth.signUpEnabled')"), 0);
    assert.deepEqual(JSON.parse(t.audit[0]!.details), {
      keys: ['pricing.trialDays', 'auth.signUpEnabled'],
      before: { 'pricing.trialDays': 10, 'auth.signUpEnabled': false },
      after: { 'pricing.trialDays': 7, 'auth.signUpEnabled': true },
    });
  });

  it('summarizes announcement texts as { id, enabled } in the audit row', async () => {
    const t = await patch({ announcement: ANNOUNCEMENT });
    assert.equal(t.result.status, 200, t.result.text);
    const stored = (await get()).announcement.value;
    assert.deepEqual(stored, ANNOUNCEMENT);
    assert.deepEqual(JSON.parse(t.audit[0]!.details), {
      keys: ['announcement'], before: { announcement: null }, after: { announcement: { id: 'winter-timetables', enabled: true } },
    });
    const off = await patch({ announcement: null });
    assert.deepEqual(JSON.parse(off.audit[0]!.details).before, { announcement: { id: 'winter-timetables', enabled: true } });
    assert.equal((await get()).announcement.value, null);
  });

  it('unknown keys get unknown_key and nothing is written', async () => {
    const t = await patch({ 'limits.freeFavourites': 7, 'limits.unknown': 1 });
    assert.equal(t.result.status, 400);
    assert.equal(t.result.body.error.code, 'validation_failed');
    assert.deepEqual(t.result.body.error.fields, { 'limits.unknown': 'unknown_key' });
    assert.equal(t.audit.length, 0);
    assert.equal((await get())['limits.freeFavourites'].value, 5);
  });

  it('is all or nothing', async () => {
    const t = await patch({ 'limits.freeFavourites': 9, 'plan.cacheDays': 0, 'app.minVersion': '1.2.3' });
    assert.equal(t.result.status, 400);
    assert.deepEqual(t.result.body.error.fields, { 'plan.cacheDays': 'out_of_range' });
    assert.equal(t.audit.length, 0);
    const items = await get();
    assert.equal(items['limits.freeFavourites'].value, 5);
    assert.equal(items['app.minVersion'].value, '0.0.0');
  });

  it('rejects an invalid value for each key', async () => {
    const announcement = (over: Record<string, unknown>) => ({ ...ANNOUNCEMENT, ...over });
    const cases: [string, unknown, string][] = [
      ['limits.freeFavourites', 101, 'out_of_range'],
      ['limits.freeFavourites', -1, 'out_of_range'],
      ['limits.freeFavourites', 2.5, 'invalid'],
      ['limits.freeFavourites', '3', 'invalid'],
      ['pro.features', { heavyAlarm: true }, 'invalid'],
      ['pro.features', { heavyAlarm: 'yes', unlimitedFavourites: true, offlineMap: true }, 'invalid'],
      ['pro.features', { heavyAlarm: true, unlimitedFavourites: true, offlineMap: true, wearOs: true }, 'invalid'],
      ['pro.features', [true, true, true], 'invalid'],
      ['pricing.trialDays', 31, 'out_of_range'],
      ['pricing.trialDays', true, 'invalid'],
      ['announcement', 'hello', 'invalid'],
      ['announcement', announcement({ id: 'Bad ID' }), 'invalid'],
      ['announcement', announcement({ level: 'urgent' }), 'invalid'],
      ['announcement', announcement({ enabled: 'yes' }), 'invalid'],
      ['announcement', announcement({ texts: { de: { body: 'Nur Deutsch' } } }), 'invalid'],
      ['announcement', announcement({ texts: { en: { body: 'x'.repeat(281) } } }), 'invalid'],
      ['announcement', announcement({ texts: { en: { body: '' } } }), 'invalid'],
      ['announcement', announcement({ texts: { en: { title: 't'.repeat(61), body: 'Body' } } }), 'invalid'],
      ['announcement', announcement({ texts: { en: { body: 'Body' }, xx: { body: 'Body' } } }), 'invalid'],
      ['announcement', announcement({ url: 'http://example.com' }), 'invalid'],
      ['announcement', announcement({ countries: ['de'] }), 'invalid'],
      ['announcement', announcement({ countries: [] }), 'invalid'],
      ['announcement', announcement({ minAppVersion: '2.0.0', maxAppVersion: '1.0.0' }), 'invalid'],
      ['announcement', announcement({ minAppVersion: '1.0' }), 'invalid'],
      ['announcement', announcement({ startsAt: '2026-12-20T00:00:00Z', endsAt: '2026-12-01T00:00:00Z' }), 'invalid'],
      ['announcement', announcement({ startsAt: 'tomorrow' }), 'invalid'],
      ['support.email', 'not an email', 'invalid'],
      ['support.email', 42, 'invalid'],
      ['links.privacy', 'http://example.com/privacy', 'invalid'],
      ['links.terms', 'ftp://example.com/terms', 'invalid'],
      ['links.terms', `https://example.com/${'x'.repeat(300)}`, 'invalid'],
      ['app.minVersion', '1.0', 'invalid'],
      ['app.latestVersion', 'v1.0.0', 'invalid'],
      ['auth.signUpEnabled', 'true', 'invalid'],
      ['promo.redeemEnabled', 1, 'invalid'],
      ['plan.cacheDays', 0, 'out_of_range'],
      ['plan.cacheDays', 91, 'out_of_range'],
      ['store.productPlans', { stopwake_weekly: 'weekly' }, 'invalid'],
      ['store.productPlans', { ['p'.repeat(101)]: 'monthly' }, 'invalid'],
      ['store.productPlans', Object.fromEntries(Array.from({ length: 51 }, (_, i) => [`product_${i}`, 'monthly'])), 'out_of_range'],
      ['store.productPlans', ['monthly'], 'invalid'],
    ];
    for (const [key, value, error] of cases) {
      const t = await patch({ [key]: value });
      assert.equal(t.result.status, 400, `${key} ${JSON.stringify(value)?.slice(0, 80)}`);
      assert.deepEqual(t.result.body.error.fields, { [key]: error }, `${key} ${JSON.stringify(value)?.slice(0, 80)}`);
      assert.equal(t.audit.length, 0);
    }
    // The bounds themselves are accepted.
    const edges = await patch({
      'limits.freeFavourites': 100, 'pricing.trialDays': 0, 'plan.cacheDays': 90,
      'store.productPlans': Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`product_${i}`, 'yearly'])),
      announcement: { ...ANNOUNCEMENT, texts: { en: { body: 'b'.repeat(280), title: 't'.repeat(60) } }, countries: null, url: null },
    });
    assert.equal(edges.result.status, 200, edges.result.text);
    await patch({ 'limits.freeFavourites': null, 'pricing.trialDays': null, 'plan.cacheDays': null, 'store.productPlans': null, announcement: null });
  });

  it('values must be a non-empty object', async () => {
    for (const body of [{}, { values: null }, { values: [] }, { values: {} }, { values: 'x' }]) {
      const res = await s.request('PATCH', '/v1/admin/settings', { token: admin, body });
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.deepEqual(res.body.error.fields, { values: 'invalid' });
    }
  });

  it('accepts bodies up to 32 KB (the default limit is 16 KB)', async () => {
    const values = { 'limits.freeFavourites': 4 };
    const big = await s.request('PATCH', '/v1/admin/settings', { token: admin, body: { values, padding: 'x'.repeat(24 * 1024) } });
    assert.equal(big.status, 200, big.text);
    const tooBig = await s.request('PATCH', '/v1/admin/settings', { token: admin, body: { values, padding: 'x'.repeat(33 * 1024) } });
    assert.equal(tooBig.status, 413);
    assert.equal(tooBig.body.error.code, 'payload_too_large');
    const elsewhere = await s.request('POST', '/v1/admin/promo-codes', { token: admin, body: { plan: 'monthly', padding: 'x'.repeat(17 * 1024) } });
    assert.equal(elsewhere.status, 413);
  });

  it('the config reflects a write at once (the cache is cleared)', async () => {
    assert.equal((await s.request('GET', '/v1/config')).body.limits.freeFavourites, 4);
    await patch({ 'limits.freeFavourites': 8 });
    assert.equal((await s.request('GET', '/v1/config')).body.limits.freeFavourites, 8);
  });
});
