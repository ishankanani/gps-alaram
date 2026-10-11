/**
 * createApp(deps) → the (req, res) request handler (spec 6.1).
 *
 * Pipeline per request: request id → target parsing → global rate limit (every route except the
 * webhook) → route match (404 / 405 with Allow) → per-IP route limits → auth (the role and status
 * are read from the database on every request) → per-user route limits → session touch → X-Client
 * check → JSON body → handler. Every reply carries the security headers of 2.1; every unexpected
 * error is logged with its stack and answered with `internal` plus the request id (4.7).
 */
import { readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { performance } from 'node:perf_hooks';

import { createConfigCache } from './domain/config.ts';
import { createPasswordHasher } from './domain/passwords.ts';
import { getSettings } from './domain/settings.ts';
import type { AppContext, AppDeps, AppRoute, AuthState, RequestContext } from './context.ts';
import { authorize, bearerToken, checkWebhookAuth, resolveAuth, touchSession } from './http/auth.ts';
import { ApiError, badRequest, notFound, validationFailed } from './http/errors.ts';
import { createRateLimiter, RULES } from './http/rate-limit.ts';
import {
  clientIp, DEFAULT_BODY_LIMIT, ipRateKey, methodHasBody, parseAcceptLanguage, parseXClient, readJsonBody, requestIdFrom,
} from './http/request.ts';
import { json, writeReply, type Reply } from './http/response.ts';
import { METHODS, Router, type Method } from './http/router.ts';
import { adminRoutes } from './routes/admin/index.ts';
import { authRoutes } from './routes/auth.ts';
import { meRoutes } from './routes/me.ts';
import { planRoutes } from './routes/plan.ts';
import { publicRoutes } from './routes/public.ts';
import { webhookRoutes } from './routes/webhooks.ts';

export type App = ((req: IncomingMessage, res: ServerResponse) => void) & {
  /** Every registered route (the admin authz test walks this table). */
  readonly routes: readonly AppRoute[];
  readonly context: AppContext;
  /** Requests currently being handled. */
  inFlight(): number;
};

/** All routes of the API, in one router (throws at startup on a misconfigured admin route). */
export function buildRouter(): Router<RequestContext> {
  return new Router<RequestContext>().addAll([
    ...publicRoutes,
    ...authRoutes,
    ...meRoutes,
    ...planRoutes,
    ...webhookRoutes,
    ...adminRoutes,
  ]);
}

export const SERVER_VERSION: string = (() => {
  try {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version?: unknown };
    return typeof pkg.version === 'string' ? pkg.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
})();

export function createAppContext(deps: AppDeps): AppContext {
  const { config, clock } = deps;
  const planOptions = { sandboxGrantsPro: config.storeSandboxGrantsPro };
  const settings = () => getSettings(deps.db, config);
  return {
    ...deps,
    hasher: createPasswordHasher({ N: config.scryptN, p: config.scryptP }),
    limiter: createRateLimiter({ clock, enabled: config.rateLimits }),
    configCache: createConfigCache(500),
    version: SERVER_VERSION,
    startedAt: clock.now(),
    settings,
    planOptions,
    planView: () => ({ ...planOptions, cacheDays: settings()['plan.cacheDays'] }),
  };
}

export function createApp(deps: AppDeps): App {
  const router = buildRouter();
  const context = createAppContext(deps);
  let inFlight = 0;
  const handler = (req: IncomingMessage, res: ServerResponse): void => {
    inFlight++;
    void handle(context, router, req, res).finally(() => {
      inFlight--;
    });
  };
  return Object.assign(handler, { routes: router.routes, context, inFlight: () => inFlight });
}

/** `/v1/x?y=1` → path and query. Absolute-form targets keep only their path. */
function parseTarget(url: string | undefined): { path: string; query: URLSearchParams } {
  const raw = url ?? '/';
  if (raw.startsWith('/')) {
    const q = raw.indexOf('?');
    return {
      path: q >= 0 ? raw.slice(0, q) : raw,
      query: new URLSearchParams(q >= 0 ? raw.slice(q + 1) : ''),
    };
  }
  try {
    const u = new URL(raw);
    return { path: u.pathname, query: u.searchParams };
  } catch {
    throw badRequest('Malformed request target');
  }
}

type Trace = { route: string | null; user: string | null };

async function dispatch(app: AppContext, router: Router<RequestContext>, req: IncomingMessage, requestId: string, trace: Trace): Promise<Reply> {
  const now = app.clock.now();
  const method = (req.method ?? 'GET').toUpperCase();
  const { path, query } = parseTarget(req.url);
  const ip = clientIp(req, app.config.trustProxy);
  const ipKey = ipRateKey(ip);
  if (!path.startsWith('/v1/webhooks/')) app.limiter.consume('global', ipKey);

  const match = router.match(method, path);
  if (match.kind === 'not_found') throw notFound();
  if (match.kind === 'method_not_allowed') {
    const allow = match.allow.join(', ');
    throw new ApiError(405, 'method_not_allowed', `Method not allowed; use ${allow}`, { headers: { Allow: allow } });
  }
  const route = match.route;
  trace.route = route.path;

  for (const rule of route.limits ?? []) if (RULES[rule].key === 'ip') app.limiter.consume(rule, ipKey);

  const client = parseXClient(req.headers['x-client']);
  const locale = parseAcceptLanguage(req.headers['accept-language']);
  const token = bearerToken(req);
  let auth: AuthState | null = null;
  if (route.auth === 'webhook') {
    checkWebhookAuth(req.headers.authorization, app.config.revenuecatWebhookSecret, app.config.revenuecatWebhookSecretPrevious);
  } else if (route.auth !== 'none') {
    const state = token ? resolveAuth(app.db, token, now) : null;
    auth = authorize(route.auth, state, {
      allowDisabled: route.allowDisabled,
      now,
      adminSessionDays: app.config.adminSessionDays,
      supportEmail: () => app.settings()['support.email'],
    });
    trace.user = auth.user.public_id;
    for (const rule of route.limits ?? []) if (RULES[rule].key === 'user') app.limiter.consume(rule, auth.user.id);
    touchSession(app.db, auth, { now, sessionDays: app.config.sessionDays, client, locale });
  }
  if (route.client === 'required' && !client) {
    throw validationFailed({ xClient: req.headers['x-client'] === undefined ? 'required' : 'invalid' });
  }

  let body: Record<string, unknown> = {};
  if (methodHasBody(method)) {
    try {
      body = await readJsonBody(req, route.bodyLimit ?? DEFAULT_BODY_LIMIT);
    } catch (err) {
      throw err instanceof ApiError ? err : badRequest('Could not read the request body');
    }
  }

  const ctx: RequestContext = {
    app,
    req,
    requestId,
    method: method as Method,
    path,
    params: match.params,
    query,
    ip,
    ipKey,
    now,
    body,
    client,
    locale,
    token,
    auth,
    logUser: null,
  };
  const reply = await route.handler(ctx);
  if (ctx.logUser) trace.user = ctx.logUser;
  return reply;
}

function errorReply(app: AppContext, err: unknown, requestId: string, trace: Trace): Reply {
  if (err instanceof ApiError) return json(err.status, err.toBody(), err.headers);
  app.log.error('unexpected error', { id: requestId, route: trace.route, error: err });
  return json(500, { error: { code: 'internal', message: `Internal error (request ${requestId})` } });
}

async function handle(app: AppContext, router: Router<RequestContext>, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const started = performance.now();
  const requestId = requestIdFrom(req.headers['x-request-id']);
  const trace: Trace = { route: null, user: null };
  let reply: Reply;
  try {
    reply = await dispatch(app, router, req, requestId, trace);
  } catch (err) {
    reply = errorReply(app, err, requestId, trace);
  }
  if (!res.headersSent && !res.destroyed) {
    try {
      writeReply(res, reply, { requestId, hsts: app.config.publicUrlIsHttps });
    } catch (err) {
      app.log.error('could not write the reply', { id: requestId, error: err });
      res.destroy();
    }
  }
  const fields = {
    id: requestId,
    method: METHODS.includes(req.method as Method) ? req.method : String(req.method ?? '').slice(0, 10),
    route: trace.route,
    status: reply.status,
    ms: Math.round((performance.now() - started) * 10) / 10,
    user: trace.user,
  };
  if (reply.status >= 500) app.log.error('request', fields);
  else if (trace.route === '/v1/health' && reply.status === 200) app.log.debug('request', fields);
  else app.log.info('request', fields);
}
