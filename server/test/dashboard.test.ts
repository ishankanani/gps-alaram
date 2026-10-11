/**
 * GET /v1/admin/dashboard on the demo seed (spec 2.10, 6.7): 40 users, 20 Pro (store 14, grant 3,
 * promo 3; monthly 7, yearly 9, lifetime 4), 2 trials, 1 disabled, mrrUsd equal to the sum from
 * the seed constants, and the signupsByDay series. Expectations are computed from DEMO_USERS and
 * DEMO_PROMOS with the seed's own time formulas.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { DAY, iso, MINUTE } from '../src/clock.ts';
import { DEMO_ADMIN_PASSWORD, DEMO_PASSWORD, DEMO_PROMOS, DEMO_USERS, usdPrice, type DemoUser } from '../src/seed/demo.ts';
import { insertStoreSubscription, startTestServer, T0, type TestServer } from './helpers.ts';

let s: TestServer;
let token: string;
before(async () => {
  s = await startTestServer();
  await s.seed();
  const res = await s.signIn('admin@example.com', DEMO_ADMIN_PASSWORD);
  assert.equal(res.status, 200, res.text);
  token = res.body.token;
});
after(() => s.close());

const dashboard = async (query = '') => {
  const res = await s.request('GET', `/v1/admin/dashboard${query}`, { token });
  assert.equal(res.status, 200, res.text);
  return res.body;
};

// ---- Expectations from the seed constants (6.7) ----

const now = T0;
const created = (u: DemoUser, index: number) => now - u.joined * DAY - (index + 1) * 7 * MINUTE;
const seen = (u: DemoUser, index: number) => Math.max(created(u, index), now - u.seen * DAY - (index % 5) * 11 * MINUTE);

function isPro(u: DemoUser): boolean {
  const s = u.setup;
  if (s.kind === 'store') return s.status !== 'expired' && (s.ends === null || Math.max(s.ends, s.graceUntil ?? -Infinity) > 0);
  if (s.kind === 'grant') return s.days === null || s.days > s.daysAgo;
  if (s.kind === 'promo') {
    const p = DEMO_PROMOS.find((x) => x.code === s.code)!;
    return p.durationDays === null || p.durationDays > s.daysAgo;
  }
  return false;
}

function expectedMrr(): number {
  let mrr = 0;
  for (const u of DEMO_USERS) {
    const s = u.setup;
    if (s.kind !== 'store' || !isPro(u) || s.status === 'trialing' || s.plan === 'lifetime') continue;
    mrr += s.plan === 'monthly' ? usdPrice(s.price, s.currency) : usdPrice(s.price, s.currency) / 12;
  }
  return Math.round(mrr * 100) / 100;
}

describe('GET /v1/admin/dashboard on the demo seed', () => {
  it('counts users: 40 = 30 accounts + 2 admins + 8 guests; 1 disabled', async () => {
    const d = await dashboard();
    assert.equal(d.generatedAt, iso(now));
    const createdSince = (t: number) => DEMO_USERS.filter((u, i) => created(u, i) >= t).length;
    const seenSince = (t: number) => DEMO_USERS.filter((u, i) => seen(u, i) >= t).length;
    assert.deepEqual(d.users, {
      total: 40,
      accounts: 32,
      guests: 8,
      admins: 2,
      disabled: 1,
      new: { today: createdSince(Math.floor(now / DAY) * DAY), last7d: createdSince(now - 7 * DAY), last30d: createdSince(now - 30 * DAY) },
      active: { last1d: seenSince(now - DAY), last7d: seenSince(now - 7 * DAY), last30d: seenSince(now - 30 * DAY) },
    });
    assert.equal(d.users.new.today, 1);
  });

  it('counts Pro: 20 (store 14, grant 3, promo 3; monthly 7, yearly 9, lifetime 4), 2 trials', async () => {
    const d = await dashboard();
    assert.equal(DEMO_USERS.filter(isPro).length, 20, 'the expectation helper agrees with 6.7');
    assert.deepEqual(d.pro, {
      total: 20,
      share: 0.5,
      trials: 2,
      bySource: { store: 14, grant: 3, promo: 3 },
      byPlan: { monthly: 7, yearly: 9, lifetime: 4 },
    });
  });

  it('store: active, renewing, billing issues, MRR from the seed constants, lifetime purchases', async () => {
    const d = await dashboard();
    const live = DEMO_USERS.filter((u) => u.setup.kind === 'store' && isPro(u));
    const renewing = live.filter((u) => u.setup.kind === 'store' && u.setup.willRenew).length;
    assert.equal(live.length, 14);
    assert.equal(renewing, 10);
    assert.deepEqual(d.store, {
      active: 14,
      renewing: 10,
      billingIssues: 1,
      mrrUsd: expectedMrr(),
      lifetime30d: 1,
      sandboxActive: 0,
    });
    // Spelled out: Jonas, Anna (EUR 1.99), Elsa (SEK 25), Haruto (JPY 300) monthly; Lena, Oliver, Laura, Freja, Emily yearly / 12.
    const manual = 2 * 1.99 * 1.16 + 25 * 0.105 + 300 * 0.0067 + (9.99 * 1.16 + 8.99 * 1.34 + 11 * 1.24 + 79 * 0.155 + 9.99) / 12;
    assert.equal(d.store.mrrUsd, Math.round(manual * 100) / 100);
  });

  it('promo codes: 4 active codes, 2 redemptions in 30 days', async () => {
    const d = await dashboard();
    assert.deepEqual(d.promo, { activeCodes: 4, redemptions30d: 2 });
  });

  it('signupsByDay: 30 UTC days by default, oldest first; 7 and 90 on request; other values 400', async () => {
    const d = await dashboard();
    assert.equal(d.signupsByDay.length, 30);
    const today = Math.floor(now / DAY) * DAY;
    const expected = Array.from({ length: 30 }, (_, i) => {
      const day = today - (29 - i) * DAY;
      const users = DEMO_USERS.filter((u, idx) => created(u, idx) >= day && created(u, idx) < day + DAY);
      return { date: iso(day).slice(0, 10), guests: users.filter((u) => u.email === null).length, accounts: users.filter((u) => u.email !== null).length };
    });
    assert.deepEqual(d.signupsByDay, expected);
    assert.equal(d.signupsByDay[29].date, '2026-10-10');
    assert.equal(d.signupsByDay[0].date, '2026-09-11');
    const total = d.signupsByDay.reduce((n: number, x: any) => n + x.guests + x.accounts, 0);
    assert.equal(total, DEMO_USERS.filter((u, i) => created(u, i) >= today - 29 * DAY).length);

    assert.equal((await dashboard('?days=7')).signupsByDay.length, 7);
    const ninety = await dashboard('?days=90');
    assert.equal(ninety.signupsByDay.length, 90);
    assert.deepEqual(ninety.signupsByDay.slice(60), expected, 'days only changes the series length');
    assert.deepEqual({ ...ninety, signupsByDay: [], recentAudit: [] }, { ...d, signupsByDay: [], recentAudit: [] });
    for (const days of ['14', '0', 'abc']) {
      const res = await s.request('GET', `/v1/admin/dashboard?days=${days}`, { token });
      assert.equal(res.status, 400, days);
      assert.deepEqual(res.body.error.fields, { days: 'invalid' });
    }
  });

  it('countries (top 10), app versions (last 30 days), webhooks and recent audit', async () => {
    const d = await dashboard();
    const byCountry = new Map<string, { users: number; pro: number }>();
    for (const u of DEMO_USERS) {
      const c = byCountry.get(u.country) ?? { users: 0, pro: 0 };
      c.users++;
      if (isPro(u)) c.pro++;
      byCountry.set(u.country, c);
    }
    const top = [...byCountry.entries()]
      .map(([country, c]) => ({ country, ...c }))
      .sort((a, b) => b.users - a.users || (a.country < b.country ? -1 : 1))
      .slice(0, 10);
    assert.deepEqual(d.countries, top);
    assert.deepEqual(d.countries[0], { country: 'DE', users: 13, pro: 4 });

    // Every seeded device was seen within 30 days (users 4, 9 and 24 run 0.9.4), plus the admin's sign-in just now.
    const devices = DEMO_USERS.reduce((n, u) => n + (u.devices ?? 1), 0);
    assert.deepEqual(d.appVersions, [{ version: '1.0.0', devices: devices - 3 + 1 }, { version: '0.9.4', devices: 3 }]);

    assert.deepEqual(d.webhooks, { configured: true, lastEventAt: iso(now - DAY + 2_000), errors24h: 0, unmatched7d: 0 });

    assert.equal(d.recentAudit.length, 10);
    assert.equal(d.recentAudit[0].action, 'admin.sign_in');
    assert.deepEqual(d.recentAudit.slice(1).map((a: any) => a.action), [
      'settings.update', 'promo.create', 'note.create', 'user.disable', 'note.create', 'grant.create', 'user.role', 'price.update', 'grant.create',
    ]);
    assert.equal(d.recentAudit[1].actor.displayName, 'Alex Admin');
  });

  it('excludes merged users; sandbox subscriptions count only as sandboxActive', async () => {
    const before_ = await dashboard();
    const g = await s.guest();
    assert.equal((await dashboard()).users.total, 41);
    const signIn = await s.signIn('lena.weber@example.com', DEMO_PASSWORD, { token: g.token });
    assert.equal(signIn.status, 200, signIn.text);
    const after_ = await dashboard();
    assert.equal(after_.users.total, 40);
    assert.equal(after_.users.guests, 8);

    const tester = await s.account('sandbox.tester@example.com');
    const id = insertStoreSubscription(s.db, tester.user.id, s.clock.now(), { plan: 'monthly' });
    s.db.prepare("UPDATE store_subscriptions SET environment = 'sandbox', price_usd = 1.99 WHERE id = ?").run(id);
    const sandbox = await dashboard();
    assert.equal(sandbox.store.sandboxActive, 1);
    assert.equal(sandbox.store.active, before_.store.active);
    assert.equal(sandbox.store.mrrUsd, before_.store.mrrUsd);
  });

  it('webhooks.configured is false without the secret', async () => {
    const t = await startTestServer({ env: { REVENUECAT_WEBHOOK_SECRET: '' } });
    try {
      const admin = await t.adminToken();
      const d = (await t.request('GET', '/v1/admin/dashboard', { token: admin })).body;
      assert.deepEqual(d.webhooks, { configured: false, lastEventAt: null, errors24h: 0, unmatched7d: 0 });
      assert.equal(d.users.total, 1);
      assert.equal(d.pro.share, 0);
      assert.equal(d.store.mrrUsd, 0);
    } finally {
      await t.close();
    }
  });
});
