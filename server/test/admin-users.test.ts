/**
 * Admin users (spec 2.10, 3.3, 4.5, 4.6): search, filters, sorts, pagination, the detail, and every
 * mutation. Each mutation writes exactly one audit row (right action, target and details, never an
 * email address) and sends no email; a refused mutation writes none.
 *
 * Reads run against the demo seed (6.7), whose users are known; mutations run on a fresh server.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';

import { DAY, HOUR, iso, MINUTE } from '../src/clock.ts';
import { DEMO_ADMIN_PASSWORD, DEMO_USERS, demoUserId } from '../src/seed/demo.ts';
import { getUserByEmail, type UserRow } from '../src/domain/users.ts';
import {
  count, insertStoreSubscription, PASSWORD, rows, startTestServer, tracked, type AuditRow, type Session, type TestServer,
} from './helpers.ts';

const LIST_ITEM_KEYS = [
  'country', 'createdAt', 'displayName', 'email', 'id', 'kind', 'language', 'lastSeenAt', 'notesCount', 'plan', 'planExpiresAt',
  'planSource', 'publicId', 'role', 'status', 'trial', 'willRenew',
];
const ADMIN_USER_KEYS = [
  ...LIST_ITEM_KEYS, 'activeSessions', 'disabledAt', 'disabledReason', 'emailVerified', 'mergedInto', 'passwordSet', 'signedUpAt',
].sort();

const demo = (key: string) => {
  const u = DEMO_USERS.find((x) => x.key === key)!;
  return { ...u, id: demoUserId(u.publicId) };
};

// ---------------------------------------------------------------------------------------------
// Reads on the demo seed
// ---------------------------------------------------------------------------------------------

describe('GET /v1/admin/users on the demo seed', () => {
  let d: TestServer;
  let token: string;
  before(async () => {
    d = await startTestServer();
    await d.seed();
    const res = await d.signIn('admin@example.com', DEMO_ADMIN_PASSWORD);
    assert.equal(res.status, 200, res.text);
    token = res.body.token;
  });
  after(() => d.close());

  const list = async (query: string) => {
    const res = await d.request('GET', `/v1/admin/users${query ? `?${query}` : ''}`, { token });
    assert.equal(res.status, 200, `${query}: ${res.text}`);
    return res.body as { items: any[]; total: number; limit: number; offset: number };
  };
  const ids = async (query: string) => (await list(`${query}${query ? '&' : ''}limit=100`)).items.map((u) => u.publicId).sort();

  it('lists 25 of 40 by default, newest first, with the list item shape', async () => {
    const body = await list('');
    assert.equal(body.total, 40);
    assert.equal(body.limit, 25);
    assert.equal(body.offset, 0);
    assert.equal(body.items.length, 25);
    assert.deepEqual(Object.keys(body.items[0]).sort(), LIST_ITEM_KEYS);
    const created = body.items.map((u) => Date.parse(u.createdAt));
    assert.deepEqual(created, [...created].sort((a, b) => b - a));
    for (const secret of ['password', 'token', 'hash']) assert.ok(!JSON.stringify(body).includes(secret));
  });

  it('shows plan fields only while Pro (lifetime has no end)', async () => {
    const all = (await list('limit=100')).items;
    const byId = (key: string) => all.find((u) => u.publicId === demo(key).publicId)!;
    const lena = byId('1');
    assert.equal(lena.plan, 'yearly');
    assert.equal(lena.planSource, 'store');
    assert.equal(lena.willRenew, true);
    assert.equal(lena.planExpiresAt, iso(d.clock.now() + 165 * DAY));
    const hannah = byId('5');
    assert.equal(hannah.plan, 'lifetime');
    assert.equal(hannah.planSource, 'grant');
    assert.equal(hannah.planExpiresAt, null);
    const mia = byId('3');
    assert.equal(mia.trial, true);
    for (const key of ['4', '9', '11', '6']) {
      const u = byId(key);
      assert.equal(u.plan, 'free', key);
      assert.equal(u.planSource, null, key);
      assert.equal(u.planExpiresAt, null, key);
      assert.equal(u.willRenew, false, key);
    }
    assert.equal(byId('11').status, 'disabled');
    assert.equal(byId('31').kind, 'guest');
    assert.equal(byId('1').notesCount, 1);
    assert.equal(byId('6').notesCount, 0);
  });

  it('filters: plan, source, kind, role, status, country', async () => {
    const counts: Array<[string, number]> = [
      ['plan=pro', 20], ['plan=free', 20], ['plan=trial', 2], ['plan=monthly', 7], ['plan=yearly', 9], ['plan=lifetime', 4],
      ['source=store', 14], ['source=grant', 3], ['source=promo', 3],
      ['kind=guest', 8], ['kind=account', 32], ['role=admin', 2], ['role=user', 38],
      ['status=active', 39], ['status=disabled', 1], ['status=merged', 0],
      ['country=DE', 13], ['country=at', 3], ['country=AT&plan=pro', 1], ['kind=guest&plan=pro', 0],
      ['source=grant&plan=lifetime', 1], ['source=store&plan=trial', 2], ['plan=free&kind=account', 12],
    ];
    for (const [query, n] of counts) assert.equal((await list(query)).total, n, query);
    assert.deepEqual(await ids('status=disabled'), [demo('11').publicId]);
    assert.deepEqual(await ids('source=grant&plan=lifetime'), [demo('5').publicId]);
    assert.deepEqual(await ids('plan=trial'), [demo('3').publicId, demo('23').publicId].sort());
    // source implies Pro: the expired store user (Lukas) and the expired grant (Maximilian) are not listed.
    assert.ok(!(await ids('source=store')).includes(demo('4').publicId));
    assert.ok(!(await ids('source=grant')).includes(demo('9').publicId));
  });

  it('rejects unknown filter values', async () => {
    for (const [query, field] of [['plan=gold', 'plan'], ['source=gift', 'source'], ['kind=bot', 'kind'], ['role=owner', 'role'],
      ['status=deleted', 'status'], ['country=DEU', 'country'], ['sort=name', 'sort'], ['order=up', 'order']] as const) {
      const res = await d.request('GET', `/v1/admin/users?${query}`, { token });
      assert.equal(res.status, 400, query);
      assert.equal(res.body.error.code, 'validation_failed');
      assert.equal(res.body.error.fields[field], 'invalid', query);
    }
  });

  it('sorts by created, lastSeen, email, planUntil and publicId in both orders', async () => {
    const all = async (sort: string, order: string) => (await list(`sort=${sort}&order=${order}&limit=100`)).items;
    const monotonic = (values: number[], dir: 'asc' | 'desc') =>
      values.every((v, i) => i === 0 || (dir === 'asc' ? values[i - 1]! <= v : values[i - 1]! >= v));

    for (const order of ['asc', 'desc'] as const) {
      assert.ok(monotonic((await all('created', order)).map((u) => Date.parse(u.createdAt)), order), `created ${order}`);
      assert.ok(monotonic((await all('lastSeen', order)).map((u) => Date.parse(u.lastSeenAt)), order), `lastSeen ${order}`);
    }
    const byPublicId = (await all('publicId', 'asc')).map((u) => u.publicId);
    assert.deepEqual(byPublicId, [...byPublicId].sort());
    assert.equal(byPublicId[0], 'SW-0KT7-NPC6');
    assert.deepEqual((await all('publicId', 'desc')).map((u) => u.publicId), [...byPublicId].reverse());

    const emails = (await list('sort=email&order=asc&kind=account&limit=100')).items.map((u) => u.email);
    assert.deepEqual(emails, [...emails].sort());
    assert.equal(emails[0], 'aarav.sharma@example.com');

    // planUntil: the effective end; free (NULL) sorts lowest, lifetime highest.
    const desc = await all('planUntil', 'desc');
    assert.deepEqual(desc.slice(0, 4).map((u) => u.plan), ['lifetime', 'lifetime', 'lifetime', 'lifetime']);
    assert.equal(desc[4].publicId, demo('25').publicId); // Emily: store yearly, +345 d
    const ends = desc.slice(4, 20).map((u) => Date.parse(u.planExpiresAt));
    assert.ok(monotonic(ends, 'desc'));
    assert.ok(desc.slice(20).every((u) => u.plan === 'free'));
    const asc = await all('planUntil', 'asc');
    assert.ok(asc.slice(0, 20).every((u) => u.plan === 'free'));
    assert.equal(asc[20].publicId, demo('23').publicId); // Camille: trial ends +2 d
    assert.deepEqual(asc.slice(36).map((u) => u.plan), ['lifetime', 'lifetime', 'lifetime', 'lifetime']);
  });

  it('paginates with limit and offset, and reports the total', async () => {
    const full = (await list('sort=publicId&order=asc&limit=100')).items.map((u) => u.publicId);
    const pages: string[] = [];
    for (let offset = 0; offset < 40; offset += 15) {
      const page = await list(`sort=publicId&order=asc&limit=15&offset=${offset}`);
      assert.equal(page.total, 40);
      assert.equal(page.limit, 15);
      assert.equal(page.offset, offset);
      pages.push(...page.items.map((u) => u.publicId));
    }
    assert.deepEqual(pages, full);
    const beyond = await list('offset=500');
    assert.equal(beyond.items.length, 0);
    assert.equal(beyond.total, 40);
    for (const [query, field, error] of [
      ['limit=0', 'limit', 'out_of_range'], ['limit=101', 'limit', 'out_of_range'], ['limit=ten', 'limit', 'invalid'],
      ['offset=-1', 'offset', 'invalid'], ['offset=100001', 'offset', 'out_of_range'],
    ] as const) {
      const res = await d.request('GET', `/v1/admin/users?${query}`, { token });
      assert.equal(res.status, 400, query);
      assert.equal(res.body.error.fields[field], error, query);
    }
  });

  it('searches public ids in every form normalization accepts', async () => {
    const claire = demo('15'); // SW-W601-PW95
    for (const q of ['SW-W601-PW95', 'sw w6o1 pw95', 'sww6olpw95', 'SW W6OI-PW95', 'W601-PW95', 'w601pw95', 'w6o1-pw95']) {
      assert.deepEqual(await ids(`q=${encodeURIComponent(q)}`), [claire.publicId], q);
    }
    // A sw… prefix with at least 4 characters matches the start of the id.
    assert.deepEqual(await ids(`q=${encodeURIComponent('sw-w601')}`), [claire.publicId]);
    assert.deepEqual(await ids(`q=${encodeURIComponent('SW W601 P')}`), [claire.publicId]);
    assert.deepEqual(await ids('q=sw7k3p'), [demo('1').publicId]);
    assert.equal((await list(`q=${encodeURIComponent('SW-ZZZZ-ZZZZ')}`)).total, 0);
  });

  it('searches emails, names (case-insensitive), Play order ids and UUIDs', async () => {
    assert.deepEqual(await ids('q=lena.weber%40example.com'), [demo('1').publicId]);
    assert.deepEqual(await ids('q=weber%40'), [demo('1').publicId]);
    assert.equal((await list('q=%40example.com')).total, 32);
    assert.deepEqual(await ids(`q=${encodeURIComponent('müller')}`), [demo('2').publicId]);
    assert.deepEqual(await ids('q=JONAS'), [demo('2').publicId]);
    assert.deepEqual(await ids('q=Smith'), [demo('16').publicId]);
    // Exactly 8 characters: also tried as a public id, OR'ed with the email/name search.
    assert.deepEqual(await ids('q=hoffmann'), [demo('7').publicId]);
    assert.deepEqual(await ids(`q=${encodeURIComponent('GPA.3391-4210-7766-00001')}`), [demo('1').publicId]);
    assert.deepEqual(await ids(`q=${encodeURIComponent('gpa.3391-4210-7766-00012')}`), [demo('12').publicId]);
    assert.equal((await list(`q=${encodeURIComponent('GPA.3391-4210-7766')}`)).total, 15);
    assert.deepEqual(await ids(`q=${demo('19').id}`), [demo('19').publicId]);
    assert.deepEqual(await ids(`q=${demo('19').id.toUpperCase()}`), [demo('19').publicId]);
  });

  it('escapes LIKE wildcards and limits q to 100 characters', async () => {
    assert.equal((await list('q=%25')).total, 0);
    assert.equal((await list('q=_')).total, 0);
    assert.equal((await list(`q=${encodeURIComponent('\\')}`)).total, 0);
    const long = await d.request('GET', `/v1/admin/users?q=${'a'.repeat(101)}`, { token });
    assert.equal(long.status, 400);
    assert.equal(long.body.error.fields.q, 'too_long');
  });

  it('GET /:id returns the detail by UUID and by public id', async () => {
    const lena = demo('1');
    const byUuid = await d.request('GET', `/v1/admin/users/${lena.id}`, { token });
    assert.equal(byUuid.status, 200);
    const detail = byUuid.body;
    assert.deepEqual(Object.keys(detail).sort(), ['audit', 'devices', 'grants', 'notes', 'plan', 'redemptions', 'storeEvents', 'storeSubscriptions', 'user']);
    assert.deepEqual(Object.keys(detail.user).sort(), ADMIN_USER_KEYS);
    assert.equal(detail.user.publicId, lena.publicId);
    assert.equal(detail.user.passwordSet, true);
    assert.equal(detail.user.activeSessions, 1);
    assert.equal(detail.plan.plan, 'yearly');
    assert.equal(detail.plan.source, 'store');
    assert.equal(detail.storeSubscriptions.length, 1);
    assert.equal(detail.storeSubscriptions[0].originalTransactionId, 'GPA.3391-4210-7766-00001');
    assert.equal(detail.devices.length, 1);
    assert.deepEqual(detail.notes.map((n: any) => n.body), ['Asked about Wear OS support; told her the watch is planned.']);
    assert.deepEqual(detail.grants, []);
    assert.deepEqual(detail.redemptions, []);

    for (const ref of [lena.publicId, 'sw7k3p92qx', 'SW 7K3P 92QX', '7k3p-92qx', lena.id.toUpperCase()]) {
      const res = await d.request('GET', `/v1/admin/users/${encodeURIComponent(ref)}`, { token });
      assert.equal(res.status, 200, ref);
      assert.equal(res.body.user.id, lena.id, ref);
    }
    assert.ok(!JSON.stringify(detail).includes('hash'));
  });

  it('the detail lists grants, redemptions, notes, audit and store events', async () => {
    const liam = (await d.request('GET', `/v1/admin/users/${demo('26').publicId}`, { token })).body;
    assert.equal(liam.grants.length, 1);
    assert.equal(liam.grants[0].status, 'active');
    assert.equal(liam.grants[0].createdBy.publicId, demo('A2').publicId);
    assert.deepEqual(liam.audit.map((a: any) => a.action), ['note.create', 'grant.create']);
    const max = (await d.request('GET', `/v1/admin/users/${demo('9').publicId}`, { token })).body;
    assert.equal(max.grants[0].status, 'expired');
    assert.equal(max.plan.isPro, false);
    const sanne = (await d.request('GET', `/v1/admin/users/${demo('13').publicId}`, { token })).body;
    assert.deepEqual(sanne.redemptions.map((r: any) => [r.code, r.grantStatus]), [['WELCOME-2026', 'active']]);
    assert.equal(sanne.plan.promoCode, 'WELCOME-2026');
    const jonas = (await d.request('GET', `/v1/admin/users/${demo('2').publicId}`, { token })).body;
    assert.deepEqual(jonas.storeEvents.map((e: any) => [e.type, e.status]), [['RENEWAL', 'processed']]);
    const emma = (await d.request('GET', `/v1/admin/users/${demo('7').publicId}`, { token })).body;
    assert.equal(emma.devices.length, 2);
    const noah = (await d.request('GET', `/v1/admin/users/${demo('11').publicId}`, { token })).body;
    assert.equal(noah.user.status, 'disabled');
    assert.equal(noah.user.disabledReason, 'Promo code abuse with several guest accounts');
  });

  it('unknown users are 404', async () => {
    for (const ref of [randomUUID(), 'SW-ZZZZ-ZZZZ', 'abc', 'not%20a%20valid!%20id']) {
      const res = await d.request('GET', `/v1/admin/users/${ref}`, { token });
      assert.equal(res.status, 404, ref);
      assert.equal(res.body.error.code, 'not_found');
    }
  });
});

// ---------------------------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------------------------

let s: TestServer;
let admin: string;
let adminUser: UserRow;
let seq = 0;

before(async () => {
  s = await startTestServer();
  admin = await s.adminToken();
  adminUser = getUserByEmail(s.db, 'root@example.com')!;
});
after(() => s.close());

type Call = { res: Awaited<ReturnType<TestServer['request']>>; audit: AuditRow[]; requestId: string };

/** An admin request; checks that it sent no email and returns the audit rows it wrote. */
async function call(method: string, path: string, body?: unknown, token = admin): Promise<Call> {
  const requestId = `admin-users-${String(++seq).padStart(5, '0')}`;
  const t = await tracked(s, () => s.request(method, path, { token, body, headers: { 'X-Request-Id': requestId } }));
  assert.deepEqual(t.mail, [], `${method} ${path} sends no email`);
  return { res: t.result, audit: t.audit, requestId };
}

/** Exactly one audit row with the right action, actor, target and details (no email addresses). */
function oneAudit(
  c: Call,
  e: { action: string; type: string; id: string | number | null; userId: string | null; label?: string | null; details?: Record<string, unknown> },
  actor: UserRow = adminUser,
): Record<string, unknown> {
  assert.equal(c.audit.length, 1, `exactly one audit row (${c.res.status} ${c.res.text})`);
  const a = c.audit[0]!;
  assert.equal(a.action, e.action);
  assert.equal(a.actor_id, actor.id);
  assert.equal(a.actor_label, actor.public_id);
  assert.equal(a.target_type, e.type);
  assert.equal(a.target_id, e.id === null ? null : String(e.id));
  assert.equal(a.target_user_id, e.userId);
  if (e.label !== undefined) assert.equal(a.target_label, e.label);
  assert.equal(a.ip, '127.0.0.1');
  assert.equal(a.request_id, c.requestId);
  assert.ok(!a.details.includes('@'), `no email address in ${a.details}`);
  const details = JSON.parse(a.details) as Record<string, unknown>;
  if (e.details) assert.deepEqual(details, e.details);
  return details;
}

function refused(c: Call, status: number, code: string): void {
  assert.equal(c.res.status, status, c.res.text);
  assert.equal(c.res.body.error.code, code);
  assert.equal(c.audit.length, 0, 'a refused mutation writes no audit row');
}

const now = () => s.clock.now();
let emailSeq = 0;
const newAccount = (name = 'user'): Promise<Session> => s.account(`${name}.${++emailSeq}@example.com`);
const grantOf = (id: number) => rows<{ revoked_at: number | null; revoke_reason: string | null; ends_at: number | null }>(s.db, 'SELECT * FROM grants WHERE id = ?', id)[0]!;

async function giveGrant(user: Session, body: Record<string, unknown>): Promise<any> {
  const res = await s.request('POST', `/v1/admin/users/${user.user.id}/grants`, { token: admin, body: { reason: 'Setup grant', ...body } });
  assert.equal(res.status, 201, res.text);
  return res.body.grant;
}

describe('PATCH /v1/admin/users/:id', () => {
  it('updates the name, country and language; the audit lists the field names only', async () => {
    const u = await newAccount();
    const c = await call('PATCH', `/v1/admin/users/${u.user.publicId}`, { displayName: '  Ada   Lovelace ', country: 'GB', language: 'en' });
    assert.equal(c.res.status, 200, c.res.text);
    assert.deepEqual(Object.keys(c.res.body), ['user']);
    assert.deepEqual(Object.keys(c.res.body.user).sort(), ADMIN_USER_KEYS);
    assert.equal(c.res.body.user.displayName, 'Ada Lovelace');
    assert.equal(c.res.body.user.country, 'GB');
    assert.equal(c.res.body.user.language, 'en');
    oneAudit(c, {
      action: 'user.update', type: 'user', id: u.user.id, userId: u.user.id, label: u.user.publicId,
      details: { fields: ['displayName', 'country', 'language'] },
    });
    const cleared = await call('PATCH', `/v1/admin/users/${u.user.id}`, { displayName: null, country: null });
    assert.equal(cleared.res.body.user.displayName, null);
    assert.equal(cleared.res.body.user.country, null);
    oneAudit(cleared, { action: 'user.update', type: 'user', id: u.user.id, userId: u.user.id, details: { fields: ['displayName', 'country'] } });
  });

  it('changes the email of accounts only; unique; clears verification', async () => {
    const u = await newAccount();
    const other = await newAccount('taken');
    s.db.prepare('UPDATE users SET email_verified_at = ? WHERE id = ?').run(now(), u.user.id);
    const c = await call('PATCH', `/v1/admin/users/${u.user.id}`, { email: '  New.Address@Example.com ' });
    assert.equal(c.res.status, 200, c.res.text);
    assert.equal(c.res.body.user.email, 'new.address@example.com');
    assert.equal(c.res.body.user.emailVerified, false);
    oneAudit(c, { action: 'user.update', type: 'user', id: u.user.id, userId: u.user.id, details: { fields: ['email'] } });
    refused(await call('PATCH', `/v1/admin/users/${u.user.id}`, { email: other.user.email }), 409, 'email_taken');
    const g = await s.guest();
    refused(await call('PATCH', `/v1/admin/users/${g.user.id}`, { email: 'guest@example.com' }), 409, 'not_an_account');
  });

  it('validates every field', async () => {
    const u = await newAccount();
    const c = await call('PATCH', `/v1/admin/users/${u.user.id}`, { displayName: 'x'.repeat(61), country: 'gb', language: 'xx', email: 'nope' });
    refused(c, 400, 'validation_failed');
    assert.deepEqual(c.res.body.error.fields, { displayName: 'too_long', country: 'invalid', language: 'invalid', email: 'invalid_email' });
    refused(await call('PATCH', `/v1/admin/users/${randomUUID()}`, { displayName: 'Nobody' }), 404, 'not_found');
  });
});

describe('POST /v1/admin/users/:id/grants', () => {
  it('defaults to 30 days (monthly) and 365 days (yearly); lifetime has no end', async () => {
    const u = await newAccount();
    const m = await call('POST', `/v1/admin/users/${u.user.id}/grants`, { plan: 'monthly', reason: 'Support gesture' });
    assert.equal(m.res.status, 201, m.res.text);
    const g = m.res.body.grant;
    assert.deepEqual(Object.keys(m.res.body).sort(), ['grant', 'plan']);
    assert.equal(g.kind, 'grant');
    assert.equal(g.source, 'admin');
    assert.equal(g.plan, 'monthly');
    assert.equal(g.status, 'active');
    assert.equal(g.startsAt, iso(now()));
    assert.equal(g.endsAt, iso(now() + 30 * DAY));
    assert.equal(g.reason, 'Support gesture');
    assert.equal(g.promoCode, null);
    assert.deepEqual(g.createdBy, { id: adminUser.id, publicId: adminUser.public_id, displayName: null });
    assert.equal(g.revokedAt, null);
    assert.equal(m.res.body.plan.plan, 'monthly');
    assert.equal(m.res.body.plan.source, 'grant');
    assert.equal(m.res.body.plan.expiresAt, g.endsAt);
    oneAudit(m, {
      action: 'grant.create', type: 'grant', id: g.id, userId: u.user.id, label: u.user.publicId,
      details: { grantId: g.id, plan: 'monthly', endsAt: g.endsAt, reason: 'Support gesture' },
    });

    // A grant stands on its own: it does not stack on the monthly one.
    const y = await call('POST', `/v1/admin/users/${u.user.id}/grants`, { plan: 'yearly', reason: 'Press copy' });
    assert.equal(y.res.body.grant.endsAt, iso(now() + 365 * DAY));
    assert.equal(y.res.body.plan.plan, 'yearly');
    oneAudit(y, { action: 'grant.create', type: 'grant', id: y.res.body.grant.id, userId: u.user.id });

    const l = await call('POST', `/v1/admin/users/${u.user.id}/grants`, { plan: 'lifetime', reason: 'Beta tester' });
    assert.equal(l.res.status, 201);
    assert.equal(l.res.body.grant.endsAt, null);
    assert.equal(l.res.body.plan.plan, 'lifetime');
    assert.equal(l.res.body.plan.expiresAt, null);
    oneAudit(l, {
      action: 'grant.create', type: 'grant', id: l.res.body.grant.id, userId: u.user.id,
      details: { grantId: l.res.body.grant.id, plan: 'lifetime', endsAt: null, reason: 'Beta tester' },
    });
  });

  it('takes durationDays or endsAt; reasons become single-line', async () => {
    const u = await newAccount();
    const a = await call('POST', `/v1/admin/users/${u.user.publicId.toLowerCase()}/grants`, { plan: 'monthly', durationDays: 10, reason: 'Line one\nline two' });
    assert.equal(a.res.status, 201, a.res.text);
    assert.equal(a.res.body.grant.endsAt, iso(now() + 10 * DAY));
    assert.equal(a.res.body.grant.reason, 'Line one line two');
    const end = now() + 2 * DAY + 3 * HOUR;
    const b = await call('POST', `/v1/admin/users/${u.user.id}/grants`, { plan: 'yearly', endsAt: new Date(end).toISOString(), reason: 'Exact end' });
    assert.equal(b.res.body.grant.endsAt, iso(end));
    const c = await call('POST', `/v1/admin/users/${u.user.id}/grants`, { plan: 'monthly', endsAt: '2026-12-01T12:00:00+02:00', reason: 'Offset end' });
    assert.equal(c.res.body.grant.endsAt, '2026-12-01T10:00:00.000Z');
  });

  it('rejects invalid combinations without writing anything', async () => {
    const u = await newAccount();
    const at = (ms: number) => new Date(now() + ms).toISOString();
    const cases: Array<[Record<string, unknown>, Record<string, string>]> = [
      [{ plan: 'lifetime', durationDays: 10 }, { durationDays: 'not_allowed' }],
      [{ plan: 'lifetime', endsAt: at(5 * DAY) }, { endsAt: 'not_allowed' }],
      [{ plan: 'monthly', durationDays: 10, endsAt: at(5 * DAY) }, { endsAt: 'not_allowed' }],
      [{ plan: 'monthly', endsAt: at(-DAY) }, { endsAt: 'in_past' }],
      [{ plan: 'monthly', endsAt: at(30 * MINUTE) }, { endsAt: 'out_of_range' }],
      [{ plan: 'yearly', endsAt: at(11 * 365 * DAY) }, { endsAt: 'out_of_range' }],
      [{ plan: 'monthly', durationDays: 0 }, { durationDays: 'out_of_range' }],
      [{ plan: 'monthly', durationDays: 3651 }, { durationDays: 'out_of_range' }],
      [{ plan: 'monthly', durationDays: 1.5 }, { durationDays: 'invalid' }],
      [{ plan: 'monthly', endsAt: 'next week' }, { endsAt: 'invalid_date' }],
      [{ plan: 'free' }, { plan: 'invalid' }],
      [{}, { plan: 'required' }],
    ];
    for (const [body, fields] of cases) {
      const c = await call('POST', `/v1/admin/users/${u.user.id}/grants`, { ...body, reason: 'Valid reason' });
      refused(c, 400, 'validation_failed');
      assert.deepEqual(c.res.body.error.fields, fields, JSON.stringify(body));
    }
    for (const [reason, error] of [[undefined, 'required'], ['ok', 'too_short'], ['x'.repeat(501), 'too_long'], [42, 'invalid']] as const) {
      const c = await call('POST', `/v1/admin/users/${u.user.id}/grants`, { plan: 'monthly', reason });
      refused(c, 400, 'validation_failed');
      assert.deepEqual(c.res.body.error.fields, { reason: error });
    }
    assert.equal(count(s.db, 'SELECT count(*) AS n FROM grants WHERE user_id = ?', u.user.id), 0);
    refused(await call('POST', `/v1/admin/users/${randomUUID()}/grants`, { plan: 'monthly', reason: 'Nobody' }), 404, 'not_found');
  });
});

describe('POST /v1/admin/users/:id/plan', () => {
  it('revokes every active grant (admin and promo), then adds one new grant', async () => {
    const u = await newAccount();
    const expired = await giveGrant(u, { plan: 'monthly', durationDays: 1 });
    s.clock.advance(2 * DAY);
    const gift = await giveGrant(u, { plan: 'monthly', durationDays: 10 });
    const promo = await s.request('POST', '/v1/admin/promo-codes', { token: admin, body: { code: 'PLAN-CHANGE-1', plan: 'monthly', durationDays: 30 } });
    assert.equal(promo.status, 201);
    const redeemed = await s.request('POST', '/v1/promo/redeem', { token: u.token, body: { code: 'PLAN-CHANGE-1' } });
    assert.equal(redeemed.status, 200);
    const promoGrantId = Number(redeemed.body.grant.id.replace('grant:', ''));

    const c = await call('POST', `/v1/admin/users/${u.user.id}/plan`, { plan: 'yearly', reason: 'Upgrade after complaint' });
    assert.equal(c.res.status, 200, c.res.text);
    assert.deepEqual(Object.keys(c.res.body).sort(), ['grant', 'plan', 'revokedGrantIds', 'warnings']);
    assert.deepEqual([...c.res.body.revokedGrantIds].sort((a: number, b: number) => a - b), [gift.id, promoGrantId].sort((a, b) => a - b));
    assert.deepEqual(c.res.body.warnings, []);
    const g = c.res.body.grant;
    assert.equal(g.plan, 'yearly');
    assert.equal(g.source, 'admin');
    assert.equal(g.endsAt, iso(now() + 365 * DAY));
    assert.equal(c.res.body.plan.plan, 'yearly');
    assert.equal(c.res.body.plan.source, 'grant');
    for (const id of [gift.id, promoGrantId]) {
      assert.equal(grantOf(id).revoked_at, now());
      assert.equal(grantOf(id).revoke_reason, 'Replaced by plan change: Upgrade after complaint');
    }
    assert.equal(grantOf(expired.id).revoked_at, null, 'expired grants are left alone');
    oneAudit(c, {
      action: 'plan.change', type: 'user', id: u.user.id, userId: u.user.id, label: u.user.publicId,
      details: {
        to: 'yearly', endsAt: g.endsAt, revokedGrantIds: c.res.body.revokedGrantIds, newGrantId: g.id,
        reason: 'Upgrade after complaint', warnings: [],
      },
    });
  });

  it('"change to free" removes all gifts', async () => {
    const u = await newAccount();
    const gift = await giveGrant(u, { plan: 'lifetime' });
    const c = await call('POST', `/v1/admin/users/${u.user.id}/plan`, { plan: 'free', reason: 'Gift ended' });
    assert.equal(c.res.status, 200, c.res.text);
    assert.equal(c.res.body.grant, null);
    assert.deepEqual(c.res.body.revokedGrantIds, [gift.id]);
    assert.equal(c.res.body.plan.plan, 'free');
    assert.equal(c.res.body.plan.isPro, false);
    oneAudit(c, {
      action: 'plan.change', type: 'user', id: u.user.id, userId: u.user.id,
      details: { to: 'free', endsAt: null, revokedGrantIds: [gift.id], newGrantId: null, reason: 'Gift ended', warnings: [] },
    });
    // Nothing to revoke is still a recorded plan change.
    const again = await call('POST', `/v1/admin/users/${u.user.id}/plan`, { plan: 'free', reason: 'Gift ended twice' });
    assert.deepEqual(again.res.body.revokedGrantIds, []);
    oneAudit(again, { action: 'plan.change', type: 'user', id: u.user.id, userId: u.user.id });
  });

  it('never touches store subscriptions; an active one gives store_subscription_active', async () => {
    const u = await newAccount();
    const storeId = insertStoreSubscription(s.db, u.user.id, now(), { plan: 'yearly', expiresInDays: 200 });
    await giveGrant(u, { plan: 'monthly' });
    const c = await call('POST', `/v1/admin/users/${u.user.id}/plan`, { plan: 'free', reason: 'Remove the gift' });
    assert.equal(c.res.status, 200);
    assert.deepEqual(c.res.body.warnings, ['store_subscription_active']);
    assert.equal(c.res.body.plan.plan, 'yearly');
    assert.equal(c.res.body.plan.source, 'store');
    assert.equal(rows<{ status: string }>(s.db, 'SELECT status FROM store_subscriptions WHERE id = ?', storeId)[0]!.status, 'active');
    const details = oneAudit(c, { action: 'plan.change', type: 'user', id: u.user.id, userId: u.user.id });
    assert.deepEqual(details.warnings, ['store_subscription_active']);
  });

  it('validates the plan and the duration rules', async () => {
    const u = await newAccount();
    const cases: Array<[Record<string, unknown>, Record<string, string>]> = [
      [{ plan: 'free', durationDays: 5 }, { durationDays: 'not_allowed' }],
      [{ plan: 'free', endsAt: new Date(now() + 5 * DAY).toISOString() }, { endsAt: 'not_allowed' }],
      [{ plan: 'lifetime', durationDays: 5 }, { durationDays: 'not_allowed' }],
      [{ plan: 'weekly' }, { plan: 'invalid' }],
      [{}, { plan: 'required' }],
    ];
    for (const [body, fields] of cases) {
      const c = await call('POST', `/v1/admin/users/${u.user.id}/plan`, { ...body, reason: 'Valid reason' });
      refused(c, 400, 'validation_failed');
      assert.deepEqual(c.res.body.error.fields, fields, JSON.stringify(body));
    }
    const c = await call('POST', `/v1/admin/users/${u.user.id}/plan`, { plan: 'monthly' });
    assert.deepEqual(c.res.body.error.fields, { reason: 'required' });
    const d = await call('POST', `/v1/admin/users/${u.user.id}/plan`, { plan: 'monthly', durationDays: 7, reason: 'One week' });
    assert.equal(d.res.body.grant.endsAt, iso(now() + 7 * DAY));
  });
});

describe('POST /v1/admin/users/:id/extend', () => {
  it('stacks on the active non-lifetime grant with the latest end', async () => {
    const u = await newAccount();
    const short = await giveGrant(u, { plan: 'monthly', durationDays: 10 });
    const long = await giveGrant(u, { plan: 'monthly', durationDays: 20 });
    const c = await call('POST', `/v1/admin/users/${u.user.id}/extend`, { days: 5, reason: 'Outage compensation' });
    assert.equal(c.res.status, 200, c.res.text);
    assert.deepEqual(Object.keys(c.res.body).sort(), ['grant', 'plan']);
    assert.equal(c.res.body.grant.id, long.id);
    assert.equal(c.res.body.grant.endsAt, iso(now() + 25 * DAY));
    assert.equal(c.res.body.plan.expiresAt, iso(now() + 25 * DAY));
    assert.equal(grantOf(short.id).ends_at, now() + 10 * DAY);
    oneAudit(c, {
      action: 'grant.extend', type: 'grant', id: long.id, userId: u.user.id, label: u.user.publicId,
      details: { grantId: long.id, before: iso(now() + 20 * DAY), after: iso(now() + 25 * DAY), reason: 'Outage compensation' },
    });
  });

  it('a given grantId may be expired: days count from now', async () => {
    const u = await newAccount();
    const g = await giveGrant(u, { plan: 'monthly', durationDays: 1 });
    s.clock.advance(3 * DAY);
    const c = await call('POST', `/v1/admin/users/${u.user.id}/extend`, { grantId: g.id, days: 10, reason: 'Welcome back' });
    assert.equal(c.res.status, 200, c.res.text);
    assert.equal(c.res.body.grant.endsAt, iso(now() + 10 * DAY));
    assert.equal(c.res.body.grant.status, 'active');
    assert.equal(c.res.body.plan.isPro, true);
    oneAudit(c, { action: 'grant.extend', type: 'grant', id: g.id, userId: u.user.id });
  });

  it('endsAt may shorten a grant, but never below now + 1 h', async () => {
    const u = await newAccount();
    const g = await giveGrant(u, { plan: 'yearly' });
    const end = now() + 2 * DAY;
    const c = await call('POST', `/v1/admin/users/${u.user.id}/extend`, { endsAt: new Date(end).toISOString(), reason: 'Shorten it' });
    assert.equal(c.res.status, 200, c.res.text);
    assert.equal(c.res.body.grant.endsAt, iso(end));
    oneAudit(c, {
      action: 'grant.extend', type: 'grant', id: g.id, userId: u.user.id,
      details: { grantId: g.id, before: iso(now() + 365 * DAY), after: iso(end), reason: 'Shorten it' },
    });
    const tooSoon = await call('POST', `/v1/admin/users/${u.user.id}/extend`, { endsAt: new Date(now() + 30 * MINUTE).toISOString(), reason: 'Too soon' });
    refused(tooSoon, 400, 'validation_failed');
    assert.deepEqual(tooSoon.res.body.error.fields, { endsAt: 'out_of_range' });
    const past = await call('POST', `/v1/admin/users/${u.user.id}/extend`, { endsAt: new Date(now() - DAY).toISOString(), reason: 'In the past' });
    refused(past, 400, 'validation_failed');
    assert.deepEqual(past.res.body.error.fields, { endsAt: 'in_past' });
    assert.equal(grantOf(g.id).ends_at, end);
  });

  it('lifetime → 409 already_lifetime; revoked → 409 already_revoked; a foreign grant → 404', async () => {
    const u = await newAccount();
    const lifetime = await giveGrant(u, { plan: 'lifetime' });
    refused(await call('POST', `/v1/admin/users/${u.user.id}/extend`, { grantId: lifetime.id, days: 5, reason: 'More' }), 409, 'already_lifetime');
    const monthly = await giveGrant(u, { plan: 'monthly' });
    await s.request('POST', `/v1/admin/users/${u.user.id}/grants/${monthly.id}/revoke`, { token: admin, body: { reason: 'Revoked first' } });
    refused(await call('POST', `/v1/admin/users/${u.user.id}/extend`, { grantId: monthly.id, days: 5, reason: 'More' }), 409, 'already_revoked');
    const other = await newAccount();
    const foreign = await giveGrant(other, { plan: 'monthly' });
    refused(await call('POST', `/v1/admin/users/${u.user.id}/extend`, { grantId: foreign.id, days: 5, reason: 'More' }), 404, 'not_found');
    refused(await call('POST', `/v1/admin/users/${u.user.id}/extend`, { grantId: 999_999, days: 5, reason: 'More' }), 404, 'not_found');
  });

  it('creates a grant from now when there is none', async () => {
    const a = await newAccount();
    const c = await call('POST', `/v1/admin/users/${a.user.id}/extend`, { days: 30, reason: 'First gift' });
    assert.equal(c.res.status, 200, c.res.text);
    const g = c.res.body.grant;
    assert.equal(g.plan, 'monthly');
    assert.equal(g.startsAt, iso(now()));
    assert.equal(g.endsAt, iso(now() + 30 * DAY));
    oneAudit(c, {
      action: 'grant.create', type: 'grant', id: g.id, userId: a.user.id,
      details: { grantId: g.id, plan: 'monthly', endsAt: g.endsAt, reason: 'First gift', via: 'extend' },
    });
    const b = await newAccount();
    assert.equal((await call('POST', `/v1/admin/users/${b.user.id}/extend`, { days: 365, reason: 'A year' })).res.body.grant.plan, 'yearly');
    const c2 = await newAccount();
    const withPlan = await call('POST', `/v1/admin/users/${c2.user.id}/extend`, { days: 10, plan: 'yearly', reason: 'Yearly anyway' });
    assert.equal(withPlan.res.body.grant.plan, 'yearly');
    assert.equal(withPlan.res.body.grant.endsAt, iso(now() + 10 * DAY));
    const d = await newAccount();
    const byEnd = await call('POST', `/v1/admin/users/${d.user.id}/extend`, { endsAt: new Date(now() + 45 * DAY).toISOString(), reason: 'Until then' });
    assert.equal(byEnd.res.body.grant.plan, 'monthly');
    assert.equal(byEnd.res.body.grant.endsAt, iso(now() + 45 * DAY));
  });

  it('needs exactly one of days and endsAt', async () => {
    const u = await newAccount();
    const cases: Array<[Record<string, unknown>, Record<string, string>]> = [
      [{}, { days: 'required' }],
      [{ days: 5, endsAt: new Date(now() + 9 * DAY).toISOString() }, { endsAt: 'not_allowed' }],
      [{ days: 0 }, { days: 'out_of_range' }],
      [{ days: 3651 }, { days: 'out_of_range' }],
      [{ days: 5, plan: 'lifetime' }, { plan: 'invalid' }],
    ];
    for (const [body, fields] of cases) {
      const c = await call('POST', `/v1/admin/users/${u.user.id}/extend`, { ...body, reason: 'Valid reason' });
      refused(c, 400, 'validation_failed');
      assert.deepEqual(c.res.body.error.fields, fields, JSON.stringify(body));
    }
  });
});

describe('POST /v1/admin/users/:id/grants/:grantId/revoke', () => {
  it('ends one grant now; a second revoke is 409 already_revoked', async () => {
    const u = await newAccount();
    const g = await giveGrant(u, { plan: 'monthly' });
    const c = await call('POST', `/v1/admin/users/${u.user.id}/grants/${g.id}/revoke`, { reason: 'Granted by mistake' });
    assert.equal(c.res.status, 200, c.res.text);
    assert.deepEqual(Object.keys(c.res.body).sort(), ['grant', 'plan']);
    assert.equal(c.res.body.grant.status, 'revoked');
    assert.equal(c.res.body.grant.revokedAt, iso(now()));
    assert.equal(c.res.body.grant.revokeReason, 'Granted by mistake');
    assert.equal(c.res.body.grant.revokedBy.publicId, adminUser.public_id);
    assert.equal(c.res.body.plan.plan, 'free');
    oneAudit(c, {
      action: 'grant.revoke', type: 'grant', id: g.id, userId: u.user.id, label: u.user.publicId,
      details: { grantId: g.id, reason: 'Granted by mistake' },
    });
    refused(await call('POST', `/v1/admin/users/${u.user.id}/grants/${g.id}/revoke`, { reason: 'Again' }), 409, 'already_revoked');
  });

  it('an expired grant may be revoked (only a record); foreign grants are 404', async () => {
    const u = await newAccount();
    const g = await giveGrant(u, { plan: 'monthly', durationDays: 1 });
    s.clock.advance(2 * DAY);
    const c = await call('POST', `/v1/admin/users/${u.user.id}/grants/${g.id}/revoke`, { reason: 'Clean up' });
    assert.equal(c.res.status, 200, c.res.text);
    assert.equal(c.res.body.grant.status, 'revoked');
    oneAudit(c, { action: 'grant.revoke', type: 'grant', id: g.id, userId: u.user.id });
    const other = await newAccount();
    refused(await call('POST', `/v1/admin/users/${other.user.id}/grants/${g.id}/revoke`, { reason: 'Wrong user' }), 404, 'not_found');
    refused(await call('POST', `/v1/admin/users/${u.user.id}/grants/${g.id}/revoke`, {}), 400, 'validation_failed');
  });
});

describe('POST /v1/admin/users/:id/role', () => {
  it('promotes and demotes accounts; the role applies to existing sessions at once', async () => {
    const u = await newAccount();
    assert.equal((await s.request('GET', '/v1/admin/users', { token: u.token })).status, 403);
    const up = await call('POST', `/v1/admin/users/${u.user.id}/role`, { role: 'admin' });
    assert.equal(up.res.status, 200, up.res.text);
    assert.deepEqual(Object.keys(up.res.body), ['user']);
    assert.equal(up.res.body.user.role, 'admin');
    oneAudit(up, { action: 'user.role', type: 'user', id: u.user.id, userId: u.user.id, label: u.user.publicId, details: { before: 'user', after: 'admin' } });
    assert.equal((await s.request('GET', '/v1/admin/users', { token: u.token })).status, 200);
    const down = await call('POST', `/v1/admin/users/${u.user.id}/role`, { role: 'user' });
    assert.equal(down.res.body.user.role, 'user');
    oneAudit(down, { action: 'user.role', type: 'user', id: u.user.id, userId: u.user.id, details: { before: 'admin', after: 'user' } });
    assert.equal((await s.request('GET', '/v1/admin/users', { token: u.token })).status, 403);
  });

  it('guests → 409 not_an_account; the only admin → 409 last_admin; bad roles → 400', async () => {
    const g = await s.guest();
    refused(await call('POST', `/v1/admin/users/${g.user.id}/role`, { role: 'admin' }), 409, 'not_an_account');
    assert.equal(count(s.db, "SELECT count(*) AS n FROM users WHERE role = 'admin' AND status = 'active'"), 1);
    refused(await call('POST', `/v1/admin/users/${adminUser.id}/role`, { role: 'user' }), 409, 'last_admin');
    const u = await newAccount();
    const bad = await call('POST', `/v1/admin/users/${u.user.id}/role`, { role: 'owner' });
    refused(bad, 400, 'validation_failed');
    assert.deepEqual(bad.res.body.error.fields, { role: 'invalid' });
    // With a second admin, the first one may step down (here: the second one is demoted again).
    await s.request('POST', `/v1/admin/users/${u.user.id}/role`, { token: admin, body: { role: 'admin' } });
    const ok = await call('POST', `/v1/admin/users/${u.user.id}/role`, { role: 'user' });
    assert.equal(ok.res.status, 200);
  });
});

describe('disable and enable', () => {
  it('disable keeps the sessions but answers 403 on them and makes the plan free; enable restores both', async () => {
    const u = await newAccount();
    await giveGrant(u, { plan: 'lifetime' });
    const sessions = count(s.db, 'SELECT count(*) AS n FROM sessions WHERE user_id = ?', u.user.id);
    const c = await call('POST', `/v1/admin/users/${u.user.id}/disable`, { reason: 'Abuse of promo codes' });
    assert.equal(c.res.status, 200, c.res.text);
    assert.equal(c.res.body.user.status, 'disabled');
    assert.equal(c.res.body.user.disabledAt, iso(now()));
    assert.equal(c.res.body.user.disabledReason, 'Abuse of promo codes');
    assert.equal(c.res.body.user.plan, 'free');
    oneAudit(c, { action: 'user.disable', type: 'user', id: u.user.id, userId: u.user.id, label: u.user.publicId, details: { reason: 'Abuse of promo codes' } });
    assert.equal(count(s.db, 'SELECT count(*) AS n FROM sessions WHERE user_id = ?', u.user.id), sessions);
    const me = await s.request('GET', '/v1/me', { token: u.token });
    assert.equal(me.status, 403);
    assert.equal(me.body.error.code, 'account_disabled');
    assert.deepEqual(me.body.error.details, { publicId: u.user.publicId, supportEmail: 'support@example.com' });
    const detail = await s.request('GET', `/v1/admin/users/${u.user.id}`, { token: admin });
    assert.equal(detail.body.plan.isPro, false);
    assert.equal(detail.body.grants.length, 1);

    const e = await call('POST', `/v1/admin/users/${u.user.id}/enable`, {});
    assert.equal(e.res.status, 200, e.res.text);
    assert.equal(e.res.body.user.status, 'active');
    assert.equal(e.res.body.user.disabledAt, null);
    assert.equal(e.res.body.user.disabledReason, null);
    oneAudit(e, { action: 'user.enable', type: 'user', id: u.user.id, userId: u.user.id, details: {} });
    const back = await s.request('GET', '/v1/me', { token: u.token });
    assert.equal(back.status, 200);
    assert.equal(back.body.plan.plan, 'lifetime');
  });

  it('admins cannot disable themselves; a reason is required', async () => {
    refused(await call('POST', `/v1/admin/users/${adminUser.public_id}/disable`, { reason: 'Taking a break' }), 409, 'cannot_target_self');
    const u = await newAccount();
    const c = await call('POST', `/v1/admin/users/${u.user.id}/disable`, {});
    refused(c, 400, 'validation_failed');
    assert.deepEqual(c.res.body.error.fields, { reason: 'required' });
  });
});

describe('POST /v1/admin/users/:id/sign-out-all', () => {
  it('deletes every session of the user', async () => {
    const u = await newAccount();
    const second = await s.signIn(u.user.email!, PASSWORD);
    assert.equal(second.status, 200);
    const c = await call('POST', `/v1/admin/users/${u.user.id}/sign-out-all`, {});
    assert.equal(c.res.status, 200, c.res.text);
    assert.deepEqual(c.res.body, { revoked: 2 });
    oneAudit(c, { action: 'user.sign_out_all', type: 'user', id: u.user.id, userId: u.user.id, details: { revoked: 2 } });
    assert.equal((await s.request('GET', '/v1/me', { token: u.token })).status, 401);
    assert.equal((await s.request('GET', '/v1/me', { token: second.body.token })).status, 401);
  });
});

describe('POST /v1/admin/users/:id/reset-code', () => {
  it('returns a code once (valid 60 min); it is audited without the code and no mail is sent', async () => {
    const u = await newAccount();
    const c = await call('POST', `/v1/admin/users/${u.user.id}/reset-code`, {});
    assert.equal(c.res.status, 201, c.res.text);
    const { code, expiresAt } = c.res.body;
    assert.match(code, /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
    assert.equal(expiresAt, iso(now() + 60 * MINUTE));
    oneAudit(c, { action: 'user.reset_code', type: 'user', id: u.user.id, userId: u.user.id, details: { expiresAt } });
    assert.ok(!c.audit[0]!.details.includes(code) && !c.audit[0]!.details.includes(code.replace('-', '')));

    // A new code replaces the old one; the new one resets the password.
    const second = await call('POST', `/v1/admin/users/${u.user.id}/reset-code`, {});
    oneAudit(second, { action: 'user.reset_code', type: 'user', id: u.user.id, userId: u.user.id });
    const reset = (resetCode: string) => s.request('POST', '/v1/auth/reset-password', {
      body: { email: u.user.email, code: resetCode, newPassword: 'a brand new passphrase', installId: randomUUID() },
    });
    assert.equal((await reset(code)).body.error.code, 'invalid_reset_code');
    const ok = await reset(second.res.body.code);
    assert.equal(ok.status, 200, ok.text);
  });

  it('guests → 409 not_an_account', async () => {
    const g = await s.guest();
    refused(await call('POST', `/v1/admin/users/${g.user.id}/reset-code`, {}), 409, 'not_an_account');
  });
});

describe('DELETE /v1/admin/users/:id', () => {
  it('needs the public id as confirmation (confirm_mismatch), then deletes as in 4.10', async () => {
    const u = await newAccount();
    const g = await giveGrant(u, { plan: 'monthly' });
    const priorRows = count(s.db, 'SELECT count(*) AS n FROM audit_log WHERE target_user_id = ?', u.user.id);
    assert.ok(priorRows > 0);
    const wrong = await call('DELETE', `/v1/admin/users/${u.user.id}`, { confirm: 'SW-0000-0000', reason: 'GDPR request' });
    refused(wrong, 400, 'confirm_mismatch');
    assert.equal(count(s.db, 'SELECT count(*) AS n FROM users WHERE id = ?', u.user.id), 1);
    const missing = await call('DELETE', `/v1/admin/users/${u.user.id}`, { reason: 'GDPR request' });
    refused(missing, 400, 'validation_failed');
    assert.deepEqual(missing.res.body.error.fields, { confirm: 'required' });
    refused(await call('DELETE', `/v1/admin/users/${u.user.id}`, { confirm: u.user.publicId }), 400, 'validation_failed');

    const confirm = u.user.publicId.toLowerCase().replace(/-/g, ' ');
    const c = await call('DELETE', `/v1/admin/users/${u.user.id}`, { confirm, reason: 'GDPR request by email' });
    assert.equal(c.res.status, 204, c.res.text);
    assert.equal(c.res.text, '');
    assert.equal(count(s.db, 'SELECT count(*) AS n FROM users WHERE id = ?', u.user.id), 0);
    assert.equal(count(s.db, 'SELECT count(*) AS n FROM grants WHERE id = ?', g.id), 0);
    oneAudit(c, {
      action: 'user.delete', type: 'user', id: u.user.id, userId: u.user.id, label: u.user.publicId,
      details: { by: 'admin', reason: 'GDPR request by email', hadStoreSubscription: false },
    });
    const scrubbed = rows<{ details: string }>(s.db, 'SELECT details FROM audit_log WHERE target_user_id = ? AND id < ?', u.user.id, c.audit[0]!.id);
    assert.equal(scrubbed.length, priorRows);
    assert.ok(scrubbed.every((r) => r.details === '{"scrubbed":true}'));
    refused(await call('GET', `/v1/admin/users/${u.user.id}`), 404, 'not_found');
  });

  it('records a live store subscription; admins cannot delete themselves', async () => {
    const u = await newAccount();
    insertStoreSubscription(s.db, u.user.id, now(), { plan: 'yearly' });
    const c = await call('DELETE', `/v1/admin/users/${u.user.publicId}`, { confirm: u.user.publicId, reason: 'Fraud' });
    assert.equal(c.res.status, 204);
    oneAudit(c, { action: 'user.delete', type: 'user', id: u.user.id, userId: u.user.id, details: { by: 'admin', reason: 'Fraud', hadStoreSubscription: true } });
    refused(
      await call('DELETE', `/v1/admin/users/${adminUser.id}`, { confirm: adminUser.public_id, reason: 'Goodbye' }),
      409, 'cannot_target_self',
    );
  });
});

describe('notes', () => {
  it('create, edit (by any admin) and delete; the audit holds the note id, never the body', async () => {
    const u = await newAccount();
    const c = await call('POST', `/v1/admin/users/${u.user.id}/notes`, { body: '  Called about a refund.\r\nSecond line  ' });
    assert.equal(c.res.status, 201, c.res.text);
    const note = c.res.body.note;
    assert.deepEqual(Object.keys(note).sort(), ['author', 'body', 'createdAt', 'id', 'updatedAt']);
    assert.equal(note.body, 'Called about a refund.\nSecond line');
    assert.equal(note.author.publicId, adminUser.public_id);
    oneAudit(c, { action: 'note.create', type: 'note', id: note.id, userId: u.user.id, label: u.user.publicId, details: { noteId: note.id } });
    assert.ok(!c.audit[0]!.details.includes('refund'));
    const list = await s.request('GET', `/v1/admin/users?q=${encodeURIComponent(u.user.email!)}`, { token: admin });
    assert.equal(list.body.items[0].notesCount, 1);

    // Another admin edits it.
    const other = await newAccount('second.admin');
    await s.request('POST', `/v1/admin/users/${other.user.id}/role`, { token: admin, body: { role: 'admin' } });
    const otherRow = getUserByEmail(s.db, other.user.email!)!;
    s.clock.advance(MINUTE);
    const e = await call('PATCH', `/v1/admin/notes/${note.id}`, { body: 'Refund done.' }, other.token);
    assert.equal(e.res.status, 200, e.res.text);
    assert.equal(e.res.body.note.body, 'Refund done.');
    assert.equal(e.res.body.note.createdAt, note.createdAt);
    assert.equal(e.res.body.note.updatedAt, iso(now()));
    oneAudit(e, { action: 'note.update', type: 'note', id: note.id, userId: u.user.id, details: { noteId: note.id } }, otherRow);
    const detail = await s.request('GET', `/v1/admin/users/${u.user.id}`, { token: admin });
    assert.deepEqual(detail.body.notes.map((n: any) => n.body), ['Refund done.']);

    const del = await call('DELETE', `/v1/admin/notes/${note.id}`);
    assert.equal(del.res.status, 204);
    oneAudit(del, { action: 'note.delete', type: 'note', id: note.id, userId: u.user.id, details: { noteId: note.id } });
    refused(await call('PATCH', `/v1/admin/notes/${note.id}`, { body: 'Again' }), 404, 'not_found');
    refused(await call('DELETE', `/v1/admin/notes/${note.id}`), 404, 'not_found');
    await s.request('POST', `/v1/admin/users/${other.user.id}/role`, { token: admin, body: { role: 'user' } });
  });

  it('validates the body: 1–2000 characters, newlines allowed, no other control characters', async () => {
    const u = await newAccount();
    for (const [body, error] of [[undefined, 'required'], ['', 'required'], ['   ', 'required'], ['x'.repeat(2001), 'too_long'], ['bell\u0007', 'invalid'], [7, 'invalid']] as const) {
      const c = await call('POST', `/v1/admin/users/${u.user.id}/notes`, body === undefined ? {} : { body });
      refused(c, 400, 'validation_failed');
      assert.deepEqual(c.res.body.error.fields, { body: error }, String(body));
    }
    const max = await call('POST', `/v1/admin/users/${u.user.id}/notes`, { body: 'y'.repeat(2000) });
    assert.equal(max.res.status, 201);
    refused(await call('POST', `/v1/admin/users/${randomUUID()}/notes`, { body: 'Nobody' }), 404, 'not_found');
  });
});

describe('merged guests', () => {
  it('are hidden from the default list and shown with mergedInto', async () => {
    const g = await s.guest();
    const u = await newAccount();
    const signIn = await s.signIn(u.user.email!, PASSWORD, { token: g.token });
    assert.equal(signIn.status, 200);
    const detail = await s.request('GET', `/v1/admin/users/${g.user.id}`, { token: admin });
    assert.equal(detail.status, 200);
    assert.equal(detail.body.user.status, 'merged');
    assert.deepEqual(detail.body.user.mergedInto, { id: u.user.id, publicId: u.user.publicId, displayName: null });
    const listed = await s.request('GET', `/v1/admin/users?q=${g.user.id}`, { token: admin });
    assert.equal(listed.body.total, 0);
    const merged = await s.request('GET', `/v1/admin/users?status=merged&q=${g.user.id}`, { token: admin });
    assert.equal(merged.body.total, 1);
  });
});

describe('search rule 3 (public ids)', () => {
  it('a sw… prefix searches public ids only; a bare 8-character id also searches names and emails', async () => {
    const target = await newAccount();
    s.db.prepare("UPDATE users SET public_id = 'SW-7K3P-92QX' WHERE id = ?").run(target.user.id);
    const decoy = await s.account('decoy.search@example.com', PASSWORD, { displayName: 'sw-7k3p fan' });
    const bareDecoy = await s.account('k3p92qx7@example.com', PASSWORD, { displayName: '7k3p92qx' });
    const search = async (q: string) =>
      (await s.request('GET', `/v1/admin/users?limit=100&q=${encodeURIComponent(q)}`, { token: admin })).body.items.map((u: any) => u.id).sort();
    assert.deepEqual(await search('sw-7k3p'), [target.user.id]);
    assert.deepEqual(await search('SW 7K3P 92QX'), [target.user.id]);
    assert.deepEqual(await search('7k3p92qx'), [target.user.id, bareDecoy.user.id].sort());
    assert.deepEqual(await search('7k3p fan'), [decoy.user.id]);
  });
});
