/**
 * One typed function per public, auth, me, plan and promo route (backend-spec 2.4). Pure. The admin
 * routes live in the admin package's own files (src/api/admin*.ts) on top of `api.request`.
 */
import type { ApiClient } from './client';
import type {
  AuthResponse,
  ChangePasswordRequest,
  DeleteMeRequest,
  ExportResponse,
  ForgotPasswordRequest,
  GuestRequest,
  HealthResponse,
  MeResponse,
  PlanResponse,
  RedeemRequest,
  RedeemResponse,
  RemoteConfig,
  ResetPasswordRequest,
  SignInRequest,
  SignInResponse,
  SignOutAllRequest,
  SignUpRequest,
  SyncResponse,
  UpdateMeRequest,
  User,
} from './types';

/** Sign-in, sign-up and reset hash a password on the server: they get longer (7.1). */
export const SLOW_TIMEOUT_MS = 20_000;

export type ConfigQuery = { country?: string | null; lang?: string | null; platform?: string; version?: string | null };

export function createEndpoints(client: ApiClient) {
  return {
    health: () => client.request<HealthResponse>('GET', '/v1/health'),
    /** null on 304 (the cached config with this ETag is current). */
    config: (query: ConfigQuery, etag?: string | null) =>
      client.request<RemoteConfig | null>('GET', '/v1/config', {
        query,
        token: null,
        headers: etag ? { 'If-None-Match': `"${etag}"` } : undefined,
      }),
    auth: {
      guest: (body: GuestRequest) => client.request<AuthResponse>('POST', '/v1/auth/guest', { body, token: null }),
      signUp: (body: SignUpRequest) => client.request<AuthResponse>('POST', '/v1/auth/sign-up', { body, timeoutMs: SLOW_TIMEOUT_MS }),
      /** With the current (guest) token as bearer: the server merges the guest into the account. */
      signIn: (body: SignInRequest, token?: string | null) =>
        client.request<SignInResponse>('POST', '/v1/auth/sign-in', { body, timeoutMs: SLOW_TIMEOUT_MS, token }),
      signOut: (token?: string | null) => client.request<void>('POST', '/v1/auth/sign-out', { token }),
      signOutAll: (body: SignOutAllRequest) => client.request<{ revoked: number }>('POST', '/v1/auth/sign-out-all', { body }),
      forgotPassword: (body: ForgotPasswordRequest) =>
        client.request<{ ok: true }>('POST', '/v1/auth/forgot-password', { body, token: null }),
      resetPassword: (body: ResetPasswordRequest) =>
        client.request<AuthResponse>('POST', '/v1/auth/reset-password', { body, timeoutMs: SLOW_TIMEOUT_MS, token: null }),
    },
    me: {
      get: () => client.request<MeResponse>('GET', '/v1/me'),
      update: (body: UpdateMeRequest) => client.request<{ user: User }>('PATCH', '/v1/me', { body, timeoutMs: body.email ? SLOW_TIMEOUT_MS : undefined }),
      changePassword: (body: ChangePasswordRequest) =>
        client.request<{ revokedSessions: number }>('POST', '/v1/me/password', { body, timeoutMs: SLOW_TIMEOUT_MS }),
      export: () => client.request<ExportResponse>('GET', '/v1/me/export'),
      delete: (body: DeleteMeRequest) => client.request<void>('DELETE', '/v1/me', { body, timeoutMs: SLOW_TIMEOUT_MS }),
    },
    plan: {
      get: () => client.request<PlanResponse>('GET', '/v1/plan'),
      sync: () => client.request<SyncResponse>('POST', '/v1/plan/sync', { timeoutMs: SLOW_TIMEOUT_MS }),
    },
    promo: {
      redeem: (body: RedeemRequest) => client.request<RedeemResponse>('POST', '/v1/promo/redeem', { body }),
    },
  };
}

export type Endpoints = ReturnType<typeof createEndpoints>;
