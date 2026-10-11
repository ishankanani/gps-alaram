/**
 * HTTP hygiene (spec 2.1, 2.3, 2.5, 4.7): 404 and 405 JSON with Allow, 415, 413, malformed JSON,
 * request ids, security headers, no CORS, internal errors, health, and the static pages.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { after, before, describe, it } from 'node:test';

import { iso, SECOND } from '../src/clock.ts';
import { startTestServer, type TestResponse, type TestServer } from './helpers.ts';

let s: TestServer;
before(async () => {
  s = await startTestServer();
});
after(() => s.close());

const CSP = "default-src 'none'; frame-ancestors 'none'";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function assertSecurityHeaders(res: TestResponse, opts: { hsts?: boolean } = {}): void {
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
  assert.ok(res.headers.get('content-security-policy'));
  assert.ok(res.headers.get('x-request-id'));
  assert.equal(res.headers.get('strict-transport-security'), opts.hsts === false ? null : 'max-age=31536000');
  for (const name of res.headers.keys()) assert.ok(!name.startsWith('access-control-'), `no CORS header (${name})`);
}

function assertError(res: TestResponse, status: number, code: string): void {
  assert.equal(res.status, status, res.text);
  assert.equal(res.headers.get('content-type'), 'application/json; charset=utf-8');
  assert.equal(res.body.error.code, code);
  assert.equal(typeof res.body.error.message, 'string');
  assertSecurityHeaders(res);
}

/** A raw request, for bodies and headers fetch will not send. */
function raw(method: string, path: string, headers: Record<string, string>, body?: Buffer | string): Promise<{ status: number; headers: Record<string, unknown>; text: string }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(`${s.url}${path}`, { method, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers, text: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

describe('routing errors', () => {
  it('unknown paths → 404 not_found as JSON', async () => {
    for (const path of ['/nope', '/v1', '/v1/me/', '/v2/me', '/v1/admin/users/a/b/c/d']) {
      assertError(await s.request('GET', path), 404, 'not_found');
    }
  });

  it('a known path with another method → 405 method_not_allowed with Allow', async () => {
    const cases: [string, string, string][] = [
      ['GET', '/v1/auth/guest', 'POST'],
      ['PUT', '/v1/me', 'GET, PATCH, DELETE'],
      ['DELETE', '/v1/health', 'GET'],
      ['POST', '/v1/admin/users', 'GET'],
      ['PATCH', '/v1/admin/prices/DE', 'PUT, DELETE'],
      ['OPTIONS', '/v1/config', 'GET'],
      ['OPTIONS', '/v1/admin/promo-codes', 'GET, POST'],
    ];
    for (const [method, path, allow] of cases) {
      const res = await s.request(method, path, { headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' } });
      assertError(res, 405, 'method_not_allowed');
      assert.equal(res.headers.get('allow'), allow, `${method} ${path}`);
    }
  });

  it('path ids that fail their pattern are 404 before any query', async () => {
    const admin = await s.adminToken();
    const cases: [string, string][] = [
      ['GET', '/v1/admin/promo-codes/abc'], ['GET', '/v1/admin/promo-codes/0'], ['PATCH', '/v1/admin/notes/1.5'],
      ['DELETE', '/v1/admin/notes/-1'], ['GET', '/v1/admin/users/%E0%A4%A'], ['GET', '/v1/admin/users/semi;colon'],
      ['DELETE', '/v1/admin/prices/de'], ['PUT', '/v1/admin/prices/DEU'],
    ];
    for (const [method, path] of cases) {
      const res = await s.request(method, path, { token: admin, body: method === 'GET' ? undefined : {} });
      assertError(res, 404, 'not_found');
    }
  });
});

describe('request bodies', () => {
  const forgot = (opts: { body?: string | Buffer; headers?: Record<string, string> }) =>
    raw('POST', '/v1/auth/forgot-password', { 'X-Client': 'android/1.0.0/12/14', ...opts.headers }, opts.body);
  const parse = (r: { text: string }) => JSON.parse(r.text) as { error: { code: string } };

  it('other content types → 415', async () => {
    const body = '{"email":"a@example.com"}';
    for (const type of ['text/plain', 'application/x-www-form-urlencoded', 'application/json; charset=latin1', 'application/jsonx']) {
      const r = await forgot({ body, headers: { 'Content-Type': type } });
      assert.equal(r.status, 415, type);
      assert.equal(parse(r).error.code, 'unsupported_media_type');
    }
    const untyped = await forgot({ body });
    assert.equal(untyped.status, 415, 'a body needs a content type');
    for (const type of ['application/json', 'application/json; charset=utf-8', 'Application/JSON; charset="utf-8"']) {
      assert.equal((await forgot({ body, headers: { 'Content-Type': type } })).status, 202, type);
    }
  });

  it('bodies over 16 KB → 413 (declared or streamed)', async () => {
    const big = JSON.stringify({ email: 'a@example.com', padding: 'x'.repeat(17 * 1024) });
    const r = await forgot({ body: big, headers: { 'Content-Type': 'application/json' } });
    assert.equal(r.status, 413);
    assert.equal(parse(r).error.code, 'payload_too_large');
    const chunked = await forgot({ body: big, headers: { 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' } });
    assert.equal(chunked.status, 413);
    const fits = JSON.stringify({ email: 'a@example.com', padding: 'x'.repeat(15 * 1024) });
    assert.equal((await forgot({ body: fits, headers: { 'Content-Type': 'application/json' } })).status, 202);
  });

  it('the webhook accepts up to 256 KB', async () => {
    const event = { id: 'evt-big-body', type: 'TEST' };
    const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer test-webhook-secret' };
    const ok = await raw('POST', '/v1/webhooks/revenuecat', headers, JSON.stringify({ api_version: '1.0', event, padding: 'x'.repeat(200 * 1024) }));
    assert.equal(ok.status, 200, ok.text);
    const tooBig = await raw('POST', '/v1/webhooks/revenuecat', headers, JSON.stringify({ event: { ...event, id: 'evt-2' }, padding: 'x'.repeat(260 * 1024) }));
    assert.equal(tooBig.status, 413);
  });

  it('malformed JSON, non-objects and invalid UTF-8 → 400 bad_request', async () => {
    const headers = { 'Content-Type': 'application/json' };
    for (const body of ['{"email": ', '[]', 'null', '"text"', '42', Buffer.from([0x7b, 0x22, 0xff, 0xfe, 0x22, 0x7d])]) {
      const r = await forgot({ body, headers });
      assert.equal(r.status, 400, String(body));
      assert.equal(parse(r).error.code, 'bad_request');
    }
  });

  it('an empty body counts as {}; unknown fields are ignored', async () => {
    const g = await s.guest();
    const empty = await raw('POST', '/v1/auth/sign-out-all', { Authorization: `Bearer ${g.token}` });
    assert.equal(empty.status, 200, empty.text);
    assert.deepEqual(JSON.parse(empty.text), { revoked: 0 });
    const blank = await raw('POST', '/v1/auth/sign-out-all', { Authorization: `Bearer ${g.token}`, 'Content-Type': 'application/json' }, '  \n');
    assert.equal(blank.status, 200);
    const extra = await s.request('POST', '/v1/auth/forgot-password', { body: { email: 'a@example.com', isAdmin: true, role: 'admin' } });
    assert.equal(extra.status, 202);
    const missing = await forgot({ headers: { 'Content-Type': 'application/json' } });
    assert.equal(missing.status, 400);
    assert.equal(JSON.parse(missing.text).error.fields.email, 'required');
  });
});

describe('headers', () => {
  it('echoes a well-formed X-Request-Id and generates one otherwise', async () => {
    const echoed = await s.request('GET', '/v1/health', { headers: { 'X-Request-Id': 'client-req-0001' } });
    assert.equal(echoed.headers.get('x-request-id'), 'client-req-0001');
    for (const bad of ['short', 'has spaces in it', 'x'.repeat(65), 'semi;colon-1234']) {
      const res = await s.request('GET', '/v1/health', { headers: { 'X-Request-Id': bad } });
      assert.match(res.headers.get('x-request-id')!, UUID_RE, bad);
    }
    assert.match((await s.request('GET', '/v1/health')).headers.get('x-request-id')!, UUID_RE);
    assert.equal((await s.request('GET', '/nope', { headers: { 'X-Request-Id': 'error-req-0001' } })).headers.get('x-request-id'), 'error-req-0001');
  });

  it('every response carries the security headers, no-store by default, and never CORS headers', async () => {
    const g = await s.guest({ headers: { Origin: 'https://evil.example' } });
    const me = await s.request('GET', '/v1/me', { token: g.token, headers: { Origin: 'https://evil.example' } });
    assertSecurityHeaders(me);
    assert.equal(me.headers.get('content-security-policy'), CSP);
    assert.equal(me.headers.get('cache-control'), 'no-store');
    assert.equal(me.headers.get('content-type'), 'application/json; charset=utf-8');
    const health = await s.request('GET', '/v1/health');
    assertSecurityHeaders(health);
    assert.equal(health.headers.get('cache-control'), 'no-store');
    const config = await s.request('GET', '/v1/config');
    assertSecurityHeaders(config);
    assert.equal(config.headers.get('cache-control'), 'public, max-age=300');
    assertSecurityHeaders(await s.request('POST', '/v1/auth/guest', { body: {} }));
  });

  it('HSTS only when PUBLIC_URL is https', async () => {
    const t = await startTestServer({ env: { PUBLIC_URL: 'http://localhost:8787' } });
    try {
      const res = await t.request('GET', '/v1/health');
      assertSecurityHeaders(res, { hsts: false });
    } finally {
      await t.close();
    }
  });
});

describe('GET /v1/health', () => {
  it('answers HealthResponse with no-store', async () => {
    const t = await startTestServer({ env: { GIT_COMMIT: 'abc1234' } });
    try {
      t.clock.advance(90 * SECOND);
      const res = await t.request('GET', '/v1/health');
      assert.equal(res.status, 200);
      assert.deepEqual(res.body, { ok: true, version: '1.0.0', commit: 'abc1234', time: iso(t.clock.now()), uptimeSeconds: 90 });
      assert.equal(res.headers.get('cache-control'), 'no-store');
      assert.equal((await s.request('GET', '/v1/health')).body.commit, null);
    } finally {
      await t.close();
    }
  });

  it('answers 503 unavailable when the database fails', async () => {
    const t = await startTestServer();
    const original = t.db.prepare.bind(t.db);
    try {
      t.db.prepare = ((sql: string) => {
        if (sql.startsWith('SELECT 1')) throw new Error('disk I/O error');
        return original(sql);
      }) as typeof t.db.prepare;
      const res = await t.request('GET', '/v1/health');
      assert.equal(res.status, 503);
      assert.equal(res.body.error.code, 'unavailable');
    } finally {
      t.db.prepare = original;
      await t.close();
    }
  });
});

describe('unexpected errors', () => {
  it('are logged with their stack and answered with internal plus the request id', async () => {
    const t = await startTestServer({ env: { LOG_LEVEL: 'error' } });
    try {
      t.db.exec('DROP TABLE settings');
      const res = await t.request('GET', '/v1/config', { headers: { 'X-Request-Id': 'boom-request-1' } });
      assert.equal(res.status, 500);
      assert.equal(res.body.error.code, 'internal');
      assert.match(res.body.error.message, /boom-request-1/);
      assert.ok(!res.text.includes('no such table'), 'no internals leak to the client');
      assert.equal(res.headers.get('x-request-id'), 'boom-request-1');
      const line = t.logs.map((l) => JSON.parse(l)).find((l) => l.msg === 'unexpected error');
      assert.ok(line, t.logs.join('\n'));
      assert.equal(line.id, 'boom-request-1');
      assert.equal(line.route, '/v1/config');
      assert.match(JSON.stringify(line.error), /no such table: settings/);
      assert.match(JSON.stringify(line.error), /at /, 'with the stack');
    } finally {
      await t.close();
    }
  });
});

describe('static pages', () => {
  it('serve HTML with the placeholders substituted', async () => {
    const admin = await s.adminToken();
    await s.request('PATCH', '/v1/admin/settings', { token: admin, body: { values: { 'support.email': 'privacy@stopwake.example' } } });
    for (const name of ['privacy', 'terms', 'account-deletion']) {
      const template = readFileSync(new URL(`../static/${name}.html`, import.meta.url), 'utf8');
      assert.ok(template.includes('{{SUPPORT_EMAIL}}'), `${name} has placeholders`);
      const res = await s.request('GET', `/${name}`);
      assert.equal(res.status, 200, name);
      assert.equal(res.headers.get('content-type'), 'text/html; charset=utf-8');
      assert.equal(res.headers.get('cache-control'), 'public, max-age=3600');
      assert.equal(res.headers.get('content-security-policy'), "default-src 'none'; style-src 'unsafe-inline'");
      assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
      assert.ok(!res.text.includes('{{'), `${name}: every placeholder is substituted`);
      assert.ok(res.text.includes('privacy@stopwake.example'), name);
      if (template.includes('{{PUBLIC_URL}}')) assert.ok(res.text.includes('https://api.example.com'), name);
    }
    const deletion = (await s.request('GET', '/account-deletion')).text;
    assert.match(deletion, /Delete account/);
    assert.match(deletion, /StopWake ID/);
    assert.match(deletion, /30 days/);
    await s.request('PATCH', '/v1/admin/settings', { token: admin, body: { values: { 'support.email': null } } });
    assert.ok((await s.request('GET', '/terms')).text.includes('support@example.com'));
  });
});
