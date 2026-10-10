/**
 * Shared types for the app and its route modules (kept apart from app.ts to avoid import cycles).
 */
import type { IncomingMessage } from 'node:http';

import type { Clock } from './clock.ts';
import type { Config } from './config.ts';
import type { Db } from './db/database.ts';
import type { ConfigCache } from './domain/config.ts';
import type { PasswordHasher } from './domain/passwords.ts';
import type { PlanOptions } from './domain/plans.ts';
import type { RevenueCatApi } from './domain/revenuecat-api.ts';
import type { SessionRow } from './domain/sessions.ts';
import type { Settings } from './domain/settings.ts';
import type { UserRow } from './domain/users.ts';
import type { RateLimiter } from './http/rate-limit.ts';
import type { ClientInfo, LocaleInfo } from './http/request.ts';
import type { Method, RouteDef } from './http/router.ts';
import type { Logger } from './log.ts';
import type { Mailer } from './mail/mailer.ts';

/** createApp(deps): everything with side effects comes in here, so tests can replace it. */
export type AppDeps = {
  db: Db;
  clock: Clock;
  config: Config;
  mailer: Mailer;
  /** Present only with REVENUECAT_API_KEY. */
  revenuecat: RevenueCatApi | null;
  log: Logger;
};

export type AppContext = AppDeps & {
  hasher: PasswordHasher;
  limiter: RateLimiter;
  configCache: ConfigCache;
  /** server/package.json version. */
  version: string;
  startedAt: number;
  /** Current settings (read from the database on every call). */
  settings(): Settings;
  /** Plan rules from the environment (STORE_SANDBOX_GRANTS_PRO). */
  planOptions: PlanOptions;
  /** planOptions plus the plan.cacheDays setting, for building EffectivePlan. */
  planView(): PlanOptions & { cacheDays: number };
};

export type AuthState = { session: SessionRow; user: UserRow };

export type RequestContext = {
  app: AppContext;
  req: IncomingMessage;
  requestId: string;
  method: Method;
  path: string;
  params: Record<string, string>;
  query: URLSearchParams;
  /** Client IP (TRUST_PROXY applied). Recorded only in rate limits and admin audit rows. */
  ip: string;
  /** The rate-limit key for ip (IPv6: the /64). */
  ipKey: string;
  /** Request time from the app clock, fixed for the whole request. */
  now: number;
  body: Record<string, unknown>;
  client: ClientInfo | null;
  locale: LocaleInfo;
  /** The raw bearer token, if any. Never log it. */
  token: string | null;
  /** Set for session, guest, account and admin routes. */
  auth: AuthState | null;
  /** Public id for the request log line, when a handler establishes the user itself. */
  logUser: string | null;
};

export type AppRoute = RouteDef<RequestContext>;

/** The auth state of a route that requires a session (the pipeline guarantees it). */
export function authOf(ctx: RequestContext): AuthState {
  if (!ctx.auth) throw new Error(`Route ${ctx.method} ${ctx.path} has no auth state`);
  return ctx.auth;
}
