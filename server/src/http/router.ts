/**
 * Route table (spec 2.4, 4.5): `:param` matching, 404/405 with Allow, and startup guards.
 *
 * - The router throws at startup if a path under /v1/admin/ is registered with any auth other than
 *   `admin` (and adds the per-admin rate limit to every admin route), or a /v1/webhooks/ path
 *   without `webhook` auth.
 * - Path params are decoded and checked against their regex before the handler runs; a mismatch
 *   is a 404, never a query with a malformed id.
 */
import type { RuleName } from './rate-limit.ts';
import type { Reply } from './response.ts';

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export const METHODS: readonly Method[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

/**
 * none: no token needed (sign-in reads an optional bearer itself).
 * session: a valid session of an active user (`allowDisabled` lets disabled users through).
 * guest / account: session + no email / session + email.
 * admin: account + role admin + a session younger than ADMIN_SESSION_DAYS.
 * webhook: Authorization equals the RevenueCat webhook secret.
 */
export type AuthLevel = 'none' | 'session' | 'guest' | 'account' | 'admin' | 'webhook';

export type RouteDef<C> = {
  method: Method;
  /** e.g. /v1/admin/users/:id */
  path: string;
  auth: AuthLevel;
  /** Only POST /v1/auth/sign-out: disabled users may call it. */
  allowDisabled?: boolean;
  /** Rate-limit rules applied before the handler (per IP before auth, per user after). */
  limits?: readonly RuleName[];
  /** Body size limit in bytes (default 16 KB). */
  bodyLimit?: number;
  /** X-Client: required (400 validation_failed when missing) or used when present (default). */
  client?: 'required' | 'optional';
  /** Validators for path params; a param that does not match makes the route not match (404). */
  params?: Readonly<Record<string, RegExp>>;
  handler: (ctx: C) => Reply | Promise<Reply>;
};

/** Typed identity: route({ method, path, auth, handler }). */
export function route<C>(def: RouteDef<C>): RouteDef<C> {
  return def;
}

type Compiled<C> = {
  def: RouteDef<C>;
  segments: Array<{ literal: string } | { param: string }>;
  literals: number;
};

export type Match<C> =
  | { kind: 'found'; route: RouteDef<C>; params: Record<string, string> }
  | { kind: 'method_not_allowed'; allow: Method[] }
  | { kind: 'not_found' };

const isAdminPath = (path: string): boolean => path === '/v1/admin' || path.startsWith('/v1/admin/');
const isWebhookPath = (path: string): boolean => path.startsWith('/v1/webhooks/');

export class Router<C> {
  private readonly compiled: Compiled<C>[] = [];

  /** Every registered route, in registration order (the admin authz test walks this). */
  get routes(): RouteDef<C>[] {
    return this.compiled.map((c) => c.def);
  }

  add(def: RouteDef<C>): this {
    if (!def.path.startsWith('/') || def.path.includes('//') || (def.path.length > 1 && def.path.endsWith('/'))) {
      throw new Error(`Route path must be absolute without empty segments: ${def.path}`);
    }
    if (isAdminPath(def.path) && def.auth !== 'admin') {
      throw new Error(`Admin route ${def.method} ${def.path} must use auth 'admin' (got '${def.auth}')`);
    }
    if (def.auth === 'admin' && !isAdminPath(def.path)) {
      throw new Error(`Route ${def.method} ${def.path} uses auth 'admin' outside /v1/admin/`);
    }
    if (isWebhookPath(def.path) !== (def.auth === 'webhook')) {
      throw new Error(`Route ${def.method} ${def.path}: webhook auth is required on, and only on, /v1/webhooks/`);
    }
    const segments = def.path
      .split('/')
      .slice(1)
      .map((s) => (s.startsWith(':') ? { param: s.slice(1) } : { literal: s }));
    const names = segments.flatMap((s) => ('param' in s ? [s.param] : []));
    if (names.some((n) => !/^[A-Za-z][A-Za-z0-9]*$/.test(n)) || new Set(names).size !== names.length) {
      throw new Error(`Bad params in ${def.path}`);
    }
    for (const key of Object.keys(def.params ?? {})) {
      if (!names.includes(key)) throw new Error(`Param validator for unknown param ${key} in ${def.path}`);
    }
    const shape = segments.map((s) => ('param' in s ? ':' : s.literal)).join('/');
    for (const c of this.compiled) {
      if (c.def.method === def.method && c.segments.map((s) => ('param' in s ? ':' : s.literal)).join('/') === shape) {
        throw new Error(`Duplicate route ${def.method} ${def.path}`);
      }
    }
    const finalDef: RouteDef<C> =
      def.auth === 'admin' && !(def.limits ?? []).includes('admin')
        ? { ...def, limits: [...(def.limits ?? []), 'admin'] }
        : def;
    this.compiled.push({ def: finalDef, segments, literals: segments.filter((s) => 'literal' in s).length });
    return this;
  }

  addAll(defs: readonly RouteDef<C>[]): this {
    for (const d of defs) this.add(d);
    return this;
  }

  match(method: string, pathname: string): Match<C> {
    const parts = pathname.split('/').slice(1);
    const allow = new Set<Method>();
    let best: { c: Compiled<C>; params: Record<string, string> } | null = null;
    for (const c of this.compiled) {
      const params = matchSegments(c, parts);
      if (!params) continue;
      allow.add(c.def.method);
      if (c.def.method === method && (!best || c.literals > best.c.literals)) best = { c, params };
    }
    if (best) return { kind: 'found', route: best.c.def, params: best.params };
    if (allow.size > 0) return { kind: 'method_not_allowed', allow: METHODS.filter((m) => allow.has(m)) };
    return { kind: 'not_found' };
  }
}

function matchSegments<C>(c: Compiled<C>, parts: string[]): Record<string, string> | null {
  if (parts.length !== c.segments.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < parts.length; i++) {
    const seg = c.segments[i]!;
    const part = parts[i]!;
    if ('literal' in seg) {
      if (seg.literal !== part) return null;
      continue;
    }
    if (part === '') return null;
    let value: string;
    try {
      value = decodeURIComponent(part);
    } catch {
      return null;
    }
    const re = c.def.params?.[seg.param];
    if (re && !re.test(value)) return null;
    params[seg.param] = value;
  }
  return params;
}
