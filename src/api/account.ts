/**
 * The account store (backend-spec 3.7, 3.8 and 7.3), like src/lib/pro.ts: a module-level state read
 * with useSyncExternalStore.
 *
 * Start-up is synchronous (the install id, the SecureStore session and the snapshot file, which
 * counts only when it belongs to the stored session's user); the network runs in the background:
 * /v1/me is read when there is a session. Nothing waits for it, and nothing about the alarm
 * depends on it.
 *
 * With Supabase there are no server-side guests: without an account everything stays on the
 * phone (session null). Supabase Auth keeps its own tokens (src/api/supabase/client.ts); the
 * StoredSession here mirrors who is signed in, with token `sb:<user id>`, so pro.ts and the
 * stale-answer checks keep working. Signing in starts the sync (src/api/sync.ts).
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
import { ApiError } from './errors';
import {
  apiConfigured,
  endpoints,
  setApiLanguage,
  setAuthErrorHandler,
  setForbiddenHandler,
  setReachabilityHandler,
} from './index';
import { clearSession, getSession, setSession, type StoredSession } from './secure';
import { getSupabase } from './supabase/client';
import { resetSync, startSync, syncNow } from './sync';
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

/** The mirrored session token of a Supabase user (the real JWTs stay with supabase-js). */
const sessionToken = (userId: string) => `sb:${userId}`;

function applyAuth(res: AuthResponse) {
  const { token: _jwt, ...rest } = res;
  const token = sessionToken(res.user.id);
  const me: MeResponse = { user: rest.user, session: rest.session, plan: rest.plan, entitlements: rest.entitlements };
  setSession({ token, userId: res.user.id, publicId: res.user.publicId, kind: res.user.kind });
  applyMe(me, token);
  patch({ signedOutNotice: false });
  emitIdentity(res.user);
  // Merges the phone's favourites, recents and trips into the account, and the account's into the phone.
  void syncNow();
}

function applyPlan(p: PlanResponse, tokenUsed: string) {
  const me = current().me;
  if (!me) return;
  applyMe({ ...me, plan: p.plan, entitlements: p.entitlements }, tokenUsed);
}

/** Forgets the session and its snapshot (sign-out, deletion, a dead token). */
function dropSession() {
  clearSession();
  resetSync();
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

// ---- No guests ----

function retryGuestNow() {
  // Nothing to retry: guests are local.
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
    return Promise.resolve();
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

// ---- Supabase Auth's own session ----

/** True while this phone signs itself out (no "signed out on this phone" notice). */
let signingOut = false;

/**
 * Follows Supabase Auth: a session restored at start or after a refresh becomes the mirrored
 * StoredSession, and a session Supabase ended (refresh token revoked, user deleted) signs out here.
 */
function watchSupabaseSession() {
  const sb = getSupabase();
  if (!sb) return;
  sb.auth.onAuthStateChange((event, session) => {
    const s = getSession();
    if (!session) {
      if (s && !signingOut && event === 'SIGNED_OUT') {
        const wasAccount = s.kind === 'account';
        dropSession();
        patch({ signedOutNotice: wasAccount });
      }
      return;
    }
    if (!s || s.userId !== session.user.id) {
      setSession({ token: sessionToken(session.user.id), userId: session.user.id, publicId: s?.userId === session.user.id ? s.publicId : '', kind: 'account' });
      patch({ session: getSession(), me: null, receivedAt: null });
      // Outside the auth callback: supabase-js must not be re-entered from it.
      setTimeout(() => void refreshAccount(), 0);
    }
  });
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

  watchSupabaseSession();
  void refreshAccount();
  startSync();

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

/**
 * Creates the account (Supabase Auth sign-up). Rejects with `confirmation_sent` when the project
 * asks for email confirmation first; the favourites and trips on the phone go into the account at
 * the first sign-in.
 */
export async function signUp(input: { email: string; password: string; displayName?: string | null }): Promise<void> {
  const res = await endpoints.auth.signUp({ email: input.email, password: input.password, displayName: input.displayName || undefined });
  applyAuth(res);
}

/**
 * Signs in with the current guest token as bearer, so the server moves the guest's plan, codes and
 * purchases into the account (3.6). Resolves with what moved, or null.
 */
export async function signIn(input: { email: string; password: string }): Promise<MergeSummary | null> {
  const res = await endpoints.auth.signIn({ email: input.email, password: input.password, installId: '' });
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
  const res = await endpoints.auth.signIn({ email, password, installId: '' });
  applyAuth(res);
};

/** Signs out on this phone; the data on the phone stays. Never fails: offline, the session is just forgotten. */
export async function signOut(): Promise<void> {
  signingOut = true;
  try {
    await endpoints.auth.signOut();
  } catch {
    // Forgotten either way; the refresh token expires on the server.
  } finally {
    signingOut = false;
  }
  dropSession();
  patch({ signedOutNotice: false });
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
  const res = await endpoints.auth.resetPassword({ ...input, installId: '' });
  applyAuth(res);
}

export async function redeemCode(code: string): Promise<RedeemResponse> {
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
  signingOut = true;
  try {
    await endpoints.me.delete(body);
  } finally {
    signingOut = false;
  }
  dropSession();
  patch({ signedOutNotice: false });
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
