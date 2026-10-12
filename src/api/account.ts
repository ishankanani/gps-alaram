/**
 * The account store (backend-spec 3.7, 3.8 and 7.3), like src/lib/pro.ts: a module-level state read
 * with useSyncExternalStore.
 *
 * Start-up is synchronous (the install id, the SecureStore session and the snapshot file, which
 * counts only when it belongs to the stored session's user); the network runs in the background:
 * a guest is created when there is no session (retried 2 s, 10 s, 30 s, 2 min, then every 5 min),
 * otherwise /v1/me is read. Nothing waits for it, and nothing about the alarm depends on it.
 */
import { File, Paths } from 'expo-file-system';
import * as Network from 'expo-network';
import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { useI18n } from '../i18n';
import type { CachedPlan } from '../lib/entitlement';
import { setSessionRole } from '../state/session';
import type { AuthErrorEvent } from './client';
import type { Reauthenticate } from './contract';
import { ApiError, isApiError } from './errors';
import {
  apiConfigured,
  endpoints,
  setApiLanguage,
  setAuthErrorHandler,
  setForbiddenHandler,
  setReachabilityHandler,
} from './index';
import { clearSession, getInstallId, getSession, setSession, type StoredSession } from './secure';
import type {
  AuthResponse,
  DeleteMeRequest,
  ExportResponse,
  MeResponse,
  MergeSummary,
  PlanResponse,
  RedeemResponse,
  UpdateMeRequest,
  User,
} from './types';

export type { StoredSession } from './secure';

/** A disabled account (403 account_disabled): Free features keep working. */
export type DisabledInfo = { publicId: string | null; supportEmail: string | null };

export type AccountState = {
  /** False in a build without a server: everything else stays empty. */
  configured: boolean;
  session: StoredSession | null;
  /** The last answer about this user (the snapshot), or null. */
  me: MeResponse | null;
  /** Device time the snapshot arrived. */
  receivedAt: number | null;
  /** Creating the guest or reading /me. */
  syncing: boolean;
  /** The last request got no answer (offline, server down). */
  offline: boolean;
  /** The server ended the account's session (401): "Signed out on this phone. Sign in again." */
  signedOutNotice: boolean;
  disabled: DisabledInfo | null;
};

const REFRESH_AFTER_MS = 15 * 60_000;
const GUEST_BACKOFF_MS = [2_000, 10_000, 30_000, 120_000, 300_000];

// ---- The snapshot file (Paths.document/stopwake-account.json) ----

type SnapshotFile = { v: 1; userId: string; receivedAt: number; me: MeResponse; disabled: DisabledInfo | null };

function snapshotFile() {
  return new File(Paths.document, 'stopwake-account.json');
}

function readSnapshot(session: StoredSession | null): SnapshotFile | null {
  if (!session) return null;
  try {
    const f = snapshotFile();
    if (!f.exists) return null;
    const parsed = JSON.parse(f.textSync()) as Partial<SnapshotFile>;
    // Only the stored session's own snapshot counts (3.7).
    if (parsed?.v !== 1 || parsed.userId !== session.userId || !parsed.me?.user || !parsed.me.plan) return null;
    if (typeof parsed.receivedAt !== 'number') return null;
    return { v: 1, userId: parsed.userId, receivedAt: parsed.receivedAt, me: parsed.me, disabled: parsed.disabled ?? null };
  } catch {
    return null;
  }
}

function writeSnapshot(me: MeResponse, receivedAt: number, disabled: DisabledInfo | null) {
  try {
    const f = snapshotFile();
    if (!f.exists) f.create();
    const data: SnapshotFile = { v: 1, userId: me.user.id, receivedAt, me, disabled };
    f.write(JSON.stringify(data));
  } catch {
    // The plan is fetched again next time.
  }
}

function deleteSnapshot() {
  try {
    const f = snapshotFile();
    if (f.exists) f.delete();
  } catch {
    // A stale snapshot is ignored anyway: its userId no longer matches.
  }
}

// ---- State ----

function initialState(): AccountState {
  if (!apiConfigured) {
    return { configured: false, session: null, me: null, receivedAt: null, syncing: false, offline: false, signedOutNotice: false, disabled: null };
  }
  const session = getSession();
  const snapshot = readSnapshot(session);
  return {
    configured: true,
    session,
    me: snapshot?.me ?? null,
    receivedAt: snapshot?.receivedAt ?? null,
    syncing: false,
    offline: false,
    signedOutNotice: false,
    disabled: snapshot?.disabled ?? null,
  };
}

let state: AccountState | null = null;
const listeners = new Set<() => void>();
let lastRefreshAt = 0;

function current(): AccountState {
  if (!state) state = initialState();
  return state;
}

function patch(change: Partial<AccountState>) {
  state = { ...current(), ...change };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getAccountState(): AccountState {
  return current();
}

export function subscribeAccount(listener: () => void): () => void {
  return subscribe(listener);
}

/** The account state; re-renders on every change. */
export function useAccount(): AccountState {
  return useSyncExternalStore(subscribe, current);
}

/** The user of the snapshot, when it belongs to the session. */
export function accountUser(s: AccountState = current()): User | null {
  return s.me && s.session && s.me.user.id === s.session.userId ? s.me.user : null;
}

/** The cached plan for src/lib/entitlement.ts. */
export function cachedPlan(s: AccountState = current()): CachedPlan | null {
  if (!s.me || s.receivedAt == null) return null;
  return { userId: s.me.user.id, receivedAt: s.receivedAt, plan: s.me.plan };
}

// ---- Identity (RevenueCat follows it, 3.8) ----

export type Identity = { userId: string; publicId: string };
const identityListeners = new Set<(identity: Identity) => void>();

/** Called whenever the session's user becomes known or changes (src/lib/pro.ts logs RevenueCat in). */
export function onIdentity(listener: (identity: Identity) => void): () => void {
  identityListeners.add(listener);
  return () => {
    identityListeners.delete(listener);
  };
}

function emitIdentity(user: Pick<User, 'id' | 'publicId'>) {
  const identity = { userId: user.id, publicId: user.publicId };
  identityListeners.forEach((l) => l(identity));
}

// ---- Applying answers ----

/** Stores an answer about the session's user; ignored when the session changed meanwhile. */
function applyMe(me: MeResponse, tokenUsed: string): boolean {
  const s = getSession();
  if (!s || s.token !== tokenUsed || s.userId !== me.user.id) return false;
  let session = s;
  if (s.publicId !== me.user.publicId || s.kind !== me.user.kind) {
    session = { ...s, publicId: me.user.publicId, kind: me.user.kind };
    setSession(session);
  }
  const receivedAt = Date.now();
  lastRefreshAt = receivedAt;
  writeSnapshot(me, receivedAt, null);
  patch({ session, me, receivedAt, disabled: null, offline: false });
  setSessionRole(me.user.role);
  return true;
}

function applyAuth(res: AuthResponse) {
  const { token, ...rest } = res;
  const me: MeResponse = { user: rest.user, session: rest.session, plan: rest.plan, entitlements: rest.entitlements };
  setSession({ token, userId: res.user.id, publicId: res.user.publicId, kind: res.user.kind });
  applyMe(me, token);
  patch({ signedOutNotice: false });
  emitIdentity(res.user);
}

function applyPlan(p: PlanResponse, tokenUsed: string) {
  const me = current().me;
  if (!me) return;
  applyMe({ ...me, plan: p.plan, entitlements: p.entitlements }, tokenUsed);
}

/** Forgets the session and its snapshot (sign-out, deletion, a dead token). */
function dropSession() {
  clearSession();
  deleteSnapshot();
  patch({ session: null, me: null, receivedAt: null, disabled: null });
  setSessionRole(null);
}

function setDisabled(details: Record<string, unknown> | undefined) {
  const s = current();
  const info: DisabledInfo = {
    publicId: typeof details?.publicId === 'string' ? details.publicId : (s.session?.publicId ?? null),
    supportEmail: typeof details?.supportEmail === 'string' ? details.supportEmail : null,
  };
  if (s.me) writeSnapshot(s.me, s.receivedAt ?? Date.now(), info);
  patch({ disabled: info });
  setSessionRole('user');
}

// ---- The guest ----

let guestInflight: Promise<boolean> | null = null;
let guestTimer: ReturnType<typeof setTimeout> | null = null;
let guestAttempt = 0;

function scheduleGuestRetry() {
  if (guestTimer) clearTimeout(guestTimer);
  const delay = GUEST_BACKOFF_MS[Math.min(guestAttempt, GUEST_BACKOFF_MS.length - 1)];
  guestAttempt += 1;
  guestTimer = setTimeout(() => {
    guestTimer = null;
    if (!getSession()) void createGuest();
  }, delay);
}

/** POST /v1/auth/guest for this installation. Resolves to whether a session exists afterwards. */
function createGuest(): Promise<boolean> {
  if (!apiConfigured) return Promise.resolve(false);
  if (getSession()) return Promise.resolve(true);
  if (guestInflight) return guestInflight;
  guestInflight = (async () => {
    patch({ syncing: true });
    try {
      const res = await endpoints.auth.guest({ installId: getInstallId() });
      // Someone signed in meanwhile: that session wins.
      if (getSession()) return true;
      applyAuth(res);
      guestAttempt = 0;
      return true;
    } catch (e) {
      if (isApiError(e) && e.code === 'account_disabled') {
        // This installation's guest is disabled: wait for the next foreground.
        setDisabled(e.details);
      } else {
        scheduleGuestRetry();
      }
      return false;
    } finally {
      guestInflight = null;
      patch({ syncing: false });
    }
  })();
  return guestInflight;
}

/** Tries the guest again now (foreground, network back), restarting the backoff. */
function retryGuestNow() {
  if (getSession() || !apiConfigured) return;
  guestAttempt = 0;
  if (guestTimer) {
    clearTimeout(guestTimer);
    guestTimer = null;
  }
  void createGuest();
}

// ---- Refresh ----

let meInflight: Promise<void> | null = null;

/**
 * Reads /v1/me (or creates the guest when there is no session). Never throws; pull to refresh,
 * foreground, and every mutation call it.
 */
export function refreshAccount(): Promise<void> {
  if (!apiConfigured) return Promise.resolve();
  const s = getSession();
  if (!s) {
    retryGuestNow();
    return (guestInflight ?? Promise.resolve(false)).then(() => undefined);
  }
  if (meInflight) return meInflight;
  meInflight = (async () => {
    patch({ syncing: true });
    try {
      const me = await endpoints.me.get();
      applyMe(me, s.token);
    } catch {
      // 401 and 403 are handled by onAuthError; offline keeps the snapshot.
    } finally {
      meInflight = null;
      patch({ syncing: false });
    }
  })();
  return meInflight;
}

// ---- Handlers installed in the API client ----

function handleAuthError(event: AuthErrorEvent) {
  const s = getSession();
  // An answer for a token we no longer hold (signed in or out meanwhile).
  if (!s || event.token !== s.token) return;
  if (event.kind === 'unauthorized') {
    const wasAccount = s.kind === 'account';
    dropSession();
    patch({ signedOutNotice: wasAccount });
    void createGuest();
  } else if (event.kind === 'disabled') {
    setDisabled(event.error.details);
  }
  // reauth_required: the admin area asks for the password (reauthenticate) and retries.
}

if (apiConfigured) {
  setAuthErrorHandler(handleAuthError);
  setReachabilityHandler((reached) => {
    if (current().offline === !reached) return;
    patch({ offline: !reached });
  });
  setForbiddenHandler(() => void refreshAccount());
}

let started = false;

/**
 * Starts the account once per app run (startPro() calls it): the role from the snapshot at once,
 * then the guest or /me in the background, and refreshes on foreground and when the network returns.
 */
export function startAccount() {
  if (started) return;
  started = true;
  const s = current();
  if (!apiConfigured) {
    setSessionRole(null);
    return;
  }
  if (s.me && !s.disabled) setSessionRole(s.me.user.role);
  else if (s.disabled) setSessionRole('user');

  void refreshAccount();

  AppState.addEventListener('change', (next) => {
    if (next !== 'active') return;
    if (!getSession()) retryGuestNow();
    else if (Date.now() - lastRefreshAt >= REFRESH_AFTER_MS || Date.now() < lastRefreshAt) void refreshAccount();
  });
  try {
    Network.addNetworkStateListener((n) => {
      if (!n.isConnected || n.isInternetReachable === false) return;
      if (!getSession()) retryGuestNow();
      else if (current().offline) void refreshAccount();
    });
  } catch {
    // No network events: foregrounds still retry.
  }
}

// ---- Mutations (each rejects with ApiError) ----

function requireSession(): StoredSession {
  const s = getSession();
  if (!s) throw new ApiError({ status: 0, code: 'network', message: 'No session yet' });
  return s;
}

/** The guest becomes an account with the same ID (2.6). */
export async function signUp(input: { email: string; password: string; displayName?: string | null }): Promise<void> {
  if (!getSession()) await createGuest();
  requireSession();
  const res = await endpoints.auth.signUp({ email: input.email, password: input.password, displayName: input.displayName || undefined });
  applyAuth(res);
}

/**
 * Signs in with the current guest token as bearer, so the server moves the guest's plan, codes and
 * purchases into the account (3.6). Resolves with what moved, or null.
 */
export async function signIn(input: { email: string; password: string }): Promise<MergeSummary | null> {
  // A guest being created right now would take this installation's sessions with it: let it land first.
  if (guestInflight) await guestInflight;
  const s = getSession();
  const res = await endpoints.auth.signIn({ email: input.email, password: input.password, installId: getInstallId() }, s?.token ?? null);
  applyAuth(res);
  return res.merged;
}

/** "Confirm it's you" (7.7): signs in again with the current account's email and the same token. */
export const reauthenticate: Reauthenticate = async (password) => {
  const s = getSession();
  const email = accountUser()?.email;
  if (!s || s.kind !== 'account' || !email) {
    throw new ApiError({ status: 401, code: 'unauthorized', message: 'Not signed in to an account' });
  }
  const res = await endpoints.auth.signIn({ email, password, installId: getInstallId() }, s.token);
  applyAuth(res);
};

/** Signs out on this phone and continues as a new guest (3.8). Never fails: offline, the token is just forgotten. */
export async function signOut(): Promise<void> {
  const s = getSession();
  if (s) {
    try {
      await endpoints.auth.signOut(s.token);
    } catch {
      // The token is forgotten either way; it expires on the server.
    }
  }
  dropSession();
  patch({ signedOutNotice: false });
  await createGuest();
}

/** Signs out every other phone; resolves with how many sessions ended. */
export async function signOutOthers(): Promise<number> {
  requireSession();
  const res = await endpoints.auth.signOutAll({ keepCurrent: true });
  return res?.revoked ?? 0;
}

/** Leaves a disabled account behind: signs out and continues as a new guest. */
export async function continueAsNewGuest(): Promise<void> {
  await signOut();
}

export async function updateProfile(body: UpdateMeRequest): Promise<User> {
  const s = requireSession();
  const res = await endpoints.me.update(body);
  const me = current().me;
  if (me) applyMe({ ...me, user: res.user }, s.token);
  return res.user;
}

/** Resolves with how many other phones were signed out. */
export async function changePassword(currentPassword: string, newPassword: string): Promise<number> {
  requireSession();
  const res = await endpoints.me.changePassword({ currentPassword, newPassword });
  return res?.revokedSessions ?? 0;
}

export async function forgotPassword(email: string): Promise<void> {
  await endpoints.auth.forgotPassword({ email });
}

/** Sets a new password with a code from the email or from support, and signs in. */
export async function resetPassword(input: { email: string; code: string; newPassword: string }): Promise<void> {
  if (guestInflight) await guestInflight;
  const res = await endpoints.auth.resetPassword({ ...input, installId: getInstallId() });
  applyAuth(res);
}

export async function redeemCode(code: string): Promise<RedeemResponse> {
  if (!getSession()) await createGuest();
  const s = requireSession();
  const res = await endpoints.promo.redeem({ code });
  applyPlan(res, s.token);
  return res;
}

/** Everything the server stores about this user (GET /me/export). */
export async function exportData(): Promise<ExportResponse> {
  requireSession();
  return endpoints.me.export();
}

/**
 * Deletes the account or guest on the server (DELETE /v1/me), then continues as a new guest.
 * 409 subscription_active asks for acknowledgeSubscription; 409 last_admin can't be done.
 */
export async function deleteAccount(body: DeleteMeRequest): Promise<void> {
  requireSession();
  await endpoints.me.delete(body);
  dropSession();
  patch({ signedOutNotice: false });
  guestAttempt = 0;
  await createGuest();
}

/** After a purchase or restore: the server asks RevenueCat (POST /plan/sync), then /me (3.8). */
export async function syncPlan(): Promise<void> {
  const s = getSession();
  if (!s || !apiConfigured) return;
  try {
    const res = await endpoints.plan.sync();
    applyPlan(res, s.token);
  } catch {
    // Rate limited or offline: the webhook and the next refresh catch up.
  }
  await refreshAccount();
}

export function dismissSignedOutNotice() {
  if (current().signedOutNotice) patch({ signedOutNotice: false });
}

/** Keeps the API's language (Accept-Language, config texts) in step with the app's. */
export function useApiLanguage() {
  const { lang } = useI18n();
  useEffect(() => {
    setApiLanguage(lang);
  }, [lang]);
}
