/**
 * StopWake Cloud's REST routes (backend-spec 2.4 and 2.10) answered by Supabase: one ApiRequester
 * the account store, the config store and the admin package keep calling with `/v1/...` paths, so
 * every screen keeps its types (src/api/types.ts). Pure: the Supabase client is injected as a
 * `SupabaseBackend` (src/api/supabase/client.ts), and Vitest drives it with a fake.
 */
import type { ApiRequester, HttpMethod, QueryValue, RequestOptions } from '../contract';
import { ApiError } from '../errors';
import type {
  AuthResponse,
  MeResponse,
  PlanResponse,
  PriceUpdateRequest,
} from '../types';
import { adminPriceRowFrom, adminPricesFrom, adminSettingsFrom, buildRemoteConfig, defaultFormat } from './config';

export type BackendSession = {
  accessToken: string;
  userId: string;
  email: string | null;
  /** ms since epoch. */
  expiresAt: number;
};

export type DeviceInfo = {
  installId: string;
  platform: 'android' | 'ios';
  appVersion: string;
  build: string | null;
  osVersion: string | null;
  country: string | null;
  language: string;
};

/** What the router needs from Supabase. Every method rejects with ApiError. */
export interface SupabaseBackend {
  rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T>;
  session(): Promise<BackendSession | null>;
  signUp(input: { email: string; password: string; data: Record<string, unknown> }): Promise<BackendSession | null>;
  signIn(email: string, password: string): Promise<BackendSession>;
  /** scope 'local' forgets this phone's session only. */
  signOut(): Promise<void>;
  resetPasswordForEmail(email: string): Promise<void>;
  verifyRecovery(email: string, code: string): Promise<BackendSession>;
  updateUser(change: { email?: string; password?: string }): Promise<void>;
  device(): DeviceInfo | null;
  language(): string;
  region(): string | null;
  /** The Supabase project URL (admin footer). */
  url: string;
}

type Handler = (ctx: { body: Record<string, unknown>; query: Record<string, QueryValue>; params: string[] }) => Promise<unknown>;
type Route = { method: HttpMethod; pattern: RegExp; handler: Handler };

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const numOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : null);

function authSession(s: BackendSession): AuthResponse['session'] {
  // Supabase sessions renew themselves; the createdAt is not known to the app.
  return { createdAt: new Date().toISOString(), expiresAt: new Date(s.expiresAt).toISOString() };
}

export function createSupabaseRouter(b: SupabaseBackend): ApiRequester {
  async function me(): Promise<MeResponse> {
    const s = await b.session();
    if (!s) throw new ApiError({ status: 401, code: 'unauthorized', message: 'Not signed in' });
    const res = await b.rpc<Omit<MeResponse, 'session'>>('me', { p_device: b.device() });
    return { ...res, session: authSession(s) };
  }

  async function authResponse(s: BackendSession): Promise<AuthResponse & { merged: null }> {
    const res = await b.rpc<Omit<MeResponse, 'session'>>('me', { p_device: b.device() });
    return { ...res, session: authSession(s), token: s.accessToken, merged: null };
  }

  /** Supabase Auth has no "check this password": signing in again with it is the check. */
  async function verifyPassword(password: string, field = 'currentPassword') {
    const s = await b.session();
    if (!s?.email) throw new ApiError({ status: 401, code: 'unauthorized', message: 'Not signed in' });
    if (!password) throw new ApiError({ status: 400, code: 'validation_failed', message: 'Password required', fields: { [field]: 'required' } });
    await b.signIn(s.email, password);
  }

  const user = (id: string) => ({ p_ref: id });

  const routes: Route[] = [
    // ---- Public ----
    {
      method: 'GET', pattern: /^\/v1\/health$/, handler: async () =>
        ({ ok: true, version: 'supabase', commit: null, time: new Date().toISOString(), uptimeSeconds: 0 }),
    },
    {
      method: 'GET', pattern: /^\/v1\/config$/, handler: async ({ query }) =>
        buildRemoteConfig(await b.rpc('public_config'), { country: strOrNull(query.country), lang: strOrNull(query.lang), version: strOrNull(query.version) }),
    },

    // ---- Auth ----
    {
      method: 'POST', pattern: /^\/v1\/auth\/guest$/, handler: async () => {
        // Guests live on the phone only (no anonymous Supabase users).
        throw new ApiError({ status: 0, code: 'not_configured', message: 'Guests stay on the phone' });
      },
    },
    {
      method: 'POST', pattern: /^\/v1\/auth\/sign-up$/, handler: async ({ body }) => {
        const s = await b.signUp({
          email: str(body.email).trim().toLowerCase(),
          password: str(body.password),
          data: { display_name: strOrNull(body.displayName), language: b.language(), country: b.region() },
        });
        if (!s) throw new ApiError({ status: 200, code: 'confirmation_sent', message: 'Confirm your email address, then sign in' });
        return authResponse(s);
      },
    },
    {
      method: 'POST', pattern: /^\/v1\/auth\/sign-in$/, handler: async ({ body }) =>
        authResponse(await b.signIn(str(body.email).trim().toLowerCase(), str(body.password))),
    },
    { method: 'POST', pattern: /^\/v1\/auth\/sign-out$/, handler: async () => b.signOut() },
    { method: 'POST', pattern: /^\/v1\/auth\/sign-out-all$/, handler: async () => b.rpc('sign_out_other_sessions') },
    {
      method: 'POST', pattern: /^\/v1\/auth\/forgot-password$/, handler: async ({ body }) => {
        await b.resetPasswordForEmail(str(body.email).trim().toLowerCase());
        return { ok: true };
      },
    },
    {
      method: 'POST', pattern: /^\/v1\/auth\/reset-password$/, handler: async ({ body }) => {
        const s = await b.verifyRecovery(str(body.email).trim().toLowerCase(), str(body.code).replace(/[\s-]/g, ''));
        await b.updateUser({ password: str(body.newPassword) });
        return authResponse(s);
      },
    },

    // ---- Me ----
    { method: 'GET', pattern: /^\/v1\/me$/, handler: async () => me() },
    {
      method: 'PATCH', pattern: /^\/v1\/me$/, handler: async ({ body }) => {
        const { email, currentPassword, ...profile } = body;
        if (typeof email === 'string' && email.trim()) {
          await verifyPassword(str(currentPassword));
          // Supabase mails a confirmation link; the profile follows once it is confirmed.
          await b.updateUser({ email: email.trim().toLowerCase() });
        }
        return b.rpc('update_me', { p_body: profile });
      },
    },
    {
      method: 'POST', pattern: /^\/v1\/me\/password$/, handler: async ({ body }) => {
        await verifyPassword(str(body.currentPassword));
        await b.updateUser({ password: str(body.newPassword) });
        return { revokedSessions: 0 };
      },
    },
    { method: 'GET', pattern: /^\/v1\/me\/export$/, handler: async () => b.rpc('export_my_data') },
    {
      method: 'DELETE', pattern: /^\/v1\/me$/, handler: async ({ body }) => {
        await verifyPassword(str(body.password), 'password');
        await b.rpc('delete_my_account', { p_acknowledge_subscription: body.acknowledgeSubscription === true });
        await b.signOut().catch(() => {});
      },
    },

    // ---- Plan and promo ----
    { method: 'GET', pattern: /^\/v1\/plan$/, handler: async () => b.rpc('my_plan') },
    {
      method: 'POST', pattern: /^\/v1\/plan\/sync$/, handler: async () =>
        ({ ...(await b.rpc<PlanResponse>('my_plan')), synced: false }),
    },
    { method: 'POST', pattern: /^\/v1\/promo\/redeem$/, handler: async ({ body }) => b.rpc('redeem_promo', { p_code: str(body.code) }) },

    // ---- Admin: reads ----
    { method: 'GET', pattern: /^\/v1\/admin\/dashboard$/, handler: async ({ query }) => b.rpc('admin_dashboard', { p_days: numOrNull(query.days) ?? 30 }) },
    {
      method: 'GET', pattern: /^\/v1\/admin\/users$/, handler: async ({ query }) => {
        const q: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(query)) if (v !== null && v !== undefined && v !== '') q[k] = k === 'limit' || k === 'offset' ? Number(v) : v;
        return b.rpc('admin_users', { p_query: q });
      },
    },
    { method: 'GET', pattern: /^\/v1\/admin\/users\/([^/]+)$/, handler: async ({ params }) => b.rpc('admin_user', user(params[0])) },

    // ---- Admin: a user ----
    { method: 'PATCH', pattern: /^\/v1\/admin\/users\/([^/]+)$/, handler: async ({ params, body }) => b.rpc('admin_update_user', { ...user(params[0]), p_body: body }) },
    {
      method: 'DELETE', pattern: /^\/v1\/admin\/users\/([^/]+)$/, handler: async ({ params, body }) =>
        b.rpc('admin_delete_user', { ...user(params[0]), p_confirm: str(body.confirm), p_reason: str(body.reason) }),
    },
    { method: 'POST', pattern: /^\/v1\/admin\/users\/([^/]+)\/grants$/, handler: async ({ params, body }) => b.rpc('admin_grant', { ...user(params[0]), p_body: body }) },
    {
      method: 'POST', pattern: /^\/v1\/admin\/users\/([^/]+)\/grants\/(\d+)\/revoke$/, handler: async ({ params, body }) =>
        b.rpc('admin_revoke_grant', { ...user(params[0]), p_grant_id: Number(params[1]), p_reason: str(body.reason) }),
    },
    { method: 'POST', pattern: /^\/v1\/admin\/users\/([^/]+)\/extend$/, handler: async ({ params, body }) => b.rpc('admin_extend', { ...user(params[0]), p_body: body }) },
    { method: 'POST', pattern: /^\/v1\/admin\/users\/([^/]+)\/plan$/, handler: async ({ params, body }) => b.rpc('admin_change_plan', { ...user(params[0]), p_body: body }) },
    { method: 'POST', pattern: /^\/v1\/admin\/users\/([^/]+)\/role$/, handler: async ({ params, body }) => b.rpc('admin_set_role', { ...user(params[0]), p_role: str(body.role) }) },
    { method: 'POST', pattern: /^\/v1\/admin\/users\/([^/]+)\/disable$/, handler: async ({ params, body }) => b.rpc('admin_disable', { ...user(params[0]), p_reason: str(body.reason) }) },
    { method: 'POST', pattern: /^\/v1\/admin\/users\/([^/]+)\/enable$/, handler: async ({ params }) => b.rpc('admin_enable', user(params[0])) },
    { method: 'POST', pattern: /^\/v1\/admin\/users\/([^/]+)\/sign-out-all$/, handler: async ({ params }) => b.rpc('admin_sign_out_all', user(params[0])) },
    {
      method: 'POST', pattern: /^\/v1\/admin\/users\/([^/]+)\/reset-code$/, handler: async ({ params }) => {
        // Supabase Auth emails the one-time code itself; the dialog shows where it went.
        const { email } = await b.rpc<{ email: string }>('admin_reset_email', user(params[0]));
        await b.resetPasswordForEmail(email);
        return { code: email, expiresAt: new Date(Date.now() + 3_600_000).toISOString() };
      },
    },
    {
      method: 'POST', pattern: /^\/v1\/admin\/users\/([^/]+)\/sync$/, handler: async ({ params }) => {
        const detail = await b.rpc<{ plan: unknown }>('admin_user', user(params[0]));
        return { plan: detail.plan, synced: false };
      },
    },

    // ---- Admin: notes ----
    { method: 'POST', pattern: /^\/v1\/admin\/users\/([^/]+)\/notes$/, handler: async ({ params, body }) => b.rpc('admin_add_note', { ...user(params[0]), p_body: str(body.body) }) },
    { method: 'PATCH', pattern: /^\/v1\/admin\/notes\/(\d+)$/, handler: async ({ params, body }) => b.rpc('admin_update_note', { p_id: Number(params[0]), p_body: str(body.body) }) },
    { method: 'DELETE', pattern: /^\/v1\/admin\/notes\/(\d+)$/, handler: async ({ params }) => b.rpc('admin_delete_note', { p_id: Number(params[0]) }) },

    // ---- Admin: promo codes ----
    {
      method: 'GET', pattern: /^\/v1\/admin\/promo-codes$/, handler: async ({ query }) =>
        b.rpc('admin_promo_codes', { p_status: strOrNull(query.status) ?? 'all', p_q: strOrNull(query.q), p_limit: numOrNull(query.limit) ?? 50, p_offset: numOrNull(query.offset) ?? 0 }),
    },
    { method: 'GET', pattern: /^\/v1\/admin\/promo-codes\/(\d+)$/, handler: async ({ params }) => b.rpc('admin_promo_code', { p_id: Number(params[0]) }) },
    { method: 'POST', pattern: /^\/v1\/admin\/promo-codes$/, handler: async ({ body }) => b.rpc('admin_create_promo', { p_body: body }) },
    { method: 'PATCH', pattern: /^\/v1\/admin\/promo-codes\/(\d+)$/, handler: async ({ params, body }) => b.rpc('admin_update_promo', { p_id: Number(params[0]), p_body: body }) },
    { method: 'DELETE', pattern: /^\/v1\/admin\/promo-codes\/(\d+)$/, handler: async ({ params }) => b.rpc('admin_delete_promo', { p_id: Number(params[0]) }) },

    // ---- Admin: prices ----
    { method: 'GET', pattern: /^\/v1\/admin\/prices$/, handler: async () => adminPricesFrom(await b.rpc('admin_prices')) },
    {
      method: 'PUT', pattern: /^\/v1\/admin\/prices\/([^/]+)$/, handler: async ({ params, body }) => {
        const req = body as Partial<PriceUpdateRequest>;
        const explicit = req.format !== undefined && req.format !== null;
        const format = explicit ? req.format : typeof req.currency === 'string' ? defaultFormat(params[0], req.currency) : null;
        const res = await b.rpc<{ item: unknown; warnings: string[] }>('admin_put_price', {
          p_country: params[0],
          p_body: { ...req, format: format ?? null },
          p_explicit_format: explicit,
        });
        return { item: adminPriceRowFrom(res.item), warnings: res.warnings };
      },
    },
    { method: 'DELETE', pattern: /^\/v1\/admin\/prices\/([^/]+)$/, handler: async ({ params }) => b.rpc('admin_delete_price', { p_country: params[0] }) },
    { method: 'POST', pattern: /^\/v1\/admin\/prices\/reset$/, handler: async () => b.rpc('admin_reset_prices') },

    // ---- Admin: settings ----
    { method: 'GET', pattern: /^\/v1\/admin\/settings$/, handler: async () => adminSettingsFrom(await b.rpc('admin_settings')) },
    {
      method: 'PATCH', pattern: /^\/v1\/admin\/settings$/, handler: async ({ body }) =>
        adminSettingsFrom(await b.rpc('admin_patch_settings', { p_values: body.values ?? null })),
    },

    // ---- Admin: audit and store events ----
    {
      method: 'GET', pattern: /^\/v1\/admin\/audit$/, handler: async ({ query }) =>
        b.rpc('admin_audit', {
          p_action: strOrNull(query.action), p_actor: strOrNull(query.actor), p_user: strOrNull(query.user),
          p_before: numOrNull(query.before), p_limit: numOrNull(query.limit) ?? 50,
        }),
    },
    {
      method: 'GET', pattern: /^\/v1\/admin\/store-events$/, handler: async ({ query }) =>
        b.rpc('admin_store_events', { p_status: strOrNull(query.status), p_user: strOrNull(query.user), p_before: strOrNull(query.before), p_limit: numOrNull(query.limit) ?? 50 }),
    },
    { method: 'GET', pattern: /^\/v1\/admin\/store-events\/([^/]+)$/, handler: async ({ params }) => b.rpc('admin_store_event', { p_id: params[0] }) },
    {
      method: 'POST', pattern: /^\/v1\/admin\/store-events\/([^/]+)\/retry$/, handler: async () => {
        throw new ApiError({ status: 503, code: 'unavailable', message: 'Store events are processed once premium launches' });
      },
    },
  ];

  return {
    async request<T>(method: HttpMethod, path: string, options: RequestOptions = {}): Promise<T> {
      const [rawPath] = path.split('?');
      for (const route of routes) {
        if (route.method !== method) continue;
        const m = route.pattern.exec(rawPath);
        if (!m) continue;
        const params = m.slice(1).map((p) => decodeURIComponent(p));
        const body = options.body && typeof options.body === 'object' ? (options.body as Record<string, unknown>) : {};
        return (await route.handler({ body, query: options.query ?? {}, params })) as T;
      }
      throw new ApiError({ status: 404, code: 'not_found', message: `${method} ${rawPath} is not available with Supabase` });
    },
  };
}
