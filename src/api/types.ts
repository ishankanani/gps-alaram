/**
 * The wire contract between the app and StopWake Cloud (docs/design/backend-spec.md, 2.2).
 * Types only: the app imports it, and the server imports it with `import type`.
 */
import type { PriceFormat, PriceRow } from '../lib/pricing.ts';
export type { PriceFormat, PriceRow };

export type IsoDate = string;
export type ApiLang = 'da' | 'de' | 'en' | 'fi' | 'fr' | 'hi' | 'it' | 'ja' | 'nb' | 'nl' | 'sv';
export type Platform = 'android' | 'ios';
export type PlanId = 'free' | 'monthly' | 'yearly' | 'lifetime';
export type PaidPlan = Exclude<PlanId, 'free'>;
export type PlanSource = 'store' | 'grant' | 'promo';
export type Role = 'user' | 'admin';
export type StoreId = 'play_store' | 'app_store' | 'stripe' | 'amazon' | 'promotional' | 'test_store' | 'other';
export type ProFeature = 'heavyAlarm' | 'unlimitedFavourites' | 'offlineMap';
export type EntitlementStatus =
  | 'active' | 'trialing' | 'grace_period' | 'billing_issue' | 'paused' | 'expired' | 'refunded' | 'revoked';

export type User = {
  id: string;                 // RevenueCat app user id
  publicId: string;           // SW-7K3P-92QX
  kind: 'guest' | 'account';
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  role: Role;
  country: string | null;
  language: ApiLang | null;
  createdAt: IsoDate;
  signedUpAt: IsoDate | null;
};

export type EffectivePlan = {
  plan: PlanId;
  isPro: boolean;
  source: PlanSource | null;
  status: EntitlementStatus | null;   // of the chosen entitlement; null when free
  expiresAt: IsoDate | null;          // end of the chosen entitlement; null for lifetime and free
  willRenew: boolean;
  trial: boolean;
  store: StoreId | null;
  productId: string | null;
  promoCode: string | null;
  checkedAt: IsoDate;                 // server time of this answer
  cacheUntil: IsoDate;                // the app may trust isPro offline until then (3.7)
};

export type Entitlement = {
  id: string;                         // 'grant:12' | 'store:5'
  source: PlanSource;
  plan: PaidPlan;
  status: EntitlementStatus;
  startsAt: IsoDate;
  endsAt: IsoDate | null;
  willRenew: boolean;
  promoCode: string | null;
  store: StoreId | null;
  productId: string | null;
};

export type Session = { createdAt: IsoDate; expiresAt: IsoDate };
export type PlanResponse = { plan: EffectivePlan; entitlements: Entitlement[] };   // active entitlements only
export type MeResponse = PlanResponse & { user: User; session: Session };
export type AuthResponse = MeResponse & { token: string };
export type MergeSummary = { fromPublicId: string; grants: number; storeSubscriptions: number; promoRedemptions: number };
export type SignInResponse = AuthResponse & { merged: MergeSummary | null };

export type GuestRequest = { installId: string };
export type SignUpRequest = { email: string; password: string; displayName?: string | null };
export type SignInRequest = { email: string; password: string; installId: string };
export type SignOutAllRequest = { keepCurrent?: boolean };
export type ForgotPasswordRequest = { email: string };
export type ResetPasswordRequest = { email: string; code: string; newPassword: string; installId: string };
export type UpdateMeRequest = {
  displayName?: string | null; language?: ApiLang | null; country?: string | null;
  email?: string; currentPassword?: string;           // currentPassword required with email
};
export type ChangePasswordRequest = { currentPassword: string; newPassword: string };
export type DeleteMeRequest = { password?: string; acknowledgeSubscription?: boolean };
export type RedeemRequest = { code: string };
export type RedeemResponse = PlanResponse & { grant: Entitlement };
export type SyncResponse = PlanResponse & { synced: boolean };
export type ExportResponse = {
  exportedAt: IsoDate; user: User; plan: EffectivePlan; entitlements: Entitlement[];
  devices: { platform: Platform; appVersion: string; osVersion: string | null; country: string | null;
             language: string | null; createdAt: IsoDate; lastSeenAt: IsoDate }[];
  promoRedemptions: { code: string; redeemedAt: IsoDate }[];
  sessions: { createdAt: IsoDate; lastUsedAt: IsoDate; expiresAt: IsoDate }[];
};

export type HealthResponse = { ok: true; version: string; commit: string | null; time: IsoDate; uptimeSeconds: number };

export type Announcement = {
  id: string; level: 'info' | 'success' | 'warning' | 'critical';
  title: string | null; body: string; url: string | null; dismissible: boolean;
};
export type RemoteConfig = {
  configVersion: string;              // = ETag without quotes
  country: string;                    // the ISO country the config was resolved for, or 'DEFAULT'
  prices: PriceRow;                   // resolved row: prices.country is 'DE' | 'EU' | 'DEFAULT' | …
  trialDays: number;                  // prices.trialDays ?? setting pricing.trialDays
  limits: { freeFavourites: number };
  proFeatures: Record<ProFeature, boolean>;   // true = the feature needs Pro
  features: { redeemCodes: boolean };
  announcement: Announcement | null;
  support: { email: string };
  links: { privacy: string; terms: string; accountDeletion: string };
  app: { minVersion: string; latestVersion: string; updateUrl: string };
  auth: { signUpEnabled: boolean; passwordReset: boolean };   // passwordReset = mail is configured
  planCacheDays: number;
};

export type FieldError =
  | 'required' | 'invalid' | 'invalid_email' | 'too_short' | 'too_long' | 'too_common' | 'same_as_email'
  | 'out_of_range' | 'invalid_date' | 'in_past' | 'unknown_key' | 'not_allowed';
export type ErrorCode =
  | 'bad_request' | 'validation_failed' | 'unsupported_media_type' | 'payload_too_large'
  | 'unauthorized' | 'invalid_credentials' | 'reauth_required'
  | 'forbidden' | 'account_disabled' | 'signup_disabled' | 'redeem_disabled'
  | 'not_found' | 'method_not_allowed'
  | 'email_taken' | 'already_signed_up' | 'not_an_account' | 'subscription_active' | 'last_admin'
  | 'cannot_target_self' | 'confirm_mismatch' | 'already_revoked' | 'already_lifetime'
  | 'promo_invalid' | 'promo_expired' | 'promo_exhausted' | 'promo_already_redeemed'
  | 'code_taken' | 'promo_in_use' | 'invalid_reset_code'
  | 'rate_limited' | 'mail_unavailable' | 'not_configured' | 'unavailable' | 'internal';
export type ApiErrorBody = {
  error: {
    code: ErrorCode;
    message: string;                          // English, for logs and admin screens; the app shows its own text
    fields?: Record<string, FieldError>;
    retryAfterSeconds?: number;
    details?: Record<string, unknown>;        // e.g. account_disabled: { publicId, supportEmail }
  };
};

// ---- Admin ----
export type AdminRef = { id: string; publicId: string; displayName: string | null };
export type Warning = 'store_subscription_active' | 'yearly_not_cheaper' | 'lifetime_not_above_yearly';
export type AdminUserListItem = {
  id: string; publicId: string; kind: 'guest' | 'account'; email: string | null; displayName: string | null;
  role: Role; status: 'active' | 'disabled' | 'merged'; country: string | null; language: ApiLang | null;
  plan: PlanId; planSource: PlanSource | null; planExpiresAt: IsoDate | null; willRenew: boolean; trial: boolean;
  createdAt: IsoDate; lastSeenAt: IsoDate | null; notesCount: number;
};
export type AdminUser = AdminUserListItem & {
  emailVerified: boolean; signedUpAt: IsoDate | null; disabledAt: IsoDate | null; disabledReason: string | null;
  mergedInto: AdminRef | null; passwordSet: boolean; activeSessions: number;
};
export type AdminGrant = {
  kind: 'grant'; id: number; source: 'admin' | 'promo'; plan: PaidPlan; status: 'active' | 'expired' | 'revoked';
  startsAt: IsoDate; endsAt: IsoDate | null; reason: string; promoCode: string | null;
  createdBy: AdminRef | null; createdAt: IsoDate; updatedAt: IsoDate;
  revokedAt: IsoDate | null; revokedBy: AdminRef | null; revokeReason: string | null;
};
export type AdminStoreSubscription = {
  kind: 'store'; id: number; store: StoreId; environment: 'production' | 'sandbox'; productId: string; plan: PaidPlan;
  status: EntitlementStatus; periodType: string | null; willRenew: boolean; purchasedAt: IsoDate;
  expiresAt: IsoDate | null; graceUntil: IsoDate | null; cancelReason: string | null; originalTransactionId: string;
  country: string | null; currency: string | null; priceLocal: number | null; priceUsd: number | null;
  lastEventType: string | null; lastEventAt: IsoDate;
};
export type AdminDevice = {
  id: number; platform: Platform; appVersion: string; build: number | null; osVersion: string | null;
  country: string | null; language: string | null; createdAt: IsoDate; lastSeenAt: IsoDate; activeSessions: number;
};
export type AdminNote = { id: number; body: string; author: AdminRef | null; createdAt: IsoDate; updatedAt: IsoDate };
export type AdminRedemption = {
  promoCodeId: number; code: string; redeemedAt: IsoDate; grantId: number | null;
  grantStatus: 'active' | 'expired' | 'revoked' | null;
};
export type AuditAction =
  | 'admin.bootstrap' | 'admin.sign_in' | 'admin.sign_in_failed'
  | 'user.update' | 'user.role' | 'user.disable' | 'user.enable' | 'user.delete' | 'user.sign_out_all'
  | 'user.reset_code' | 'user.sync' | 'user.merge'
  | 'grant.create' | 'grant.extend' | 'grant.revoke' | 'plan.change'
  | 'note.create' | 'note.update' | 'note.delete'
  | 'promo.create' | 'promo.update' | 'promo.delete'
  | 'price.update' | 'price.delete' | 'price.reset' | 'settings.update' | 'store_event.retry';
export type AuditEntry = {
  id: number; at: IsoDate; actor: { id: string | null; label: string; displayName: string | null };
  action: AuditAction; target: { type: string | null; id: string | null; label: string | null };
  userId: string | null; details: Record<string, unknown>; ip: string | null;
};
export type StoreEvent = {
  id: string; type: string; status: 'processed' | 'stale' | 'ignored' | 'unmatched' | 'error';
  appUserId: string | null; user: AdminRef | null; environment: string | null;
  eventAt: IsoDate | null; receivedAt: IsoDate; processedAt: IsoDate | null; error: string | null;
};
export type AdminUserDetail = {
  user: AdminUser; plan: EffectivePlan; grants: AdminGrant[]; storeSubscriptions: AdminStoreSubscription[];
  devices: AdminDevice[]; redemptions: AdminRedemption[]; notes: AdminNote[];
  audit: AuditEntry[];          // latest 20 with target_user_id = user
  storeEvents: StoreEvent[];    // latest 10
};
export type AdminDashboard = {
  generatedAt: IsoDate;
  users: { total: number; accounts: number; guests: number; admins: number; disabled: number;
           new: { today: number; last7d: number; last30d: number };
           active: { last1d: number; last7d: number; last30d: number } };
  pro: { total: number; share: number; trials: number;
         bySource: Record<PlanSource, number>; byPlan: Record<PaidPlan, number> };
  store: { active: number; renewing: number; billingIssues: number; mrrUsd: number; lifetime30d: number; sandboxActive: number };
  promo: { activeCodes: number; redemptions30d: number };
  signupsByDay: { date: string; guests: number; accounts: number }[];   // UTC days, oldest first
  countries: { country: string; users: number; pro: number }[];        // top 10 by users
  appVersions: { version: string; devices: number }[];                 // devices seen in the last 30 days
  webhooks: { configured: boolean; lastEventAt: IsoDate | null; errors24h: number; unmatched7d: number };
  recentAudit: AuditEntry[];                                           // latest 10
};
export type GrantRequest = { plan: PaidPlan; durationDays?: number; endsAt?: IsoDate; reason: string };
export type ChangePlanRequest = { plan: PlanId; durationDays?: number; endsAt?: IsoDate; reason: string };
export type ExtendRequest = { days?: number; endsAt?: IsoDate; grantId?: number; plan?: 'monthly' | 'yearly'; reason: string };
export type ReasonRequest = { reason: string };
export type SetRoleRequest = { role: Role };
export type AdminDeleteUserRequest = { confirm: string; reason: string };   // confirm = the user's public id
export type AdminUpdateUserRequest = { displayName?: string | null; email?: string; country?: string | null; language?: ApiLang | null };
export type NoteRequest = { body: string };
export type PromoCode = {
  id: number; code: string; plan: PaidPlan; durationDays: number | null; maxRedemptions: number | null;
  redemptionCount: number; startsAt: IsoDate | null; expiresAt: IsoDate | null; active: boolean;
  status: 'active' | 'scheduled' | 'expired' | 'exhausted' | 'inactive';
  description: string; createdBy: AdminRef | null; createdAt: IsoDate; updatedAt: IsoDate;
};
export type PromoCreateRequest = {
  code?: string; plan: PaidPlan; durationDays?: number; maxRedemptions?: number | null;
  startsAt?: IsoDate | null; expiresAt?: IsoDate | null; description?: string; active?: boolean;
};
export type PromoUpdateRequest = Partial<Omit<PromoCreateRequest, 'code'>>;
export type AdminPriceRow = PriceRow & {
  builtin: PriceRow | null; overridden: boolean; updatedAt: IsoDate | null; updatedBy: AdminRef | null;
};
export type PriceUpdateRequest = {
  currency: string; monthly: number; yearly: number; lifetime: number;
  trialDays?: number | null; format?: PriceFormat | null;
};
export type SettingKey =
  | 'limits.freeFavourites' | 'pro.features' | 'pricing.trialDays' | 'announcement' | 'support.email'
  | 'links.privacy' | 'links.terms' | 'app.minVersion' | 'app.latestVersion' | 'auth.signUpEnabled'
  | 'promo.redeemEnabled' | 'plan.cacheDays' | 'store.productPlans';
export type AdminSetting = {
  key: SettingKey; value: unknown; default: unknown; overridden: boolean;
  updatedAt: IsoDate | null; updatedBy: AdminRef | null;
};
export type AnnouncementSetting = {
  id: string; enabled: boolean; level: Announcement['level'];
  texts: { en: { title?: string | null; body: string } } & Partial<Record<ApiLang, { title?: string | null; body: string }>>;
  url: string | null; countries: string[] | null; minAppVersion: string | null; maxAppVersion: string | null;
  startsAt: IsoDate | null; endsAt: IsoDate | null; dismissible: boolean;
};
