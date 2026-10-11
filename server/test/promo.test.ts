import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { DAY } from '../src/clock.ts';
import { count, startTestServer, type TestServer } from './helpers.ts';

let s: TestServer;
let admin: string;
before(async () => {
  s = await startTestServer();
  admin = await s.adminToken();
});
after(() => s.close());

const create = async (body: Record<string, unknown>) => {
  const res = await s.request('POST', '/v1/admin/promo-codes', { token: admin, body });
  assert.equal(res.status, 201, res.text);
  return res.body.promoCode;
};
const redeem = (token: string, code: string) => s.request('POST', '/v1/promo/redeem', { token, body: { code } });

describe('POST /v1/promo/redeem', () => {
  it('redeems a code (guests allowed) and returns the plan and the grant', async () => {
    await create({ code: 'WELCOME-2026', plan: 'monthly', durationDays: 30 });
    const g = await s.guest();
    const res = await redeem(g.token, 'welcome 2026');
    assert.equal(res.status, 200);
    assert.equal(res.body.plan.plan, 'monthly');
    assert.equal(res.body.plan.source, 'promo');
    assert.equal(res.body.plan.promoCode, 'WELCOME-2026');
    assert.equal(res.body.plan.isPro, true);
    assert.equal(res.body.grant.source, 'promo');
    assert.equal(res.body.grant.promoCode, 'WELCOME-2026');
    assert.equal(Date.parse(res.body.grant.endsAt) - s.clock.now(), 30 * DAY);
    assert.equal(res.body.entitlements.length, 1);
  });

  it('stacks promo days after an active gift (not after store subscriptions)', async () => {
    await create({ code: 'STACK-30', plan: 'monthly', durationDays: 30 });
    const a = await s.account('stack@example.com');
    const gift = await s.request('POST', `/v1/admin/users/${a.user.id}/grants`, { token: admin, body: { plan: 'monthly', durationDays: 10, reason: 'Base gift' } });
    assert.equal(gift.status, 201);
    const res = await redeem(a.token, 'STACK-30');
    assert.equal(res.status, 200);
    assert.equal(Date.parse(res.body.grant.endsAt) - s.clock.now(), 40 * DAY);
    assert.equal(Date.parse(res.body.plan.expiresAt) - s.clock.now(), 40 * DAY);
  });

  it('double redemption by the same user → 409 promo_already_redeemed', async () => {
    await create({ code: 'ONCE-ONLY', plan: 'yearly' });
    const g = await s.guest();
    assert.equal((await redeem(g.token, 'ONCE-ONLY')).status, 200);
    const twice = await redeem(g.token, 'once only');
    assert.equal(twice.status, 409);
    assert.equal(twice.body.error.code, 'promo_already_redeemed');
    assert.equal(count(s.db, "SELECT redemption_count AS n FROM promo_codes WHERE code = 'ONCE-ONLY'"), 1);
  });

  it('invalid, inactive, scheduled and expired codes', async () => {
    const g = await s.guest();
    assert.equal((await redeem(g.token, 'NO-SUCH-CODE')).body.error.code, 'promo_invalid');
    assert.equal((await redeem(g.token, 'x')).body.error.code, 'promo_invalid');
    await create({ code: 'SLEEPING', plan: 'monthly', active: false });
    assert.equal((await redeem(g.token, 'SLEEPING')).body.error.code, 'promo_invalid');
    await create({ code: 'LATER-ON', plan: 'monthly', startsAt: new Date(s.clock.now() + DAY).toISOString() });
    const scheduled = await redeem(g.token, 'LATER-ON');
    assert.equal(scheduled.status, 400);
    assert.equal(scheduled.body.error.code, 'promo_invalid');
    await create({ code: 'SHORT-LIVED', plan: 'monthly', expiresAt: new Date(s.clock.now() + DAY).toISOString() });
    s.clock.advance(2 * DAY);
    const expired = await redeem(g.token, 'SHORT-LIVED');
    assert.equal(expired.status, 400);
    assert.equal(expired.body.error.code, 'promo_expired');
  });

  it('exhausted: max 1 with two users', async () => {
    await create({ code: 'JUST-ONE', plan: 'monthly', maxRedemptions: 1 });
    const a = await s.guest();
    const b = await s.guest();
    assert.equal((await redeem(a.token, 'JUST-ONE')).status, 200);
    const second = await redeem(b.token, 'JUST-ONE');
    assert.equal(second.status, 400);
    assert.equal(second.body.error.code, 'promo_exhausted');
    assert.equal(count(s.db, "SELECT redemption_count AS n FROM promo_codes WHERE code = 'JUST-ONE'"), 1);
    assert.equal(count(s.db, "SELECT count(*) AS n FROM grants WHERE user_id = ?", b.user.id), 0);
  });

  it('already_lifetime', async () => {
    await create({ code: 'FOREVER', plan: 'lifetime' });
    await create({ code: 'ONE-MORE-MONTH', plan: 'monthly' });
    const g = await s.guest();
    assert.equal((await redeem(g.token, 'FOREVER')).body.plan.plan, 'lifetime');
    const more = await redeem(g.token, 'ONE-MORE-MONTH');
    assert.equal(more.status, 409);
    assert.equal(more.body.error.code, 'already_lifetime');
  });

  it('redeem_disabled', async () => {
    await s.request('PATCH', '/v1/admin/settings', { token: admin, body: { values: { 'promo.redeemEnabled': false } } });
    const g = await s.guest();
    const res = await redeem(g.token, 'WELCOME-2026');
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'redeem_disabled');
    assert.equal((await s.request('GET', '/v1/config')).body.features.redeemCodes, false);
    await s.request('PATCH', '/v1/admin/settings', { token: admin, body: { values: { 'promo.redeemEnabled': null } } });
  });

  it('is rate limited per user (10 / h)', async () => {
    const t = await startTestServer({ env: { RATE_LIMITS: 'on' } });
    try {
      const g = await t.guest();
      const statuses: number[] = [];
      for (let i = 0; i < 10; i++) statuses.push((await t.request('POST', '/v1/promo/redeem', { token: g.token, body: { code: 'NOPE-CODE' } })).status);
      assert.deepEqual(statuses, Array(10).fill(400));
      const limited = await t.request('POST', '/v1/promo/redeem', { token: g.token, body: { code: 'NOPE-CODE' } });
      assert.equal(limited.status, 429);
      assert.equal(limited.body.error.code, 'rate_limited');
      assert.ok(Number(limited.headers.get('retry-after')) > 0);
    } finally {
      await t.close();
    }
  });
});
