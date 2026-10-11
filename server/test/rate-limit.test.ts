/**
 * Rate limits (spec 4.3): fixed windows with Retry-After, the rules table, client IP derivation
 * behind TRUST_PROXY hops, the sign-in failure counters (per email + IP and per email), guests
 * per IP, per-user limits, and the webhook's exemption from the global limit.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { describe, it } from 'node:test';

import { createTestClock, MINUTE } from '../src/clock.ts';
import { ApiError } from '../src/http/errors.ts';
import { createRateLimiter, RULES } from '../src/http/rate-limit.ts';
import { clientIp, ipRateKey } from '../src/http/request.ts';
import { getUserByEmail } from '../src/domain/users.ts';
import { PASSWORD, rows, startTestServer, type TestServer } from './helpers.ts';

const limited = (fn: () => void): ApiError => {
  try {
    fn();
  } catch (err) {
    assert.ok(err instanceof ApiError);
    assert.equal(err.status, 429);
    assert.equal(err.code, 'rate_limited');
    return err;
  }
  assert.fail('expected 429 rate_limited');
};

describe('the limiter', () => {
  it('matches the rules table of 4.3', () => {
    const table = Object.fromEntries(Object.entries(RULES).map(([name, r]) => [name, [r.limit, r.windowMs / MINUTE, r.key]]));
    assert.deepEqual(table, {
      global: [1200, 10, 'ip'],
      guest: [60, 10, 'ip'],
      signup: [10, 60, 'ip'],
      signin: [30, 15, 'ip'],
      signinFailEmailIp: [5, 15, 'email+ip'],
      signinFailEmail: [20, 60, 'email'],
      forgot: [10, 60, 'ip'],
      forgotEmail: [3, 60, 'email'],
      reset: [20, 60, 'ip'],
      redeemUser: [10, 60, 'user'],
      redeemIp: [30, 60, 'ip'],
      sync: [6, 60, 'user'],
      account: [20, 60, 'user'],
      admin: [600, 10, 'user'],
    });
  });

  it('uses fixed windows: full → 429 with the seconds until the window ends, then resets', () => {
    const clock = createTestClock();
    const limiter = createRateLimiter({ clock });
    for (let i = 0; i < 60; i++) limiter.consume('guest', '198.51.100.1');
    const first = limited(() => limiter.consume('guest', '198.51.100.1'));
    assert.equal(first.retryAfterSeconds, 600);
    assert.deepEqual(first.headers, { 'Retry-After': '600' });
    clock.advance(4 * MINUTE + 30_500);
    assert.equal(limited(() => limiter.consume('guest', '198.51.100.1')).retryAfterSeconds, 330);
    limiter.consume('guest', '198.51.100.2'); // other keys are independent
    clock.advance(5 * MINUTE + 29_500);
    limiter.consume('guest', '198.51.100.1');
    for (let i = 1; i < 60; i++) limiter.consume('guest', '198.51.100.1');
    limited(() => limiter.consume('guest', '198.51.100.1'));
  });

  it('check() does not count; record() counts without checking', () => {
    const clock = createTestClock();
    const limiter = createRateLimiter({ clock });
    for (let i = 0; i < 10; i++) limiter.check('signinFailEmailIp', 'k');
    for (let i = 0; i < 5; i++) limiter.record('signinFailEmailIp', 'k');
    limited(() => limiter.check('signinFailEmailIp', 'k'));
    limiter.record('signinFailEmailIp', 'k'); // never throws
    clock.advance(15 * MINUTE);
    limiter.check('signinFailEmailIp', 'k');
  });

  it('can be switched off; sweeps expired windows; caps the number of keys', () => {
    const clock = createTestClock();
    const off = createRateLimiter({ clock, enabled: false });
    for (let i = 0; i < 100; i++) off.consume('sync', 'u');
    assert.equal(off.size(), 0);

    const limiter = createRateLimiter({ clock, maxKeys: 10 });
    for (let i = 0; i < 25; i++) limiter.consume('guest', `10.0.0.${i}`);
    assert.ok(limiter.size() <= 10, String(limiter.size()));
    clock.advance(10 * MINUTE);
    limiter.sweep();
    assert.equal(limiter.size(), 0);
  });
});

describe('client IP derivation', () => {
  const req = (remoteAddress: string, xff?: string | string[]) =>
    ({ headers: xff === undefined ? {} : { 'x-forwarded-for': xff }, socket: { remoteAddress } }) as unknown as IncomingMessage;

  it('TRUST_PROXY=0 uses the socket address and ignores X-Forwarded-For', () => {
    assert.equal(clientIp(req('10.0.0.1', '203.0.113.9'), 0), '10.0.0.1');
    assert.equal(clientIp(req('::ffff:127.0.0.1'), 0), '127.0.0.1');
  });

  it('TRUST_PROXY=n takes the entry n positions from the right of X-Forwarded-For + [socket]', () => {
    assert.equal(clientIp(req('10.0.0.1', '203.0.113.9'), 1), '203.0.113.9');
    assert.equal(clientIp(req('10.0.0.1', '198.51.100.4, 203.0.113.9'), 1), '203.0.113.9');
    assert.equal(clientIp(req('10.0.0.1', '198.51.100.4, 203.0.113.9'), 2), '198.51.100.4');
    assert.equal(clientIp(req('10.0.0.1', ['198.51.100.4', '203.0.113.9']), 2), '198.51.100.4');
    // A client cannot spoof its address by adding entries on the left.
    assert.equal(clientIp(req('10.0.0.1', '1.2.3.4, 6.6.6.6, 203.0.113.9'), 1), '203.0.113.9');
    // Fewer entries than hops: the leftmost one.
    assert.equal(clientIp(req('10.0.0.1', '203.0.113.9'), 3), '203.0.113.9');
    // No header: the socket address.
    assert.equal(clientIp(req('10.0.0.1'), 1), '10.0.0.1');
    // Garbage is never used.
    assert.equal(clientIp(req('10.0.0.1', 'not-an-ip'), 1), '10.0.0.1');
    assert.equal(clientIp(req('10.0.0.1', '[2001:db8::7]'), 1), '2001:db8::7');
    assert.equal(clientIp(req('10.0.0.1', '203.0.113.9:4711'), 1), '203.0.113.9');
  });

  it('per-IP keys: IPv4 as is, IPv6 by /64', () => {
    assert.equal(ipRateKey('203.0.113.9'), '203.0.113.9');
    assert.equal(ipRateKey('2001:db8:1:2:3:4:5:6'), '2001:db8:1:2::/64');
    assert.equal(ipRateKey('2001:db8:1:2:ffff::1'), '2001:db8:1:2::/64');
    assert.equal(ipRateKey('2001:db8::1'), '2001:db8:0:0::/64');
  });
});

/** A server with rate limits on; requests carry X-Forwarded-For when `ip` is given (TRUST_PROXY=1). */
async function limitedServer(trustProxy = '1'): Promise<TestServer> {
  return startTestServer({ env: { RATE_LIMITS: 'on', TRUST_PROXY: trustProxy } });
}
const from = (ip: string) => ({ 'X-Forwarded-For': ip });

describe('guests per IP (60 / 10 min)', () => {
  it('answers 429 with Retry-After, per derived client IP, and resets after the window', async () => {
    const s = await limitedServer();
    try {
      const guest = (ip: string) => s.request('POST', '/v1/auth/guest', { body: { installId: randomUUID() }, headers: from(ip) });
      for (let i = 0; i < 60; i++) assert.equal((await guest('203.0.113.5')).status, 201);
      const res = await guest('203.0.113.5');
      assert.equal(res.status, 429);
      assert.equal(res.body.error.code, 'rate_limited');
      assert.equal(res.body.error.retryAfterSeconds, 600);
      assert.equal(res.headers.get('retry-after'), '600');
      assert.equal((await guest('203.0.113.6')).status, 201, 'another client IP has its own window');
      s.clock.advance(10 * MINUTE);
      assert.equal((await guest('203.0.113.5')).status, 201);
    } finally {
      await s.close();
    }
  });

  it('with TRUST_PROXY=0 the header is ignored: all requests share the socket address', async () => {
    const s = await limitedServer('0');
    try {
      const guest = (ip: string) => s.request('POST', '/v1/auth/guest', { body: { installId: randomUUID() }, headers: from(ip) });
      for (let i = 0; i < 60; i++) assert.equal((await guest(`203.0.113.${i}`)).status, 201);
      assert.equal((await guest('198.51.100.77')).status, 429);
    } finally {
      await s.close();
    }
  });

  it('the derived IP is what admin audit rows record', async () => {
    const s = await limitedServer();
    try {
      const token = await s.adminToken();
      const u = await s.account('audited.ip@example.com');
      const res = await s.request('POST', `/v1/admin/users/${u.user.id}/sign-out-all`, { token, body: {}, headers: from('192.0.2.44') });
      assert.equal(res.status, 200);
      const [row] = rows<{ ip: string }>(s.db, "SELECT ip FROM audit_log WHERE action = 'user.sign_out_all'");
      assert.equal(row!.ip, '192.0.2.44');
    } finally {
      await s.close();
    }
  });
});

describe('sign-in failure counters', () => {
  it('5 failures per (email, IP) in 15 min, checked before the password; successes do not count', async () => {
    const s = await limitedServer();
    try {
      await s.account('locked@example.com');
      const signIn = (password: string, ip: string, email = 'locked@example.com') =>
        s.request('POST', '/v1/auth/sign-in', { body: { email, password, installId: randomUUID() }, headers: from(ip) });
      for (let i = 0; i < 3; i++) assert.equal((await signIn(PASSWORD, '203.0.113.1')).status, 200);
      for (let i = 0; i < 5; i++) {
        const res = await signIn('wrong password!', '203.0.113.1');
        assert.equal(res.status, 401);
        assert.equal(res.body.error.code, 'invalid_credentials');
      }
      const blocked = await signIn(PASSWORD, '203.0.113.1');
      assert.equal(blocked.status, 429, 'even the right password');
      assert.equal(blocked.body.error.code, 'rate_limited');
      assert.ok(Number(blocked.headers.get('retry-after')) > 0);
      assert.equal((await signIn('wrong password!', '203.0.113.1', 'LOCKED@example.com')).status, 429, 'the email is normalized');
      assert.equal((await signIn(PASSWORD, '203.0.113.2')).status, 200, 'another IP is not blocked');
      s.clock.advance(15 * MINUTE);
      assert.equal((await signIn(PASSWORD, '203.0.113.1')).status, 200);
    } finally {
      await s.close();
    }
  });

  it('20 failures per email in an hour, across IPs; unknown emails count too', async () => {
    const s = await limitedServer();
    try {
      await s.account('target@example.com');
      const signIn = (password: string, ip: string, email = 'target@example.com') =>
        s.request('POST', '/v1/auth/sign-in', { body: { email, password, installId: randomUUID() }, headers: from(ip) });
      for (let ip = 1; ip <= 4; ip++) {
        for (let i = 0; i < 5; i++) assert.equal((await signIn('wrong password!', `198.51.100.${ip}`)).status, 401);
      }
      assert.equal((await signIn(PASSWORD, '198.51.100.99')).status, 429);
      s.clock.advance(15 * MINUTE);
      assert.equal((await signIn(PASSWORD, '198.51.100.99')).status, 429, 'the per-email window is an hour');
      s.clock.advance(45 * MINUTE);
      assert.equal((await signIn(PASSWORD, '198.51.100.99')).status, 200);

      for (let i = 0; i < 5; i++) assert.equal((await signIn('whatever pw', '198.51.100.7', 'nobody@example.com')).status, 401);
      assert.equal((await signIn('whatever pw', '198.51.100.7', 'nobody@example.com')).status, 429);
    } finally {
      await s.close();
    }
  });

  it('sign-in attempts per IP: 30 / 15 min', async () => {
    const s = await limitedServer();
    try {
      const signIn = (i: number) => s.request('POST', '/v1/auth/sign-in', {
        body: { email: `someone${i}@example.com`, password: 'wrong password!', installId: randomUUID() }, headers: from('192.0.2.1'),
      });
      for (let i = 0; i < 30; i++) assert.equal((await signIn(i)).status, 401);
      assert.equal((await signIn(31)).status, 429);
    } finally {
      await s.close();
    }
  });
});

describe('per-user and global limits', () => {
  it('account routes: 20 / h per user, independent of the IP', async () => {
    const s = await limitedServer();
    try {
      const a = await s.account('busy@example.com');
      const b = await s.account('calm@example.com');
      for (let i = 0; i < 20; i++) {
        assert.equal((await s.request('PATCH', '/v1/me', { token: a.token, body: { displayName: `Name ${i}` }, headers: from(`203.0.113.${i}`) })).status, 200);
      }
      assert.equal((await s.request('PATCH', '/v1/me', { token: a.token, body: { displayName: 'Again' }, headers: from('203.0.113.200') })).status, 429);
      assert.equal((await s.request('PATCH', '/v1/me', { token: b.token, body: { displayName: 'Other user' } })).status, 200);
      assert.equal((await s.request('GET', '/v1/me', { token: a.token })).status, 200, 'GET /v1/me only has the global limit');
    } finally {
      await s.close();
    }
  });

  it('admin routes: 600 / 10 min per admin', async () => {
    const s = await limitedServer();
    try {
      const token = await s.adminToken();
      const second = await s.adminToken('second.admin@example.com');
      const me = getUserByEmail(s.db, 'root@example.com')!;
      for (let i = 0; i < 600; i++) s.app.context.limiter.consume('admin', me.id);
      const res = await s.request('GET', '/v1/admin/dashboard', { token });
      assert.equal(res.status, 429);
      assert.equal((await s.request('GET', '/v1/admin/dashboard', { token: second })).status, 200);
      assert.equal((await s.request('GET', '/v1/me', { token })).status, 200, 'only admin routes count');
    } finally {
      await s.close();
    }
  });

  it('global: 1200 / 10 min per IP on every route except the webhook', async () => {
    const s = await limitedServer();
    try {
      for (let i = 0; i < 1200; i++) s.app.context.limiter.consume('global', '192.0.2.200');
      const health = await s.request('GET', '/v1/health', { headers: from('192.0.2.200') });
      assert.equal(health.status, 429);
      assert.equal((await s.request('GET', '/privacy', { headers: from('192.0.2.200') })).status, 429);
      const webhook = await s.request('POST', '/v1/webhooks/revenuecat', {
        body: { event: { id: 'evt-global-1', type: 'TEST' } }, headers: { ...from('192.0.2.200'), Authorization: 'Bearer test-webhook-secret' },
      });
      assert.equal(webhook.status, 200, webhook.text);
      assert.equal((await s.request('GET', '/v1/health', { headers: from('192.0.2.201') })).status, 200);
      s.clock.advance(10 * MINUTE);
      assert.equal((await s.request('GET', '/v1/health', { headers: from('192.0.2.200') })).status, 200);
    } finally {
      await s.close();
    }
  });

  it('RATE_LIMITS=off disables every limit', async () => {
    const s = await startTestServer({ env: { RATE_LIMITS: 'off' } });
    try {
      for (let i = 0; i < 70; i++) assert.equal((await s.request('POST', '/v1/auth/guest', { body: { installId: randomUUID() } })).status, 201);
      assert.equal(s.app.context.limiter.enabled, false);
    } finally {
      await s.close();
    }
  });
});
