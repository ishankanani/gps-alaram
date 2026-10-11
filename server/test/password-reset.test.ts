import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';

import { MINUTE } from '../src/clock.ts';
import { PASSWORD, startTestServer, type TestServer } from './helpers.ts';

let s: TestServer;
before(async () => {
  s = await startTestServer();
});
after(() => s.close());

const codeFromMail = (to: string): string => {
  const mail = s.mail.filter((m) => m.to === to && m.kind === 'reset_code').at(-1);
  assert.ok(mail, `a reset mail to ${to}`);
  return /reset code is: ([0-9A-Z]{4}-[0-9A-Z]{4})/.exec(mail.text)![1]!;
};

const reset = (email: string, code: string, newPassword = 'a brand new passphrase') =>
  s.request('POST', '/v1/auth/reset-password', { body: { email, code, newPassword, installId: randomUUID() } });

describe('forgot and reset password', () => {
  it('forgot answers 202 for known and unknown emails; only the known one gets mail', async () => {
    await s.account('forgot@example.com');
    const before = s.mail.length;
    const known = await s.request('POST', '/v1/auth/forgot-password', { body: { email: 'Forgot@Example.com' } });
    const unknown = await s.request('POST', '/v1/auth/forgot-password', { body: { email: 'ghost@example.com' } });
    assert.equal(known.status, 202);
    assert.equal(unknown.status, 202);
    assert.deepEqual(known.body, { ok: true });
    assert.deepEqual(unknown.body, known.body);
    assert.equal(s.mail.length, before + 1);
    const mail = s.mail.at(-1)!;
    assert.equal(mail.to, 'forgot@example.com');
    assert.match(mail.subject, /^Your StopWake reset code: [0-9A-Z]{4}-[0-9A-Z]{4}$/);
    assert.match(mail.text, /expires in 30 minutes/);
    assert.match(mail.text, /support@example\.com/);
  });

  it('reset signs in, revokes every other session, verifies the email and mails a notice', async () => {
    const a = await s.account('reset-ok@example.com');
    await s.request('POST', '/v1/auth/forgot-password', { body: { email: 'reset-ok@example.com' } });
    const code = codeFromMail('reset-ok@example.com');
    const res = await reset('reset-ok@example.com', code.toLowerCase().replace('-', ' '));
    assert.equal(res.status, 200);
    assert.equal(res.body.user.email, 'reset-ok@example.com');
    assert.equal(res.body.user.emailVerified, true);
    assert.match(res.body.token, /^sw_/);
    assert.equal((await s.request('GET', '/v1/me', { token: a.token })).status, 401);
    assert.equal((await s.signIn('reset-ok@example.com', 'a brand new passphrase')).status, 200);
    assert.equal((await s.signIn('reset-ok@example.com', PASSWORD)).status, 401);
    assert.equal(s.mail.at(-1)!.kind, 'password_changed');
    // Used: the same code fails now.
    const again = await reset('reset-ok@example.com', code);
    assert.equal(again.body.error.code, 'invalid_reset_code');
  });

  it('5 wrong attempts kill the code', async () => {
    await s.account('attempts@example.com');
    await s.request('POST', '/v1/auth/forgot-password', { body: { email: 'attempts@example.com' } });
    const code = codeFromMail('attempts@example.com');
    for (let i = 0; i < 5; i++) {
      const wrong = await reset('attempts@example.com', 'ZZZZ-ZZZZ');
      assert.equal(wrong.status, 400);
      assert.equal(wrong.body.error.code, 'invalid_reset_code');
    }
    assert.equal((await reset('attempts@example.com', code)).body.error.code, 'invalid_reset_code');
  });

  it('an expired code fails', async () => {
    await s.account('expired@example.com');
    await s.request('POST', '/v1/auth/forgot-password', { body: { email: 'expired@example.com' } });
    const code = codeFromMail('expired@example.com');
    s.clock.advance(31 * MINUTE);
    assert.equal((await reset('expired@example.com', code)).body.error.code, 'invalid_reset_code');
  });

  it('a new forgot invalidates the old code', async () => {
    await s.account('twice@example.com');
    await s.request('POST', '/v1/auth/forgot-password', { body: { email: 'twice@example.com' } });
    const first = codeFromMail('twice@example.com');
    await s.request('POST', '/v1/auth/forgot-password', { body: { email: 'twice@example.com' } });
    const second = codeFromMail('twice@example.com');
    assert.notEqual(first, second);
    assert.equal((await reset('twice@example.com', first)).body.error.code, 'invalid_reset_code');
    assert.equal((await reset('twice@example.com', second)).status, 200);
  });

  it('unknown emails and malformed codes give the same error; policy errors keep the code', async () => {
    const unknown = await reset('nobody@example.com', 'ABCD-EFGH');
    assert.equal(unknown.status, 400);
    assert.equal(unknown.body.error.code, 'invalid_reset_code');
    await s.account('policy@example.com');
    await s.request('POST', '/v1/auth/forgot-password', { body: { email: 'policy@example.com' } });
    const code = codeFromMail('policy@example.com');
    const weak = await reset('policy@example.com', code, 'password');
    assert.equal(weak.status, 400);
    assert.equal(weak.body.error.fields.newPassword, 'too_common');
    assert.equal((await reset('policy@example.com', code)).status, 200);
  });
});

describe('MAIL_MODE=off', () => {
  it('forgot answers 503 mail_unavailable; a reset with an admin code still works', async () => {
    const t = await startTestServer({ env: { MAIL_MODE: 'off' } });
    try {
      const a = await t.account('nomail@example.com');
      const forgot = await t.request('POST', '/v1/auth/forgot-password', { body: { email: 'nomail@example.com' } });
      assert.equal(forgot.status, 503);
      assert.equal(forgot.body.error.code, 'mail_unavailable');
      const config = await t.request('GET', '/v1/config');
      assert.equal(config.body.auth.passwordReset, false);
      const admin = await t.adminToken();
      const issued = await t.request('POST', `/v1/admin/users/${a.user.id}/reset-code`, { token: admin });
      assert.equal(issued.status, 201);
      assert.match(issued.body.code, /^[0-9A-Z]{4}-[0-9A-Z]{4}$/);
      assert.equal(Date.parse(issued.body.expiresAt) - t.clock.now(), 60 * MINUTE);
      const res = await t.request('POST', '/v1/auth/reset-password', {
        body: { email: 'nomail@example.com', code: issued.body.code, newPassword: 'another fine passphrase', installId: randomUUID() },
      });
      assert.equal(res.status, 200);
      // Admin codes do not verify the email address.
      assert.equal(res.body.user.emailVerified, false);
    } finally {
      await t.close();
    }
  });
});
