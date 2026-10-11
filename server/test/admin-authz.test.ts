/**
 * Admin authorisation (spec 2.1, 4.5, 6.11): every route under /v1/admin, taken from the router's
 * own table, refuses a missing token (401), a guest (403), a plain account (403) and an admin
 * session older than ADMIN_SESSION_DAYS (401 reauth_required); a fresh admin session gets through.
 * The router refuses to register an admin path without admin auth.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { buildRouter } from '../src/app.ts';
import { DAY } from '../src/clock.ts';
import type { RequestContext } from '../src/context.ts';
import { json } from '../src/http/response.ts';
import { Router } from '../src/http/router.ts';
import { ADMIN_PASSWORD, startTestServer, type Session, type TestServer } from './helpers.ts';

/** The admin rows of the route index (2.4), in order. */
const SPEC_ADMIN_ROUTES = [
  'GET /v1/admin/dashboard',
  'GET /v1/admin/users',
  'GET /v1/admin/users/:id',
  'PATCH /v1/admin/users/:id',
  'DELETE /v1/admin/users/:id',
  'POST /v1/admin/users/:id/grants',
  'POST /v1/admin/users/:id/grants/:grantId/revoke',
  'POST /v1/admin/users/:id/extend',
  'POST /v1/admin/users/:id/plan',
  'POST /v1/admin/users/:id/role',
  'POST /v1/admin/users/:id/disable',
  'POST /v1/admin/users/:id/enable',
  'POST /v1/admin/users/:id/sign-out-all',
  'POST /v1/admin/users/:id/reset-code',
  'POST /v1/admin/users/:id/sync',
  'POST /v1/admin/users/:id/notes',
  'PATCH /v1/admin/notes/:noteId',
  'DELETE /v1/admin/notes/:noteId',
  'GET /v1/admin/promo-codes',
  'POST /v1/admin/promo-codes',
  'GET /v1/admin/promo-codes/:id',
  'PATCH /v1/admin/promo-codes/:id',
  'DELETE /v1/admin/promo-codes/:id',
  'GET /v1/admin/prices',
  'PUT /v1/admin/prices/:country',
  'DELETE /v1/admin/prices/:country',
  'POST /v1/admin/prices/reset',
  'GET /v1/admin/settings',
  'PATCH /v1/admin/settings',
  'GET /v1/admin/audit',
  'GET /v1/admin/store-events',
  'GET /v1/admin/store-events/:id',
  'POST /v1/admin/store-events/:id/retry',
];

const isAdminPath = (p: string): boolean => p === '/v1/admin' || p.startsWith('/v1/admin/');

let s: TestServer;
let guest: Session;
let plain: Session;
/** The user every /users/:id route points at (never one of the callers). */
let target: Session;

before(async () => {
  s = await startTestServer();
  guest = await s.guest();
  plain = await s.account('plain.account@example.com');
  target = await s.account('authz.target@example.com');
});
after(() => s.close());

const adminRoutes = () => s.app.routes.filter((r) => isAdminPath(r.path));

/** A concrete path for a route pattern, with every param set to a value its validator accepts. */
function concretePath(path: string, params: Readonly<Record<string, RegExp>> | undefined): string {
  return path.replace(/:([A-Za-z0-9]+)/g, (_m, name: string) => {
    let value: string;
    if (name === 'id' && path.startsWith('/v1/admin/users/')) value = target.user.id;
    else if (name === 'id' && path.startsWith('/v1/admin/store-events/')) value = 'evt-authz-0001';
    else if (name === 'country') value = 'DE';
    else value = '1';
    const re = params?.[name];
    if (re) assert.ok(re.test(value), `sample ${value} must pass the ${name} validator of ${path}`);
    return encodeURIComponent(value);
  });
}

function concreteRoutes(): { label: string; method: string; path: string }[] {
  return adminRoutes().map((r) => ({ label: `${r.method} ${r.path}`, method: r.method, path: concretePath(r.path, r.params) }));
}

/** Calls a route with an empty JSON object as the body (none for GET). */
const call = (r: { method: string; path: string }, token: string | null) =>
  s.request(r.method, r.path, { token, body: r.method === 'GET' ? undefined : {} });

describe('the admin route table', () => {
  it('holds exactly the admin rows of the route index, all with admin auth and the admin rate limit', () => {
    const routes = adminRoutes();
    assert.deepEqual(routes.map((r) => `${r.method} ${r.path}`).sort(), [...SPEC_ADMIN_ROUTES].sort());
    for (const r of routes) {
      assert.equal(r.auth, 'admin', `${r.method} ${r.path}`);
      assert.ok(r.limits?.includes('admin'), `${r.method} ${r.path} carries the per-admin rate limit`);
    }
    // No other route uses admin auth.
    for (const r of s.app.routes.filter((x) => !isAdminPath(x.path))) assert.notEqual(r.auth, 'admin');
  });

  it('every concrete sample path matches its own route', () => {
    const router = buildRouter();
    for (const r of concreteRoutes()) {
      const m = router.match(r.method, r.path);
      assert.equal(m.kind, 'found', r.label);
      if (m.kind === 'found') assert.equal(`${m.route.method} ${m.route.path}`, r.label);
    }
  });
});

describe('every admin route', () => {
  it('without a token → 401 unauthorized', async () => {
    for (const r of concreteRoutes()) {
      const res = await call(r, null);
      assert.equal(res.status, 401, r.label);
      assert.equal(res.body.error.code, 'unauthorized', r.label);
    }
  });

  it('with an unknown token → 401 unauthorized', async () => {
    for (const r of concreteRoutes()) {
      const res = await call(r, `sw_${'A'.repeat(43)}`);
      assert.equal(res.status, 401, r.label);
    }
  });

  it('as a guest → 403 forbidden', async () => {
    for (const r of concreteRoutes()) {
      const res = await call(r, guest.token);
      assert.equal(res.status, 403, r.label);
      assert.equal(res.body.error.code, 'forbidden', r.label);
    }
  });

  it('as a plain account → 403 forbidden', async () => {
    for (const r of concreteRoutes()) {
      const res = await call(r, plain.token);
      assert.equal(res.status, 403, r.label);
      assert.equal(res.body.error.code, 'forbidden', r.label);
    }
  });

  it('with an admin session 31 days old → 401 reauth_required; a fresh admin session gets through', async () => {
    const old = await s.adminToken();
    s.clock.advance(31 * DAY);
    const fresh = await s.adminToken();
    const routes = concreteRoutes();
    for (const r of routes) {
      const res = await call(r, old);
      assert.equal(res.status, 401, r.label);
      assert.equal(res.body.error.code, 'reauth_required', r.label);
    }
    for (const r of routes) {
      const res = await call(r, fresh);
      assert.ok(res.status !== 401 && res.status !== 403, `${r.label} → ${res.status} ${res.text}`);
    }
    // The old session still works outside the admin area.
    assert.equal((await s.request('GET', '/v1/me', { token: old })).status, 200);
  });
});

describe('admin sessions', () => {
  it('are valid for exactly ADMIN_SESSION_DAYS; signing in with the old token replaces the session', async () => {
    const t = await startTestServer();
    try {
      const token = await t.adminToken();
      t.clock.advance(30 * DAY);
      assert.equal((await t.request('GET', '/v1/admin/dashboard', { token })).status, 200);
      t.clock.advance(1);
      const stale = await t.request('GET', '/v1/admin/dashboard', { token });
      assert.equal(stale.status, 401);
      assert.equal(stale.body.error.code, 'reauth_required');
      const again = await t.signIn('root@example.com', ADMIN_PASSWORD, { token });
      assert.equal(again.status, 200);
      assert.equal((await t.request('GET', '/v1/admin/dashboard', { token: again.body.token })).status, 200);
      assert.equal((await t.request('GET', '/v1/me', { token })).status, 401);
    } finally {
      await t.close();
    }
  });

  it('read the role and status on every request', async () => {
    const t = await startTestServer();
    try {
      const token = await t.adminToken();
      const me = (await t.request('GET', '/v1/me', { token })).body.user;
      assert.equal((await t.request('GET', '/v1/admin/users', { token })).status, 200);
      t.db.prepare("UPDATE users SET role = 'user' WHERE id = ?").run(me.id);
      const demoted = await t.request('GET', '/v1/admin/users', { token });
      assert.equal(demoted.status, 403);
      assert.equal(demoted.body.error.code, 'forbidden');
      t.db.prepare("UPDATE users SET role = 'admin', status = 'disabled', disabled_at = 1 WHERE id = ?").run(me.id);
      const disabled = await t.request('GET', '/v1/admin/users', { token });
      assert.equal(disabled.status, 403);
      assert.equal(disabled.body.error.code, 'account_disabled');
    } finally {
      await t.close();
    }
  });
});

describe('the router', () => {
  const handler = () => json(200, {});

  it('throws when an admin path is registered without admin auth', () => {
    for (const auth of ['none', 'session', 'guest', 'account', 'webhook'] as const) {
      assert.throws(
        () => new Router<RequestContext>().add({ method: 'GET', path: '/v1/admin/secret', auth, handler }),
        /must use auth 'admin'/,
        auth,
      );
    }
    assert.throws(() => new Router<RequestContext>().add({ method: 'POST', path: '/v1/admin', auth: 'account', handler }), /admin/);
    assert.throws(
      () => new Router<RequestContext>().add({ method: 'DELETE', path: '/v1/admin/users/:id', auth: 'session', handler }),
      /must use auth 'admin'/,
    );
  });

  it('throws when admin auth is used outside /v1/admin/', () => {
    assert.throws(() => new Router<RequestContext>().add({ method: 'GET', path: '/v1/me/admin', auth: 'admin', handler }), /outside/);
  });

  it('adds the per-admin rate limit to admin routes and accepts the real table', () => {
    const r = new Router<RequestContext>().add({ method: 'GET', path: '/v1/admin/thing', auth: 'admin', handler });
    assert.deepEqual(r.routes[0]!.limits, ['admin']);
    assert.doesNotThrow(() => buildRouter());
  });
});
