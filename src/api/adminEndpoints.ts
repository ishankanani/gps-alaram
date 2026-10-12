// One typed function per admin route of backend-spec 2.4 and 2.10, built on the ApiRequester seam
// (src/api/contract.ts). Pure: no React, no React Native, so Vitest checks every method, path and
// body. src/api/admin.ts wires it to the app's requester.

import type { ApiRequester } from './contract';
import type {
  AdminDashboard,
  AdminDeleteUserRequest,
  AdminGrant,
  AdminNote,
  AdminPriceRow,
  AdminRef,
  AdminSetting,
  AdminUpdateUserRequest,
  AdminUser,
  AdminUserDetail,
  AdminUserListItem,
  AuditEntry,
  ChangePlanRequest,
  EffectivePlan,
  ExtendRequest,
  GrantRequest,
  HealthResponse,
  MeResponse,
  NoteRequest,
  PaidPlan,
  PlanSource,
  PriceUpdateRequest,
  PromoCode,
  PromoCreateRequest,
  PromoUpdateRequest,
  ReasonRequest,
  Role,
  SettingKey,
  StoreEvent,
  Warning,
} from './types';

export type Page<T> = { items: T[]; total: number; limit: number; offset: number };
export type CursorPage<T, C> = { items: T[]; nextBefore: C | null };

export type DashboardDays = 7 | 30 | 90;

export type UsersQuery = {
  q?: string;
  plan?: 'free' | 'pro' | 'trial' | 'monthly' | 'yearly' | 'lifetime';
  source?: PlanSource;
  kind?: 'guest' | 'account';
  role?: Role;
  status?: 'active' | 'disabled' | 'merged';
  country?: string;
  sort?: 'created' | 'lastSeen' | 'email' | 'planUntil' | 'publicId';
  order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
};

export type PromoQuery = { status?: PromoCode['status'] | 'all'; q?: string; limit?: number; offset?: number };
export type AuditQuery = { action?: string; actor?: string; user?: string; before?: number; limit?: number };
export type StoreEventQuery = { status?: StoreEvent['status']; user?: string; before?: string; limit?: number };

export type PlanChangeResult = { plan: EffectivePlan; revokedGrantIds: number[]; grant: AdminGrant | null; warnings: Warning[] };
export type GrantResult = { grant: AdminGrant; plan: EffectivePlan };
export type PromoRedemption = {
  user: AdminRef & { email: string | null };
  redeemedAt: string;
  grantId: number | null;
  grantStatus: 'active' | 'expired' | 'revoked' | null;
};
export type PromoDetail = { promoCode: PromoCode; redemptions: PromoRedemption[] };
export type PricesResponse = { items: AdminPriceRow[]; defaultTrialDays: number; euAlias: string[] };
export type PriceSaveResult = { item: AdminPriceRow; warnings: Warning[] };
export type SettingsResponse = { items: AdminSetting[] };
export type StoreEventDetail = { event: StoreEvent; payload: Record<string, unknown> };
export type ResetCode = { code: string; expiresAt: string };
export type SyncResult = { plan: EffectivePlan; synced: boolean };

/** A path segment, encoded (public ids, ISO keys and RevenueCat event ids are all allowed as typed). */
const seg = (value: string | number) => encodeURIComponent(String(value));

export function createAdminEndpoints(r: ApiRequester) {
  const user = (id: string) => `/v1/admin/users/${seg(id)}`;
  return {
    // ---- Reads ----
    dashboard: (days: DashboardDays = 30) => r.request<AdminDashboard>('GET', '/v1/admin/dashboard', { query: { days } }),
    users: (query: UsersQuery = {}) => r.request<Page<AdminUserListItem>>('GET', '/v1/admin/users', { query }),
    user: (id: string) => r.request<AdminUserDetail>('GET', user(id)),

    // ---- A user ----
    updateUser: (id: string, body: AdminUpdateUserRequest) => r.request<{ user: AdminUser }>('PATCH', user(id), { body }),
    deleteUser: (id: string, body: AdminDeleteUserRequest) => r.request<void>('DELETE', user(id), { body }),
    grant: (id: string, body: GrantRequest) => r.request<GrantResult>('POST', `${user(id)}/grants`, { body }),
    revokeGrant: (id: string, grantId: number, body: ReasonRequest) =>
      r.request<GrantResult>('POST', `${user(id)}/grants/${seg(grantId)}/revoke`, { body }),
    extend: (id: string, body: ExtendRequest) => r.request<GrantResult>('POST', `${user(id)}/extend`, { body }),
    changePlan: (id: string, body: ChangePlanRequest) => r.request<PlanChangeResult>('POST', `${user(id)}/plan`, { body }),
    setRole: (id: string, role: Role) => r.request<{ user: AdminUser }>('POST', `${user(id)}/role`, { body: { role } }),
    disable: (id: string, body: ReasonRequest) => r.request<{ user: AdminUser }>('POST', `${user(id)}/disable`, { body }),
    enable: (id: string) => r.request<{ user: AdminUser }>('POST', `${user(id)}/enable`, { body: {} }),
    signOutAll: (id: string) => r.request<{ revoked: number }>('POST', `${user(id)}/sign-out-all`, { body: {} }),
    resetCode: (id: string) => r.request<ResetCode>('POST', `${user(id)}/reset-code`, { body: {} }),
    sync: (id: string) => r.request<SyncResult>('POST', `${user(id)}/sync`, { body: {} }),

    // ---- Notes ----
    addNote: (id: string, body: NoteRequest) => r.request<{ note: AdminNote }>('POST', `${user(id)}/notes`, { body }),
    updateNote: (noteId: number, body: NoteRequest) => r.request<{ note: AdminNote }>('PATCH', `/v1/admin/notes/${seg(noteId)}`, { body }),
    deleteNote: (noteId: number) => r.request<void>('DELETE', `/v1/admin/notes/${seg(noteId)}`),

    // ---- Promo codes ----
    promoCodes: (query: PromoQuery = {}) => r.request<Page<PromoCode>>('GET', '/v1/admin/promo-codes', { query }),
    promoCode: (id: number) => r.request<PromoDetail>('GET', `/v1/admin/promo-codes/${seg(id)}`),
    createPromo: (body: PromoCreateRequest) => r.request<{ promoCode: PromoCode }>('POST', '/v1/admin/promo-codes', { body }),
    updatePromo: (id: number, body: PromoUpdateRequest) =>
      r.request<{ promoCode: PromoCode }>('PATCH', `/v1/admin/promo-codes/${seg(id)}`, { body }),
    deletePromo: (id: number) => r.request<void>('DELETE', `/v1/admin/promo-codes/${seg(id)}`),

    // ---- Prices ----
    prices: () => r.request<PricesResponse>('GET', '/v1/admin/prices'),
    putPrice: (country: string, body: PriceUpdateRequest) => r.request<PriceSaveResult>('PUT', `/v1/admin/prices/${seg(country)}`, { body }),
    deletePrice: (country: string) => r.request<void>('DELETE', `/v1/admin/prices/${seg(country)}`),
    resetPrices: () => r.request<{ removed: number }>('POST', '/v1/admin/prices/reset', { body: { confirm: true } }),

    // ---- Settings ----
    settings: () => r.request<SettingsResponse>('GET', '/v1/admin/settings'),
    patchSettings: (values: Partial<Record<SettingKey, unknown>>) =>
      r.request<SettingsResponse>('PATCH', '/v1/admin/settings', { body: { values } }),

    // ---- Audit and store events ----
    audit: (query: AuditQuery = {}) => r.request<CursorPage<AuditEntry, number>>('GET', '/v1/admin/audit', { query }),
    storeEvents: (query: StoreEventQuery = {}) => r.request<CursorPage<StoreEvent, string>>('GET', '/v1/admin/store-events', { query }),
    storeEvent: (id: string) => r.request<StoreEventDetail>('GET', `/v1/admin/store-events/${seg(id)}`),
    retryStoreEvent: (id: string) => r.request<{ event: StoreEvent }>('POST', `/v1/admin/store-events/${seg(id)}/retry`, { body: {} }),

    // ---- Context for the admin screens ----
    /** The signed-in admin (to know "yourself"); kept in memory only. */
    me: () => r.request<MeResponse>('GET', '/v1/me'),
    /** Server version for the dashboard footer. */
    health: () => r.request<HealthResponse>('GET', '/v1/health'),
  };
}

export type AdminEndpoints = ReturnType<typeof createAdminEndpoints>;

/** Plans an admin can give, in the order the controls show them. */
export const PAID_PLANS: readonly PaidPlan[] = ['monthly', 'yearly', 'lifetime'];
