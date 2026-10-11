/**
 * Admin promo codes (spec 2.10, 3.4, 4.6): create custom and generated codes, code_taken,
 * validation, the derived status and its list filter, the detail with redemptions, the patch rules
 * (promo_in_use, max below the count) and deletion of used and unused codes.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { DAY, HOUR, iso } from '../src/clock.ts';
import { getUserByEmail, type UserRow } from '../src/domain/users.ts';
import { count, rows, startTestServer, tracked, type AuditRow, type TestServer } from './helpers.ts';

const PROMO_KEYS = [
  'active', 'code', 'createdAt', 'createdBy', 'description', 'durationDays', 'expiresAt', 'id', 'maxRedemptions', 'plan',
  'redemptionCount', 'startsAt', 'status', 'updatedAt',
];
const GENERATED = /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;

let s: TestServer;
let admin: string;
let adminUser: UserRow;
before(async () => {
  s = await startTestServer();
  admin = await s.adminToken();
  adminUser = getUserByEmail(s.db, 'root@example.com')!;
});
after(() => s.close());

const now = () => s.clock.now();
const at = (ms: number) => new Date(now() + ms).toISOString();

async function call(method: string, path: string, body?: unknown) {
  const t = await tracked(s, () => s.request(method, path, { token: admin, body }));
  assert.deepEqual(t.mail, []);
  return { res: t.result, audit: t.audit };
}

function oneAudit(audit: AuditRow[], action: string, promo: { id: number; code: string }, details?: Record<string, unknown>) {
  assert.equal(audit.length, 1, 'exactly one audit row');
  const a = audit[0]!;
  assert.equal(a.action, action);
  assert.equal(a.actor_id, adminUser.id);
  assert.equal(a.actor_label, adminUser.public_id);
  assert.equal(a.target_type, 'promo_code');
  assert.equal(a.target_id, String(promo.id));
  assert.equal(a.target_label, promo.code);
  assert.equal(a.target_user_id, null);
  const parsed = JSON.parse(a.details) as Record<string, unknown>;
  if (details) assert.deepEqual(parsed, details);
  return parsed;
}

async function create(body: Record<string, unknown>) {
  const res = await s.request('POST', '/v1/admin/promo-codes', { token: admin, body });
  assert.equal(res.status, 201, res.text);
  return res.body.promoCode;
}

const redeem = async (code: string, token?: string) => {
  const t = token ?? (await s.guest()).token;
  const res = await s.request('POST', '/v1/promo/redeem', { token: t, body: { code } });
  assert.equal(res.status, 200, res.text);
  return res.body;
};

describe('POST /v1/admin/promo-codes', () => {
  it('creates a custom code (normalized) and audits it', async () => {
    const startsAt = at(-HOUR);
    const expiresAt = at(30 * DAY);
    const c = await call('POST', '/v1/admin/promo-codes', {
      code: '  spring   sale 2026! ', plan: 'monthly', durationDays: 14, maxRedemptions: 50, description: ' Spring newsletter ',
      startsAt, expiresAt,
    });
    assert.equal(c.res.status, 201, c.res.text);
    const p = c.res.body.promoCode;
    assert.deepEqual(Object.keys(c.res.body), ['promoCode']);
    assert.deepEqual(Object.keys(p).sort(), PROMO_KEYS);
    assert.equal(p.code, 'SPRING-SALE-2026');
    assert.equal(p.plan, 'monthly');
    assert.equal(p.durationDays, 14);
    assert.equal(p.maxRedemptions, 50);
    assert.equal(p.redemptionCount, 0);
    assert.equal(p.startsAt, startsAt);
    assert.equal(p.expiresAt, expiresAt);
    assert.equal(p.active, true);
    assert.equal(p.status, 'active');
    assert.equal(p.description, 'Spring newsletter');
    assert.deepEqual(p.createdBy, { id: adminUser.id, publicId: adminUser.public_id, displayName: null });
    assert.equal(p.createdAt, iso(now()));
    oneAudit(c.audit, 'promo.create', p, { code: 'SPRING-SALE-2026', plan: 'monthly', durationDays: 14, maxRedemptions: 50 });
  });

  it('generates XXXX-XXXX-XXXX codes; durations default like grants; lifetime has none', async () => {
    const y = await call('POST', '/v1/admin/promo-codes', { plan: 'yearly' });
    assert.equal(y.res.status, 201, y.res.text);
    assert.match(y.res.body.promoCode.code, GENERATED);
    assert.equal(y.res.body.promoCode.durationDays, 365);
    assert.equal(y.res.body.promoCode.maxRedemptions, null);
    assert.equal(y.res.body.promoCode.description, '');
    oneAudit(y.audit, 'promo.create', y.res.body.promoCode, {
      code: y.res.body.promoCode.code, plan: 'yearly', durationDays: 365, maxRedemptions: null,
    });
    assert.equal((await create({ plan: 'monthly' })).durationDays, 30);
    const l = await create({ plan: 'lifetime', code: null });
    assert.match(l.code, GENERATED);
    assert.equal(l.durationDays, null);
    const codes = new Set([y.res.body.promoCode.code, l.code]);
    for (let i = 0; i < 5; i++) codes.add((await create({ plan: 'monthly' })).code);
    assert.equal(codes.size, 7);
  });

  it('a duplicate code is 409 code_taken (after normalization)', async () => {
    await create({ code: 'TAKEN-CODE', plan: 'monthly' });
    const dup = await call('POST', '/v1/admin/promo-codes', { code: 'taken code', plan: 'yearly' });
    assert.equal(dup.res.status, 409);
    assert.equal(dup.res.body.error.code, 'code_taken');
    assert.equal(dup.audit.length, 0);
  });

  it('validates every field', async () => {
    const cases: [Record<string, unknown>, Record<string, string>][] = [
      [{}, { plan: 'required' }],
      [{ plan: 'free' }, { plan: 'invalid' }],
      [{ plan: 'monthly', code: 'ab' }, { code: 'too_short' }],
      [{ plan: 'monthly', code: '!!a-b!!' }, { code: 'too_short' }],
      [{ plan: 'monthly', code: 'X'.repeat(33) }, { code: 'too_long' }],
      [{ plan: 'monthly', code: 1234 }, { code: 'invalid' }],
      [{ plan: 'lifetime', durationDays: 30 }, { durationDays: 'not_allowed' }],
      [{ plan: 'monthly', durationDays: 0 }, { durationDays: 'out_of_range' }],
      [{ plan: 'monthly', durationDays: 3651 }, { durationDays: 'out_of_range' }],
      [{ plan: 'monthly', durationDays: '30' }, { durationDays: 'invalid' }],
      [{ plan: 'monthly', maxRedemptions: 0 }, { maxRedemptions: 'out_of_range' }],
      [{ plan: 'monthly', maxRedemptions: 1_000_001 }, { maxRedemptions: 'out_of_range' }],
      [{ plan: 'monthly', description: 'd'.repeat(201) }, { description: 'too_long' }],
      [{ plan: 'monthly', description: 'two\nlines' }, { description: 'invalid' }],
      [{ plan: 'monthly', startsAt: 'soon' }, { startsAt: 'invalid_date' }],
      [{ plan: 'monthly', startsAt: at(2 * DAY), expiresAt: at(DAY) }, { expiresAt: 'out_of_range' }],
      [{ plan: 'monthly', active: 'yes' }, { active: 'invalid' }],
    ];
    for (const [body, fields] of cases) {
      const c = await call('POST', '/v1/admin/promo-codes', body);
      assert.equal(c.res.status, 400, JSON.stringify(body));
      assert.equal(c.res.body.error.code, 'validation_failed');
      assert.deepEqual(c.res.body.error.fields, fields, JSON.stringify(body));
      assert.equal(c.audit.length, 0);
    }
    // The limits themselves are fine.
    const edge = await create({ plan: 'monthly', code: 'ABCD', durationDays: 3650, maxRedemptions: 1_000_000, description: 'd'.repeat(200) });
    assert.equal(edge.code, 'ABCD');
    assert.equal((await create({ plan: 'yearly', code: 'Y'.repeat(32), maxRedemptions: null })).code.length, 32);
  });
});

describe('GET /v1/admin/promo-codes', () => {
  before(async () => {
    await create({ code: 'STU-ACTIVE', plan: 'monthly', description: 'status test' });
    await create({ code: 'STU-SCHEDULED', plan: 'monthly', startsAt: at(DAY), description: 'status test' });
    await create({ code: 'STU-EXPIRED', plan: 'monthly', expiresAt: at(-DAY), description: 'status test' });
    await create({ code: 'STU-EXHAUSTED', plan: 'monthly', maxRedemptions: 1, description: 'status test' });
    await redeem('STU-EXHAUSTED');
    await create({ code: 'STU-INACTIVE', plan: 'yearly', active: false, description: 'status test' });
    // Derivation order: !active wins over expired; expired wins over exhausted.
    await create({ code: 'STU-INACTIVE-EXPIRED', plan: 'yearly', active: false, expiresAt: at(-DAY), description: 'status test' });
    const both = await create({ code: 'STU-EXHAUSTED-EXPIRED', plan: 'monthly', maxRedemptions: 1, description: 'status test' });
    await redeem('STU-EXHAUSTED-EXPIRED');
    const patched = await s.request('PATCH', `/v1/admin/promo-codes/${both.id}`, { token: admin, body: { expiresAt: at(-HOUR) } });
    assert.equal(patched.status, 200, patched.text);
  });

  const list = async (query: string) => {
    const res = await s.request('GET', `/v1/admin/promo-codes?${query}`, { token: admin });
    assert.equal(res.status, 200, res.text);
    return res.body as { items: any[]; total: number; limit: number; offset: number };
  };
  const codes = async (status: string) => (await list(`status=${status}&q=STU-&limit=100`)).items.map((p) => p.code).sort();

  it('filters by the derived status', async () => {
    assert.deepEqual(await codes('active'), ['STU-ACTIVE']);
    assert.deepEqual(await codes('scheduled'), ['STU-SCHEDULED']);
    assert.deepEqual(await codes('expired'), ['STU-EXHAUSTED-EXPIRED', 'STU-EXPIRED']);
    assert.deepEqual(await codes('exhausted'), ['STU-EXHAUSTED']);
    assert.deepEqual(await codes('inactive'), ['STU-INACTIVE', 'STU-INACTIVE-EXPIRED']);
    assert.equal((await codes('all')).length, 7);
    for (const status of ['active', 'scheduled', 'expired', 'exhausted', 'inactive']) {
      for (const p of (await list(`status=${status}&limit=100`)).items) assert.equal(p.status, status, p.code);
    }
  });

  it('the status follows the clock', async () => {
    const t = await startTestServer();
    try {
      const token = await t.adminToken();
      const res = await t.request('POST', '/v1/admin/promo-codes', {
        token, body: { code: 'LATER-CODE', plan: 'monthly', startsAt: at(DAY), expiresAt: at(3 * DAY) },
      });
      const id = res.body.promoCode.id;
      const status = async () => (await t.request('GET', `/v1/admin/promo-codes/${id}`, { token })).body.promoCode.status;
      assert.equal(await status(), 'scheduled');
      t.clock.advance(2 * DAY);
      assert.equal(await status(), 'active');
      t.clock.advance(DAY);
      assert.equal(await status(), 'expired');
    } finally {
      await t.close();
    }
  });

  it('searches code and description, newest first, with offset pagination', async () => {
    const all = await list('q=status%20test&limit=100');
    assert.equal(all.total, 7);
    const created = all.items.map((p) => [Date.parse(p.createdAt), p.id]);
    assert.deepEqual(all.items.map((p) => p.id), [...created].sort((a, b) => b[0]! - a[0]! || b[1]! - a[1]!).map((x) => x[1]));
    const page = await list('q=stu-&limit=3&offset=3');
    assert.equal(page.total, 7);
    assert.equal(page.limit, 3);
    assert.equal(page.offset, 3);
    assert.deepEqual(page.items.map((p) => p.id), all.items.slice(3, 6).map((p) => p.id));
    assert.equal((await list('q=%25')).total, 0);
    const defaults = await list('');
    assert.equal(defaults.limit, 25);
    assert.equal(defaults.offset, 0);
  });

  it('rejects unknown statuses and bad paging', async () => {
    for (const query of ['status=used', 'limit=0', 'limit=101', 'offset=x']) {
      const res = await s.request('GET', `/v1/admin/promo-codes?${query}`, { token: admin });
      assert.equal(res.status, 400, query);
      assert.equal(res.body.error.code, 'validation_failed');
    }
  });
});

describe('GET /v1/admin/promo-codes/:id', () => {
  it('returns the code and its redemptions, newest first', async () => {
    const p = await create({ code: 'DETAIL-CODE', plan: 'monthly' });
    const account = await s.account('detail.redeemer@example.com', undefined, { displayName: 'Detail Redeemer' });
    await redeem('DETAIL-CODE', account.token);
    s.clock.advance(HOUR);
    const guest = await s.guest();
    const r2 = await redeem('DETAIL-CODE', guest.token);
    const res = await s.request('GET', `/v1/admin/promo-codes/${p.id}`, { token: admin });
    assert.equal(res.status, 200, res.text);
    assert.deepEqual(Object.keys(res.body).sort(), ['promoCode', 'redemptions']);
    assert.equal(res.body.promoCode.redemptionCount, 2);
    const [newest, oldest] = res.body.redemptions;
    assert.deepEqual(newest.user, { id: guest.user.id, publicId: guest.user.publicId, displayName: null, email: null });
    assert.equal(newest.redeemedAt, iso(now()));
    assert.equal(newest.grantId, Number(r2.grant.id.replace('grant:', '')));
    assert.equal(newest.grantStatus, 'active');
    assert.deepEqual(oldest.user, { id: account.user.id, publicId: account.user.publicId, displayName: 'Detail Redeemer', email: 'detail.redeemer@example.com' });
    for (const id of ['999999', 'abc', '0']) {
      const missing = await s.request('GET', `/v1/admin/promo-codes/${id}`, { token: admin });
      assert.equal(missing.status, 404, id);
    }
  });
});

describe('PATCH /v1/admin/promo-codes/:id', () => {
  it('changes anything on an unused code and audits before/after', async () => {
    const p = await create({ code: 'PATCH-UNUSED', plan: 'monthly', durationDays: 30, description: 'Old' });
    s.clock.advance(1000);
    const c = await call('PATCH', `/v1/admin/promo-codes/${p.id}`, { plan: 'yearly', durationDays: 90, description: 'New', maxRedemptions: 10 });
    assert.equal(c.res.status, 200, c.res.text);
    const after = c.res.body.promoCode;
    assert.equal(after.code, 'PATCH-UNUSED');
    assert.equal(after.plan, 'yearly');
    assert.equal(after.durationDays, 90);
    assert.equal(after.description, 'New');
    assert.equal(after.maxRedemptions, 10);
    assert.equal(after.updatedAt, iso(now()));
    const details = oneAudit(c.audit, 'promo.update', after);
    assert.deepEqual(details, {
      before: { plan: 'monthly', durationDays: 30, maxRedemptions: null, description: 'Old' },
      after: { plan: 'yearly', durationDays: 90, maxRedemptions: 10, description: 'New' },
    });
    const lifetime = await call('PATCH', `/v1/admin/promo-codes/${p.id}`, { plan: 'lifetime' });
    assert.equal(lifetime.res.body.promoCode.durationDays, null);
    const back = await call('PATCH', `/v1/admin/promo-codes/${p.id}`, { plan: 'monthly' });
    assert.equal(back.res.body.promoCode.durationDays, 30);
    // The code itself cannot change.
    const renamed = await call('PATCH', `/v1/admin/promo-codes/${p.id}`, { code: 'OTHER-CODE', active: false });
    assert.equal(renamed.res.body.promoCode.code, 'PATCH-UNUSED');
    assert.equal(renamed.res.body.promoCode.status, 'inactive');
  });

  it('plan and duration are frozen once redeemed (promo_in_use); max must stay ≥ the count', async () => {
    const p = await create({ code: 'PATCH-USED', plan: 'monthly', durationDays: 30, maxRedemptions: 5 });
    const user = await s.guest();
    const redeemed = await redeem('PATCH-USED', user.token);
    await redeem('PATCH-USED');
    const grantId = Number(redeemed.grant.id.replace('grant:', ''));
    const grantBefore = rows(s.db, 'SELECT * FROM grants WHERE id = ?', grantId)[0];

    for (const body of [{ plan: 'yearly' }, { durationDays: 60 }, { plan: 'lifetime' }]) {
      const c = await call('PATCH', `/v1/admin/promo-codes/${p.id}`, body);
      assert.equal(c.res.status, 409, JSON.stringify(body));
      assert.equal(c.res.body.error.code, 'promo_in_use');
      assert.equal(c.audit.length, 0);
    }
    const below = await call('PATCH', `/v1/admin/promo-codes/${p.id}`, { maxRedemptions: 1 });
    assert.equal(below.res.status, 400);
    assert.deepEqual(below.res.body.error.fields, { maxRedemptions: 'out_of_range' });
    assert.equal(below.audit.length, 0);

    const ok = await call('PATCH', `/v1/admin/promo-codes/${p.id}`, {
      maxRedemptions: 2, description: 'Closed early', expiresAt: at(HOUR), active: false,
    });
    assert.equal(ok.res.status, 200, ok.res.text);
    assert.equal(ok.res.body.promoCode.maxRedemptions, 2);
    assert.equal(ok.res.body.promoCode.status, 'inactive');
    oneAudit(ok.audit, 'promo.update', ok.res.body.promoCode);
    const reactivated = await call('PATCH', `/v1/admin/promo-codes/${p.id}`, { active: true });
    assert.equal(reactivated.res.body.promoCode.status, 'exhausted');
    // Same plan and duration are not a change.
    assert.equal((await call('PATCH', `/v1/admin/promo-codes/${p.id}`, { plan: 'monthly', durationDays: 30 })).res.status, 200);
    const custom = await create({ code: 'PATCH-USED-45', plan: 'monthly', durationDays: 45 });
    await redeem('PATCH-USED-45');
    const samePlan = await call('PATCH', `/v1/admin/promo-codes/${custom.id}`, { plan: 'monthly', description: 'Same plan' });
    assert.equal(samePlan.res.status, 200, samePlan.res.text);
    assert.equal(samePlan.res.body.promoCode.durationDays, 45, 'an unchanged plan keeps its duration');
    // Grants already issued are untouched.
    assert.deepEqual(rows(s.db, 'SELECT * FROM grants WHERE id = ?', grantId)[0], grantBefore);
  });

  it('validates like create; unknown ids are 404', async () => {
    const p = await create({ code: 'PATCH-VALIDATE', plan: 'monthly', startsAt: at(DAY) });
    for (const [body, fields] of [
      [{ durationDays: 0 }, { durationDays: 'out_of_range' }],
      [{ expiresAt: at(HOUR) }, { expiresAt: 'out_of_range' }],
      [{ maxRedemptions: -1 }, { maxRedemptions: 'out_of_range' }],
      [{ plan: 'weekly' }, { plan: 'invalid' }],
      [{ description: 7 }, { description: 'invalid' }],
    ] as const) {
      const c = await call('PATCH', `/v1/admin/promo-codes/${p.id}`, body);
      assert.equal(c.res.status, 400, JSON.stringify(body));
      assert.deepEqual(c.res.body.error.fields, fields, JSON.stringify(body));
    }
    assert.equal((await call('PATCH', '/v1/admin/promo-codes/999999', { description: 'x' })).res.status, 404);
  });
});

describe('DELETE /v1/admin/promo-codes/:id', () => {
  it('deletes unused codes; used codes are 409 promo_in_use', async () => {
    const unused = await create({ code: 'DELETE-ME', plan: 'monthly' });
    const c = await call('DELETE', `/v1/admin/promo-codes/${unused.id}`);
    assert.equal(c.res.status, 204);
    assert.equal(c.res.text, '');
    oneAudit(c.audit, 'promo.delete', unused, { code: 'DELETE-ME' });
    assert.equal((await s.request('GET', `/v1/admin/promo-codes/${unused.id}`, { token: admin })).status, 404);
    assert.equal((await call('DELETE', `/v1/admin/promo-codes/${unused.id}`)).res.status, 404);

    const used = await create({ code: 'KEEP-ME', plan: 'monthly' });
    await redeem('KEEP-ME');
    const refused = await call('DELETE', `/v1/admin/promo-codes/${used.id}`);
    assert.equal(refused.res.status, 409);
    assert.equal(refused.res.body.error.code, 'promo_in_use');
    assert.equal(refused.audit.length, 0);
    assert.equal(count(s.db, "SELECT count(*) AS n FROM promo_codes WHERE code = 'KEEP-ME'"), 1);
  });
});
