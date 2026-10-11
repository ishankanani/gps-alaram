import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { DAY } from '../src/clock.ts';
import { count, PASSWORD, rows, startTestServer, type TestServer } from './helpers.ts';

let s: TestServer;
before(async () => {
  s = await startTestServer();
});
after(() => s.close());

function addStoreSubscription(userId: string, opts: { willRenew?: 0 | 1; expiresInDays?: number } = {}): void {
  const now = s.clock.now();
  s.db.prepare(
    `INSERT INTO store_subscriptions (user_id, store, environment, product_id, plan, original_transaction_id, rc_app_user_id, status, will_renew,
       purchased_at, expires_at, last_event_at, created_at, updated_at)
     VALUES (?, 'play_store', 'production', 'stopwake_pro:monthly', 'monthly', ?, ?, 'active', ?, ?, ?, ?, ?, ?)`,
  ).run(userId, `GPA.me-${userId}`, userId, opts.willRenew ?? 1, now - DAY, now + (opts.expiresInDays ?? 20) * DAY, now, now, now);
}

describe('GET /v1/me', () => {
  it('returns user, session, plan and entitlements', async () => {
    const a = await s.account('shape@example.com', PASSWORD, { displayName: 'Shape' });
    const res = await s.request('GET', '/v1/me', { token: a.token });
    assert.equal(res.status, 200);
    assert.deepEqual(Object.keys(res.body).sort(), ['entitlements', 'plan', 'session', 'user']);
    assert.deepEqual(Object.keys(res.body.user).sort(), [
      'country', 'createdAt', 'displayName', 'email', 'emailVerified', 'id', 'kind', 'language', 'publicId', 'role', 'signedUpAt',
    ]);
    assert.equal(res.body.user.displayName, 'Shape');
    assert.equal(res.body.plan.isPro, false);
    assert.equal(res.body.plan.checkedAt, new Date(s.clock.now()).toISOString());
    assert.equal(res.headers.get('cache-control'), 'no-store');
    for (const secret of ['password_hash', 'token_hash', 'passwordHash']) assert.ok(!res.text.includes(secret));
  });
});

describe('PATCH /v1/me', () => {
  it('updates name, language and country with validation', async () => {
    const g = await s.guest();
    const ok = await s.request('PATCH', '/v1/me', { token: g.token, body: { displayName: ' Night   Owl ', language: 'sv', country: 'SE' } });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.user.displayName, 'Night Owl');
    assert.equal(ok.body.user.language, 'sv');
    assert.equal(ok.body.user.country, 'SE');
    const bad = await s.request('PATCH', '/v1/me', { token: g.token, body: { displayName: 'x'.repeat(61), language: 'xx', country: 'se' } });
    assert.equal(bad.status, 400);
    assert.deepEqual(bad.body.error.fields, { displayName: 'too_long', language: 'invalid', country: 'invalid' });
    const cleared = await s.request('PATCH', '/v1/me', { token: g.token, body: { displayName: null, language: null } });
    assert.equal(cleared.body.user.displayName, null);
    assert.equal(cleared.body.user.language, null);
    const control = await s.request('PATCH', '/v1/me', { token: g.token, body: { displayName: 'a\u0007b' } });
    assert.equal(control.body.error.fields.displayName, 'invalid');
  });

  it('changing the email needs an account and the current password, must be unique, and mails the old address', async () => {
    const g = await s.guest();
    const guestEmail = await s.request('PATCH', '/v1/me', { token: g.token, body: { email: 'g@example.com', currentPassword: PASSWORD } });
    assert.equal(guestEmail.status, 409);
    assert.equal(guestEmail.body.error.code, 'not_an_account');

    const a = await s.account('old.address@example.com');
    await s.account('occupied@example.com');
    const noPw = await s.request('PATCH', '/v1/me', { token: a.token, body: { email: 'new.address@example.com' } });
    assert.equal(noPw.body.error.fields.currentPassword, 'required');
    const wrongPw = await s.request('PATCH', '/v1/me', { token: a.token, body: { email: 'new.address@example.com', currentPassword: 'nope nope nope' } });
    assert.equal(wrongPw.status, 401);
    assert.equal(wrongPw.body.error.code, 'invalid_credentials');
    const taken = await s.request('PATCH', '/v1/me', { token: a.token, body: { email: 'occupied@example.com', currentPassword: PASSWORD } });
    assert.equal(taken.status, 409);
    assert.equal(taken.body.error.code, 'email_taken');
    const ok = await s.request('PATCH', '/v1/me', { token: a.token, body: { email: 'New.Address@example.com', currentPassword: PASSWORD } });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.user.email, 'new.address@example.com');
    assert.equal(ok.body.user.emailVerified, false);
    const notice = s.mail.at(-1)!;
    assert.equal(notice.kind, 'email_changed');
    assert.equal(notice.to, 'old.address@example.com');
    assert.match(notice.text, /n\*\*\*@example\.com/);
    assert.ok(!notice.text.includes('new.address@example.com'));
  });
});

describe('POST /v1/me/password', () => {
  it('needs the current password and revokes the other sessions', async () => {
    const a = await s.account('pw@example.com');
    const other = await s.signIn('pw@example.com', PASSWORD);
    const wrong = await s.request('POST', '/v1/me/password', { token: a.token, body: { currentPassword: 'wrong wrong', newPassword: 'fresh passphrase 1' } });
    assert.equal(wrong.status, 401);
    const weak = await s.request('POST', '/v1/me/password', { token: a.token, body: { currentPassword: PASSWORD, newPassword: 'short' } });
    assert.equal(weak.body.error.fields.newPassword, 'too_short');
    const ok = await s.request('POST', '/v1/me/password', { token: a.token, body: { currentPassword: PASSWORD, newPassword: 'fresh passphrase 1' } });
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.body, { revokedSessions: 1 });
    assert.equal((await s.request('GET', '/v1/me', { token: a.token })).status, 200);
    assert.equal((await s.request('GET', '/v1/me', { token: other.body.token })).status, 401);
    assert.equal(s.mail.at(-1)!.kind, 'password_changed');
    const guest = await s.guest();
    const g = await s.request('POST', '/v1/me/password', { token: guest.token, body: { currentPassword: 'x', newPassword: 'fresh passphrase 1' } });
    assert.equal(g.status, 409);
    assert.equal(g.body.error.code, 'not_an_account');
  });
});

describe('GET /v1/me/export', () => {
  it('returns everything stored about the user as an attachment', async () => {
    const admin = await s.adminToken();
    const a = await s.account('export@example.com');
    await s.request('POST', '/v1/admin/promo-codes', { token: admin, body: { code: 'EXPORT-ME', plan: 'monthly' } });
    await s.request('POST', '/v1/promo/redeem', { token: a.token, body: { code: 'EXPORT-ME' } });
    const res = await s.request('GET', '/v1/me/export', { token: a.token });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-disposition'), `attachment; filename="stopwake-${a.user.publicId}.json"`);
    assert.equal(res.body.user.email, 'export@example.com');
    assert.equal(res.body.plan.source, 'promo');
    assert.equal(res.body.entitlements.length, 1);
    assert.equal(res.body.devices.length, 1);
    assert.equal(res.body.devices[0].platform, 'android');
    assert.deepEqual(res.body.promoRedemptions.map((r: { code: string }) => r.code), ['EXPORT-ME']);
    assert.equal(res.body.sessions.length, 1);
    assert.ok(!res.text.includes('hash'));
  });
});

describe('DELETE /v1/me', () => {
  it('deletes a guest without a password', async () => {
    const g = await s.guest();
    const res = await s.request('DELETE', '/v1/me', { token: g.token });
    assert.equal(res.status, 204);
    assert.equal(count(s.db, 'SELECT count(*) AS n FROM users WHERE id = ?', g.user.id), 0);
    assert.equal((await s.request('GET', '/v1/me', { token: g.token })).status, 401);
  });

  it('accounts need their password', async () => {
    const a = await s.account('delete-pw@example.com');
    const missing = await s.request('DELETE', '/v1/me', { token: a.token, body: {} });
    assert.equal(missing.status, 400);
    assert.equal(missing.body.error.fields.password, 'required');
    const wrong = await s.request('DELETE', '/v1/me', { token: a.token, body: { password: 'not my password' } });
    assert.equal(wrong.status, 401);
    assert.equal(wrong.body.error.code, 'invalid_credentials');
  });

  it('subscription_active until acknowledged', async () => {
    const a = await s.account('subscribed@example.com');
    addStoreSubscription(a.user.id);
    const res = await s.request('DELETE', '/v1/me', { token: a.token, body: { password: PASSWORD } });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'subscription_active');
    assert.equal(res.body.error.details.store, 'play_store');
    assert.equal(res.body.error.details.productId, 'stopwake_pro:monthly');
    assert.ok(res.body.error.details.expiresAt);
    const ok = await s.request('DELETE', '/v1/me', { token: a.token, body: { password: PASSWORD, acknowledgeSubscription: true } });
    assert.equal(ok.status, 204);
  });

  it('cascades through every table, scrubs audit rows and deletes webhook events', async () => {
    const admin = await s.adminToken();
    const a = await s.account('cascade@example.com');
    const g = await s.guest();
    // Data in every table: grants, notes, redemptions, store rows, reset codes, webhook events, a merged guest.
    await s.request('POST', `/v1/admin/users/${a.user.id}/grants`, { token: admin, body: { plan: 'yearly', reason: 'Gift for testing' } });
    await s.request('POST', `/v1/admin/users/${a.user.id}/notes`, { token: admin, body: { body: 'Private note' } });
    await s.request('POST', `/v1/admin/users/${a.user.id}/reset-code`, { token: admin });
    await s.request('POST', '/v1/admin/promo-codes', { token: admin, body: { code: 'CASCADE-1', plan: 'monthly' } });
    await s.request('POST', '/v1/promo/redeem', { token: a.token, body: { code: 'CASCADE-1' } });
    addStoreSubscription(a.user.id, { willRenew: 0 });
    s.db.prepare(
      `INSERT INTO webhook_events (id, type, app_user_id, user_id, received_at, status, payload) VALUES ('evt-cascade', 'RENEWAL', ?, ?, ?, 'processed', '{}')`,
    ).run(a.user.id, a.user.id, s.clock.now());
    const signIn = await s.signIn('cascade@example.com', PASSWORD, { token: g.token });
    assert.equal(signIn.body.merged, null);
    assert.equal(count(s.db, "SELECT count(*) AS n FROM users WHERE id = ? AND status = 'merged'", g.user.id), 1);
    const auditBefore = count(s.db, 'SELECT count(*) AS n FROM audit_log WHERE target_user_id = ?', a.user.id);
    assert.ok(auditBefore >= 3);

    const res = await s.request('DELETE', '/v1/me', { token: signIn.body.token, body: { password: PASSWORD } });
    assert.equal(res.status, 204);
    for (const table of ['sessions', 'devices', 'grants', 'store_subscriptions', 'promo_redemptions', 'notes', 'password_reset_tokens']) {
      assert.equal(count(s.db, `SELECT count(*) AS n FROM ${table} WHERE user_id = ?`, a.user.id), 0, table);
    }
    assert.equal(count(s.db, 'SELECT count(*) AS n FROM users WHERE id IN (?, ?)', a.user.id, g.user.id), 0);
    assert.equal(count(s.db, "SELECT count(*) AS n FROM webhook_events WHERE id = 'evt-cascade'"), 0);
    const audit = rows<{ action: string; details: string; actor_label: string; target_label: string }>(
      s.db, 'SELECT action, details, actor_label, target_label FROM audit_log WHERE target_user_id = ? ORDER BY id', a.user.id,
    );
    const last = audit.at(-1)!;
    assert.equal(last.action, 'user.delete');
    assert.deepEqual(JSON.parse(last.details), { by: 'self', hadStoreSubscription: true });
    assert.equal(last.target_label, a.user.publicId);
    for (const e of audit.slice(0, -1)) assert.equal(e.details, '{"scrubbed":true}', e.action);
    // Promo capacity is not freed.
    assert.equal(count(s.db, "SELECT redemption_count AS n FROM promo_codes WHERE code = 'CASCADE-1'"), 1);
  });

  it('the last admin cannot delete the account', async () => {
    const t = await startTestServer();
    try {
      const admin = await t.adminToken('only@example.com');
      const res = await t.request('DELETE', '/v1/me', { token: admin, body: { password: 'admin password 2026!' } });
      assert.equal(res.status, 409);
      assert.equal(res.body.error.code, 'last_admin');
    } finally {
      await t.close();
    }
  });
});
