import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';

import { DAY } from '../src/clock.ts';
import { createPasswordHasher } from '../src/domain/passwords.ts';
import { createAccount, getUserByEmail } from '../src/domain/users.ts';
import { count, PASSWORD, rows, startTestServer, type TestServer } from './helpers.ts';

let s: TestServer;
before(async () => {
  s = await startTestServer();
});
after(() => s.close());

describe('POST /v1/auth/guest', () => {
  it('creates a guest (201), then reuses it for the same install id (200) and revokes the old token', async () => {
    const installId = randomUUID();
    const first = await s.request('POST', '/v1/auth/guest', { body: { installId }, headers: { 'Accept-Language': 'de-AT' } });
    assert.equal(first.status, 201);
    assert.match(first.body.token, /^sw_[A-Za-z0-9_-]{43}$/);
    assert.equal(first.body.user.kind, 'guest');
    assert.match(first.body.user.publicId, /^SW-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    assert.equal(first.body.user.country, 'AT');
    assert.equal(first.body.user.language, 'de');
    assert.equal(first.body.plan.plan, 'free');
    assert.deepEqual(first.body.entitlements, []);
    assert.ok(first.body.session.createdAt && first.body.session.expiresAt);

    const again = await s.request('POST', '/v1/auth/guest', { body: { installId } });
    assert.equal(again.status, 200);
    assert.equal(again.body.user.id, first.body.user.id);
    assert.equal(again.body.user.publicId, first.body.user.publicId);
    assert.notEqual(again.body.token, first.body.token);
    assert.equal((await s.request('GET', '/v1/me', { token: first.body.token })).status, 401);
    assert.equal((await s.request('GET', '/v1/me', { token: again.body.token })).status, 200);
  });

  it('validates the install id and requires X-Client', async () => {
    const bad = await s.request('POST', '/v1/auth/guest', { body: { installId: 'not-a-uuid' } });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.error.code, 'validation_failed');
    assert.equal(bad.body.error.fields.installId, 'invalid');
    const v1 = await s.request('POST', '/v1/auth/guest', { body: { installId: '6f1d0c2e-8a7b-1c1e-9d3f-2b5a7c9e1f04' } });
    assert.equal(v1.body.error.fields.installId, 'invalid');
    const missing = await s.request('POST', '/v1/auth/guest', { body: {} });
    assert.equal(missing.body.error.fields.installId, 'required');
    const noClient = await s.request('POST', '/v1/auth/guest', { body: { installId: randomUUID() }, headers: { 'X-Client': null } });
    assert.equal(noClient.status, 400);
    assert.equal(noClient.body.error.code, 'validation_failed');
    assert.equal(noClient.body.error.fields.xClient, 'required');
    const badClient = await s.request('POST', '/v1/auth/guest', { body: { installId: randomUUID() }, headers: { 'X-Client': 'web/1/2/3' } });
    assert.equal(badClient.body.error.fields.xClient, 'invalid');
  });

  it('fills the device from X-Client', async () => {
    const g = await s.guest({ headers: { 'X-Client': 'android/1.2.3/45/14' } });
    const [device] = rows<{ platform: string; app_version: string; build: number; os_version: string }>(
      s.db, 'SELECT platform, app_version, build, os_version FROM devices WHERE user_id = ?', g.user.id,
    );
    assert.deepEqual({ ...device }, { platform: 'android', app_version: '1.2.3', build: 45, os_version: '14' });
  });
});

describe('POST /v1/auth/sign-up', () => {
  it('turns the guest into the account and kills the old token', async () => {
    const g = await s.guest();
    const res = await s.request('POST', '/v1/auth/sign-up', {
      token: g.token, body: { email: '  New.User@Example.com ', password: PASSWORD, displayName: '  New   User ' },
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.user.id, g.user.id);
    assert.equal(res.body.user.publicId, g.user.publicId);
    assert.equal(res.body.user.kind, 'account');
    assert.equal(res.body.user.email, 'new.user@example.com');
    assert.equal(res.body.user.displayName, 'New User');
    assert.ok(res.body.user.signedUpAt);
    assert.equal((await s.request('GET', '/v1/me', { token: g.token })).status, 401);
    assert.equal((await s.request('GET', '/v1/me', { token: res.body.token })).status, 200);
  });

  it('email_taken, already_signed_up and validation', async () => {
    await s.account('taken@example.com');
    const g = await s.guest();
    const taken = await s.request('POST', '/v1/auth/sign-up', { token: g.token, body: { email: 'TAKEN@example.com', password: PASSWORD } });
    assert.equal(taken.status, 409);
    assert.equal(taken.body.error.code, 'email_taken');

    const acc = await s.account('signed@example.com');
    const twice = await s.request('POST', '/v1/auth/sign-up', { token: acc.token, body: { email: 'other@example.com', password: PASSWORD } });
    assert.equal(twice.status, 409);
    assert.equal(twice.body.error.code, 'already_signed_up');

    const invalid = await s.request('POST', '/v1/auth/sign-up', {
      token: g.token, body: { email: 'not-an-email', password: 'short', displayName: 'x'.repeat(61) },
    });
    assert.equal(invalid.status, 400);
    assert.deepEqual(invalid.body.error.fields, { email: 'invalid_email', password: 'too_short', displayName: 'too_long' });
    const common = await s.request('POST', '/v1/auth/sign-up', { token: g.token, body: { email: 'c@example.com', password: 'password1' } });
    assert.equal(common.body.error.fields.password, 'too_common');
    const same = await s.request('POST', '/v1/auth/sign-up', { token: g.token, body: { email: 'mysecretname@example.com', password: 'MySecretName' } });
    assert.equal(same.body.error.fields.password, 'same_as_email');
    const noToken = await s.request('POST', '/v1/auth/sign-up', { body: { email: 'x@example.com', password: PASSWORD } });
    assert.equal(noToken.status, 401);
    assert.equal(noToken.body.error.code, 'unauthorized');
  });

  it('signup_disabled when auth.signUpEnabled is false', async () => {
    const admin = await s.adminToken();
    assert.equal((await s.request('PATCH', '/v1/admin/settings', { token: admin, body: { values: { 'auth.signUpEnabled': false } } })).status, 200);
    const g = await s.guest();
    const res = await s.request('POST', '/v1/auth/sign-up', { token: g.token, body: { email: 'off@example.com', password: PASSWORD } });
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'signup_disabled');
    assert.equal((await s.request('PATCH', '/v1/admin/settings', { token: admin, body: { values: { 'auth.signUpEnabled': null } } })).status, 200);
  });
});

describe('POST /v1/auth/sign-in', () => {
  it('signs in and rehashes outdated hashes', async () => {
    const old = await createPasswordHasher({ N: 512, p: 1 }).hash(PASSWORD);
    createAccount(s.db, { email: 'rehash@example.com', passwordHash: old, now: s.clock.now() });
    const res = await s.signIn('rehash@example.com', PASSWORD);
    assert.equal(res.status, 200);
    assert.equal(res.body.merged, null);
    assert.equal(res.body.user.email, 'rehash@example.com');
    assert.match(getUserByEmail(s.db, 'rehash@example.com')!.password_hash!, /^scrypt\$v=1\$N=1024,r=8,p=1\$/);
    assert.equal((await s.signIn('rehash@example.com', PASSWORD)).status, 200);
  });

  it('unknown email and wrong password give identical bodies', async () => {
    await s.account('known@example.com');
    const unknown = await s.signIn('nobody@example.com', PASSWORD);
    const wrong = await s.signIn('known@example.com', 'wrong password here');
    assert.equal(unknown.status, 401);
    assert.equal(wrong.status, 401);
    assert.deepEqual(unknown.body, wrong.body);
    assert.equal(unknown.body.error.code, 'invalid_credentials');
  });

  it('requires X-Client and an install id', async () => {
    const res = await s.request('POST', '/v1/auth/sign-in', { body: { email: 'known@example.com', password: PASSWORD } });
    assert.equal(res.body.error.fields.installId, 'required');
    const noClient = await s.request('POST', '/v1/auth/sign-in', {
      body: { email: 'known@example.com', password: PASSWORD, installId: randomUUID() }, headers: { 'X-Client': null },
    });
    assert.equal(noClient.body.error.fields.xClient, 'required');
  });

  it('merges the guest of the bearer token into the account (3.6)', async () => {
    const admin = await s.adminToken();
    const u = await s.account('merge-target@example.com');
    const g = await s.guest();
    // The guest: an admin grant, a store subscription, two promo redemptions (one the account also has).
    const grant = await s.request('POST', `/v1/admin/users/${g.user.id}/grants`, { token: admin, body: { plan: 'monthly', reason: 'Support gift' } });
    assert.equal(grant.status, 201);
    const now = s.clock.now();
    s.db.prepare(
      `INSERT INTO store_subscriptions (user_id, store, environment, product_id, plan, original_transaction_id, rc_app_user_id, status, will_renew,
         purchased_at, expires_at, last_event_at, created_at, updated_at)
       VALUES (?, 'play_store', 'production', 'stopwake_pro:yearly', 'yearly', 'GPA.merge-1', ?, 'active', 1, ?, ?, ?, ?, ?)`,
    ).run(g.user.id, g.user.id, now, now + 300 * DAY, now, now, now);
    for (const code of ['MERGE-ONE', 'MERGE-TWO']) {
      assert.equal((await s.request('POST', '/v1/admin/promo-codes', { token: admin, body: { code, plan: 'monthly' } })).status, 201);
    }
    assert.equal((await s.request('POST', '/v1/promo/redeem', { token: g.token, body: { code: 'merge one' } })).status, 200);
    assert.equal((await s.request('POST', '/v1/promo/redeem', { token: g.token, body: { code: 'MERGE-TWO' } })).status, 200);
    assert.equal((await s.request('POST', '/v1/promo/redeem', { token: u.token, body: { code: 'MERGE-ONE' } })).status, 200);
    const guestDevice = rows<{ id: number }>(s.db, 'SELECT id FROM devices WHERE user_id = ?', g.user.id)[0]!;

    const res = await s.signIn('merge-target@example.com', PASSWORD, { token: g.token, installId: g.installId });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.merged, { fromPublicId: g.user.publicId, grants: 3, storeSubscriptions: 1, promoRedemptions: 1 });
    assert.equal(res.body.user.id, u.user.id);
    assert.equal(res.body.plan.plan, 'yearly');
    assert.equal(res.body.plan.source, 'store');

    assert.equal(count(s.db, 'SELECT count(*) AS n FROM grants WHERE user_id = ?', g.user.id), 0);
    assert.equal(count(s.db, 'SELECT count(*) AS n FROM store_subscriptions WHERE user_id = ?', u.user.id), 1);
    assert.equal(count(s.db, 'SELECT count(*) AS n FROM promo_redemptions WHERE user_id = ?', u.user.id), 2);
    assert.equal(count(s.db, 'SELECT count(*) AS n FROM promo_redemptions WHERE user_id = ?', g.user.id), 0);
    const revoked = rows<{ revoke_reason: string }>(s.db, 'SELECT revoke_reason FROM grants WHERE user_id = ? AND revoked_at IS NOT NULL', u.user.id);
    assert.deepEqual(revoked.map((r) => r.revoke_reason), ['Duplicate promo code after account merge']);
    const merged = rows<{ status: string; merged_into: string; plan: string }>(s.db, 'SELECT status, merged_into, plan FROM users WHERE id = ?', g.user.id)[0]!;
    assert.deepEqual({ ...merged }, { status: 'merged', merged_into: u.user.id, plan: 'free' });
    assert.equal(rows<{ user_id: string }>(s.db, 'SELECT user_id FROM devices WHERE id = ?', guestDevice.id)[0]!.user_id, u.user.id);
    assert.equal((await s.request('GET', '/v1/me', { token: g.token })).status, 401);
    const audit = rows<{ actor_label: string; target_user_id: string; details: string }>(
      s.db, "SELECT actor_label, target_user_id, details FROM audit_log WHERE action = 'user.merge'",
    );
    assert.equal(audit.length, 1);
    assert.equal(audit[0]!.actor_label, 'system');
    assert.equal(audit[0]!.target_user_id, u.user.id);
    assert.deepEqual(JSON.parse(audit[0]!.details), res.body.merged);
  });

  it('with the same user’s token replaces the session (re-authentication)', async () => {
    const a = await s.account('reauth@example.com');
    const res = await s.signIn('reauth@example.com', PASSWORD, { token: a.token, installId: a.installId });
    assert.equal(res.status, 200);
    assert.equal(res.body.merged, null);
    assert.equal((await s.request('GET', '/v1/me', { token: a.token })).status, 401);
    assert.equal((await s.request('GET', '/v1/me', { token: res.body.token })).status, 200);
  });

  it('audits admin sign-ins and failures with the IP', async () => {
    await s.adminToken('audited-admin@example.com');
    await s.signIn('audited-admin@example.com', 'definitely wrong');
    const entries = rows<{ action: string; ip: string; details: string }>(
      s.db, "SELECT a.action, a.ip, a.details FROM audit_log a JOIN users u ON u.id = a.target_user_id WHERE u.email = 'audited-admin@example.com' ORDER BY a.id",
    );
    assert.deepEqual(entries.map((e) => e.action), ['admin.sign_in', 'admin.sign_in_failed']);
    for (const e of entries) {
      assert.equal(e.ip, '127.0.0.1');
      assert.equal(e.details, '{}');
    }
  });
});

describe('sign-out', () => {
  it('sign-out deletes the current session', async () => {
    const a = await s.account('out@example.com');
    const res = await s.request('POST', '/v1/auth/sign-out', { token: a.token });
    assert.equal(res.status, 204);
    assert.equal(res.text, '');
    assert.equal((await s.request('GET', '/v1/me', { token: a.token })).status, 401);
  });

  it('sign-out-all keeps the current session by default', async () => {
    const a = await s.account('all@example.com');
    const b = await s.signIn('all@example.com', PASSWORD);
    const c = await s.signIn('all@example.com', PASSWORD);
    const res = await s.request('POST', '/v1/auth/sign-out-all', { token: a.token });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { revoked: 2 });
    assert.equal((await s.request('GET', '/v1/me', { token: a.token })).status, 200);
    assert.equal((await s.request('GET', '/v1/me', { token: b.body.token })).status, 401);
    assert.equal((await s.request('GET', '/v1/me', { token: c.body.token })).status, 401);
    const all = await s.request('POST', '/v1/auth/sign-out-all', { token: a.token, body: { keepCurrent: false } });
    assert.deepEqual(all.body, { revoked: 1 });
    assert.equal((await s.request('GET', '/v1/me', { token: a.token })).status, 401);
  });
});

describe('sessions', () => {
  it('slide: used daily for 200 days stays valid; 181 idle days → 401', async () => {
    const t = await startTestServer();
    try {
      const g = await t.guest();
      for (let day = 0; day < 200; day++) {
        t.clock.advance(DAY);
        assert.equal((await t.request('GET', '/v1/me', { token: g.token })).status, 200, `day ${day}`);
      }
      t.clock.advance(181 * DAY);
      const res = await t.request('GET', '/v1/me', { token: g.token });
      assert.equal(res.status, 401);
      assert.equal(res.body.error.code, 'unauthorized');
    } finally {
      await t.close();
    }
  });

  it('a disabled user gets 403 everywhere but sign-out; enable restores access', async () => {
    const admin = await s.adminToken();
    const a = await s.account('disable-me@example.com');
    const other = await s.signIn('disable-me@example.com', PASSWORD);
    const dis = await s.request('POST', `/v1/admin/users/${a.user.publicId}/disable`, { token: admin, body: { reason: 'Testing the switch' } });
    assert.equal(dis.status, 200);
    const me = await s.request('GET', '/v1/me', { token: a.token });
    assert.equal(me.status, 403);
    assert.equal(me.body.error.code, 'account_disabled');
    assert.deepEqual(me.body.error.details, { publicId: a.user.publicId, supportEmail: 'support@example.com' });
    assert.equal((await s.request('GET', '/v1/plan', { token: a.token })).status, 403);
    // Sign-in reveals the state only after a correct password.
    assert.equal((await s.signIn('disable-me@example.com', 'wrong password!')).status, 401);
    assert.equal((await s.signIn('disable-me@example.com', PASSWORD)).body.error.code, 'account_disabled');
    assert.equal((await s.request('POST', '/v1/auth/sign-out', { token: a.token })).status, 204);
    assert.equal((await s.request('POST', `/v1/admin/users/${a.user.id}/enable`, { token: admin })).status, 200);
    assert.equal((await s.request('GET', '/v1/me', { token: other.body.token })).status, 200);
  });
});
