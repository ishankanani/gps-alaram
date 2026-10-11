/**
 * Admin prices (spec 2.10, 5.1, 5.4, 4.6): the merged table, overrides (PUT), deletion, reset,
 * override-only countries, formats, the currency decimals check and the warnings.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { BUILTIN_PRICES, CURRENCY_FORMATS, EU_ALIAS } from '../../src/lib/pricing.ts';
import { iso } from '../src/clock.ts';
import { getUserByEmail, type UserRow } from '../src/domain/users.ts';
import { count, startTestServer, tracked, type AuditRow, type TestServer } from './helpers.ts';

let s: TestServer;
let admin: string;
let adminUser: UserRow;
before(async () => {
  s = await startTestServer();
  admin = await s.adminToken();
  adminUser = getUserByEmail(s.db, 'root@example.com')!;
});
after(() => s.close());

const ROW_KEYS = ['builtin', 'country', 'currency', 'format', 'lifetime', 'monthly', 'overridden', 'trialDays', 'updatedAt', 'updatedBy', 'yearly'];
const builtin = (key: string) => BUILTIN_PRICES.find((r) => r.country === key)!;

async function call(method: string, path: string, body?: unknown) {
  const t = await tracked(s, () => s.request(method, path, { token: admin, body }));
  return { res: t.result, audit: t.audit };
}

function oneAudit(audit: AuditRow[], action: string, label: string | null, details?: Record<string, unknown>) {
  assert.equal(audit.length, 1, 'exactly one audit row');
  const a = audit[0]!;
  assert.equal(a.action, action);
  assert.equal(a.actor_id, adminUser.id);
  assert.equal(a.target_type, 'price');
  assert.equal(a.target_label, label);
  const parsed = JSON.parse(a.details) as Record<string, unknown>;
  if (details) assert.deepEqual(parsed, details);
  return parsed;
}

const list = async () => {
  const res = await s.request('GET', '/v1/admin/prices', { token: admin });
  assert.equal(res.status, 200, res.text);
  return res.body as { items: any[]; defaultTrialDays: number; euAlias: string[] };
};
const resolved = async (country: string) => (await s.request('GET', `/v1/config?country=${country}`)).body.prices;

describe('GET /v1/admin/prices', () => {
  it('lists the built-in rows sorted by key, EU and DEFAULT last', async () => {
    const b = await list();
    assert.deepEqual(Object.keys(b).sort(), ['defaultTrialDays', 'euAlias', 'items']);
    assert.equal(b.defaultTrialDays, 7);
    assert.deepEqual(b.euAlias, [...EU_ALIAS]);
    const keys = b.items.map((r) => r.country);
    const countries = BUILTIN_PRICES.map((r) => r.country).filter((k) => k !== 'EU' && k !== 'DEFAULT').sort();
    assert.deepEqual(keys, [...countries, 'EU', 'DEFAULT']);
    for (const row of b.items) {
      assert.deepEqual(Object.keys(row).sort(), ROW_KEYS);
      assert.equal(row.overridden, false);
      assert.equal(row.updatedAt, null);
      assert.equal(row.updatedBy, null);
      assert.deepEqual(row.builtin, builtin(row.country));
      const { builtin: _b, overridden: _o, updatedAt: _u, updatedBy: _ub, ...price } = row;
      assert.deepEqual(price, builtin(row.country));
    }
  });

  it('defaultTrialDays follows the pricing.trialDays setting', async () => {
    await s.request('PATCH', '/v1/admin/settings', { token: admin, body: { values: { 'pricing.trialDays': 14 } } });
    assert.equal((await list()).defaultTrialDays, 14);
    await s.request('PATCH', '/v1/admin/settings', { token: admin, body: { values: { 'pricing.trialDays': null } } });
    assert.equal((await list()).defaultTrialDays, 7);
  });
});

describe('PUT /v1/admin/prices/:country', () => {
  it('overrides a built-in row with its format; audit and config follow; DELETE restores the default', async () => {
    const c = await call('PUT', '/v1/admin/prices/DE', { currency: 'EUR', monthly: 249, yearly: 1199, lifetime: 1799 });
    assert.equal(c.res.status, 200, c.res.text);
    assert.deepEqual(Object.keys(c.res.body).sort(), ['item', 'warnings']);
    const item = c.res.body.item;
    assert.equal(item.country, 'DE');
    assert.equal(item.monthly, 249);
    assert.equal(item.overridden, true);
    assert.deepEqual(item.format, builtin('DE').format);
    assert.deepEqual(item.builtin, builtin('DE'));
    assert.equal(item.updatedAt, iso(s.clock.now()));
    assert.deepEqual(item.updatedBy, { id: adminUser.id, publicId: adminUser.public_id, displayName: null });
    assert.deepEqual(c.res.body.warnings, []);
    const after1 = { country: 'DE', currency: 'EUR', monthly: 249, yearly: 1199, lifetime: 1799, trialDays: null, format: builtin('DE').format };
    oneAudit(c.audit, 'price.update', 'DE', { country: 'DE', before: null, after: after1 });
    assert.equal((await resolved('DE')).monthly, 249);
    assert.equal((await resolved('AT')).monthly, 199);

    const again = await call('PUT', '/v1/admin/prices/DE', { currency: 'EUR', monthly: 299, yearly: 1199, lifetime: 1799, trialDays: 14 });
    assert.equal(again.res.status, 200);
    oneAudit(again.audit, 'price.update', 'DE', { country: 'DE', before: after1, after: { ...after1, monthly: 299, trialDays: 14 } });

    const del = await call('DELETE', '/v1/admin/prices/DE');
    assert.equal(del.res.status, 204);
    oneAudit(del.audit, 'price.delete', 'DE', { country: 'DE', before: { ...after1, monthly: 299, trialDays: 14 } });
    assert.deepEqual(await resolved('DE'), builtin('DE'));
    const row = (await list()).items.find((r) => r.country === 'DE');
    assert.equal(row.overridden, false);
    const missing = await call('DELETE', '/v1/admin/prices/DE');
    assert.equal(missing.res.status, 404);
    assert.equal(missing.audit.length, 0);
  });

  it('adds an override-only country (PL) with the currency format; deleting it falls back to DEFAULT', async () => {
    const c = await call('PUT', '/v1/admin/prices/PL', { currency: 'PLN', monthly: 899, yearly: 4499, lifetime: 6499 });
    assert.equal(c.res.status, 200, c.res.text);
    assert.equal(c.res.body.item.builtin, null);
    assert.deepEqual(c.res.body.item.format, CURRENCY_FORMATS.PLN);
    oneAudit(c.audit, 'price.update', 'PL');
    const keys = (await list()).items.map((r) => r.country);
    assert.ok(keys.indexOf('PL') > keys.indexOf('NO') && keys.indexOf('PL') < keys.indexOf('SE'), keys.join(','));
    assert.deepEqual(keys.slice(-2), ['EU', 'DEFAULT']);
    assert.equal((await resolved('PL')).country, 'PL');
    assert.equal((await resolved('PL')).currency, 'PLN');
    await call('DELETE', '/v1/admin/prices/PL');
    assert.equal((await resolved('PL')).country, 'DEFAULT');
    assert.ok(!(await list()).items.some((r) => r.country === 'PL'));
  });

  it('EU and DEFAULT can be overridden too; an EU alias follows the EU override', async () => {
    const eu = await call('PUT', '/v1/admin/prices/EU', { currency: 'EUR', monthly: 149, yearly: 799, lifetime: 1299 });
    assert.equal(eu.res.status, 200, eu.res.text);
    assert.equal((await resolved('IT')).monthly, 149);
    const def = await call('PUT', '/v1/admin/prices/DEFAULT', { currency: 'USD', monthly: 99, yearly: 599, lifetime: 999 });
    assert.equal(def.res.status, 200);
    assert.deepEqual((await resolved('BR')).format, builtin('DEFAULT').format);
    assert.equal((await resolved('BR')).monthly, 99);
    await call('DELETE', '/v1/admin/prices/EU');
    await call('DELETE', '/v1/admin/prices/DEFAULT');
  });

  it('an explicit format is kept; an unknown currency needs one', async () => {
    const noFormat = await call('PUT', '/v1/admin/prices/BR', { currency: 'BRL', monthly: 990, yearly: 4990, lifetime: 7990 });
    assert.equal(noFormat.res.status, 400);
    assert.deepEqual(noFormat.res.body.error.fields, { format: 'required' });
    assert.equal(noFormat.audit.length, 0);
    const format = { ...CURRENCY_FORMATS.EUR, symbol: 'R$', position: 'before', space: true };
    const ok = await call('PUT', '/v1/admin/prices/BR', { currency: 'BRL', monthly: 990, yearly: 4990, lifetime: 7990, format });
    assert.equal(ok.res.status, 200, ok.res.text);
    assert.deepEqual(ok.res.body.item.format, format);
    assert.deepEqual((await resolved('BR')).format, format);
    // A built-in country switching currency takes that currency's format.
    const ch = await call('PUT', '/v1/admin/prices/CH', { currency: 'EUR', monthly: 199, yearly: 999, lifetime: 1499 });
    assert.deepEqual(ch.res.body.item.format, CURRENCY_FORMATS.EUR);
    await call('DELETE', '/v1/admin/prices/BR');
    await call('DELETE', '/v1/admin/prices/CH');
  });

  it("checks the currency's decimals: 0 for JPY, KRW, CLP, VND, ISK, 2 otherwise", async () => {
    const twoDecimals = { ...CURRENCY_FORMATS.USD, symbol: '₩' };
    const zeroDecimals = { ...twoDecimals, decimals: 0 };
    const krwBad = await call('PUT', '/v1/admin/prices/KR', { currency: 'KRW', monthly: 2900, yearly: 14900, lifetime: 22000, format: twoDecimals });
    assert.equal(krwBad.res.status, 400);
    assert.deepEqual(krwBad.res.body.error.fields, { format: 'invalid' });
    const krw = await call('PUT', '/v1/admin/prices/KR', { currency: 'KRW', monthly: 2900, yearly: 14900, lifetime: 22000, format: zeroDecimals });
    assert.equal(krw.res.status, 200, krw.res.text);
    const eurBad = await call('PUT', '/v1/admin/prices/FR', { currency: 'EUR', monthly: 199, yearly: 999, lifetime: 1499, format: { ...CURRENCY_FORMATS.EUR, decimals: 0 } });
    assert.deepEqual(eurBad.res.body.error.fields, { format: 'invalid' });
    const jpy = await call('PUT', '/v1/admin/prices/JP', { currency: 'JPY', monthly: 400, yearly: 1800, lifetime: 2600 });
    assert.equal(jpy.res.status, 200, jpy.res.text);
    assert.equal(jpy.res.body.item.format.decimals, 0);
    await call('DELETE', '/v1/admin/prices/KR');
    await call('DELETE', '/v1/admin/prices/JP');
  });

  it('warns (never blocks) when yearly ≥ 12 × monthly or lifetime ≤ yearly', async () => {
    const both = await call('PUT', '/v1/admin/prices/US', { currency: 'USD', monthly: 100, yearly: 1200, lifetime: 1200 });
    assert.equal(both.res.status, 200);
    assert.deepEqual(both.res.body.warnings, ['yearly_not_cheaper', 'lifetime_not_above_yearly']);
    const one = await call('PUT', '/v1/admin/prices/US', { currency: 'USD', monthly: 100, yearly: 1199, lifetime: 1000 });
    assert.deepEqual(one.res.body.warnings, ['lifetime_not_above_yearly']);
    const none = await call('PUT', '/v1/admin/prices/US', { currency: 'USD', monthly: 100, yearly: 1199, lifetime: 1200 });
    assert.deepEqual(none.res.body.warnings, []);
    await call('DELETE', '/v1/admin/prices/US');
  });

  it('validates the body; the key must be ISO2, EU or DEFAULT', async () => {
    const cases: Array<[Record<string, unknown>, Record<string, string>]> = [
      [{}, { currency: 'required', monthly: 'required', yearly: 'required', lifetime: 'required' }],
      [{ currency: 'eur', monthly: 199, yearly: 999, lifetime: 1499 }, { currency: 'invalid' }],
      [{ currency: 'EUR', monthly: 1.99, yearly: 999, lifetime: 1499 }, { monthly: 'invalid' }],
      [{ currency: 'EUR', monthly: '199', yearly: 999, lifetime: 1499 }, { monthly: 'invalid' }],
      [{ currency: 'EUR', monthly: 0, yearly: 999, lifetime: 1499 }, { monthly: 'out_of_range' }],
      [{ currency: 'EUR', monthly: 199, yearly: 100_000_001, lifetime: 1499 }, { yearly: 'out_of_range' }],
      [{ currency: 'EUR', monthly: 199, yearly: 999, lifetime: 1499, trialDays: 31 }, { trialDays: 'out_of_range' }],
      [{ currency: 'EUR', monthly: 199, yearly: 999, lifetime: 1499, trialDays: '7' }, { trialDays: 'invalid' }],
      [{ currency: 'EUR', monthly: 199, yearly: 999, lifetime: 1499, format: { symbol: '€' } }, { format: 'invalid' }],
      [{ currency: 'EUR', monthly: 199, yearly: 999, lifetime: 1499, format: { ...CURRENCY_FORMATS.EUR, group: ',' } }, { format: 'invalid' }],
    ];
    for (const [body, fields] of cases) {
      const c = await call('PUT', '/v1/admin/prices/AT', body);
      assert.equal(c.res.status, 400, JSON.stringify(body));
      assert.equal(c.res.body.error.code, 'validation_failed');
      assert.deepEqual(c.res.body.error.fields, fields, JSON.stringify(body));
      assert.equal(c.audit.length, 0);
    }
    for (const key of ['de', 'DEU', 'D1', 'eu', 'Default']) {
      const res = await s.request('PUT', `/v1/admin/prices/${key}`, { token: admin, body: { currency: 'EUR', monthly: 199, yearly: 999, lifetime: 1499 } });
      assert.equal(res.status, 404, key);
    }
    assert.equal(count(s.db, 'SELECT count(*) AS n FROM country_prices'), 0);
  });
});

describe('POST /v1/admin/prices/reset', () => {
  it('needs { confirm: true } and removes every override', async () => {
    for (const body of [{}, { confirm: false }, { confirm: 'yes' }]) {
      const c = await call('POST', '/v1/admin/prices/reset', body);
      assert.equal(c.res.status, 400, JSON.stringify(body));
      assert.equal(c.audit.length, 0);
    }
    await call('PUT', '/v1/admin/prices/DE', { currency: 'EUR', monthly: 249, yearly: 1199, lifetime: 1799 });
    await call('PUT', '/v1/admin/prices/PL', { currency: 'PLN', monthly: 899, yearly: 4499, lifetime: 6499 });
    const c = await call('POST', '/v1/admin/prices/reset', { confirm: true });
    assert.equal(c.res.status, 200, c.res.text);
    assert.deepEqual(c.res.body, { removed: 2 });
    oneAudit(c.audit, 'price.reset', null, { removed: 2 });
    assert.equal(count(s.db, 'SELECT count(*) AS n FROM country_prices'), 0);
    assert.deepEqual(await resolved('DE'), builtin('DE'));
    assert.equal((await resolved('PL')).country, 'DEFAULT');
    const empty = await call('POST', '/v1/admin/prices/reset', { confirm: true });
    assert.deepEqual(empty.res.body, { removed: 0 });
    oneAudit(empty.audit, 'price.reset', null, { removed: 0 });
  });
});
