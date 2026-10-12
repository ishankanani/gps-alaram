// The admin area's data layer (backend-spec 7.1 and 7.7): every admin route through the app's
// requester, "Confirm it's you" and a retry on 401 reauth_required, leaving the admin stack on 403
// forbidden, and small query and mutation hooks over an in-memory cache. Admin data is never
// written to disk: the cache lives in this module and is cleared whenever the session's role
// changes.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { getSessionRole, onSessionRoleChange, setSessionRole } from '../state/session';
import { accountUser, reauthenticate, useAccount } from './account';
import { createAdminEndpoints } from './adminEndpoints';
import type { ApiRequester, HttpMethod, RequestOptions } from './contract';
import { API_URL, api, apiConfigured } from './index';
import { refreshConfig } from './config';
import type { FieldError, User } from './types';

export * from './adminEndpoints';

// ---- Errors ----

/** An admin request failure: the ApiError fields (contract.ts), as an Error so dialogs can show it. */
export class AdminRequestError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: Record<string, FieldError>;
  readonly details?: Record<string, unknown>;
  readonly retryAfterSeconds?: number;

  constructor(init: {
    status: number;
    code: string;
    message: string;
    fields?: Record<string, FieldError>;
    details?: Record<string, unknown>;
    retryAfterSeconds?: number;
  }) {
    super(init.message);
    this.name = 'AdminRequestError';
    this.status = init.status;
    this.code = init.code;
    this.fields = init.fields;
    this.details = init.details;
    this.retryAfterSeconds = init.retryAfterSeconds;
  }
}

/** Any thrown value as an AdminRequestError (ApiError is read by shape, not by class). */
export function toAdminError(e: unknown): AdminRequestError {
  if (e instanceof AdminRequestError) return e;
  if (e && typeof e === 'object' && 'code' in e && typeof (e as { code: unknown }).code === 'string') {
    const x = e as { status?: unknown; code: string; message?: unknown; fields?: unknown; details?: unknown; retryAfterSeconds?: unknown };
    return new AdminRequestError({
      status: typeof x.status === 'number' ? x.status : 0,
      code: x.code,
      message: typeof x.message === 'string' ? x.message : x.code,
      fields: x.fields && typeof x.fields === 'object' ? (x.fields as Record<string, FieldError>) : undefined,
      details: x.details && typeof x.details === 'object' ? (x.details as Record<string, unknown>) : undefined,
      retryAfterSeconds: typeof x.retryAfterSeconds === 'number' ? x.retryAfterSeconds : undefined,
    });
  }
  return new AdminRequestError({ status: 0, code: 'internal', message: e instanceof Error ? e.message : String(e) });
}

/** No answer from the server: the phone is offline or the server is unreachable. */
export function isOfflineError(e: unknown): boolean {
  const code = toAdminError(e).code;
  return code === 'network' || code === 'timeout';
}

// ---- Re-authentication and losing the admin role ----

type ReauthHandler = () => Promise<boolean>;
const reauthHandlers: ReauthHandler[] = [];
let pendingReauth: Promise<boolean> | null = null;

/**
 * The focused admin screen offers the "Confirm it's you" dialog. The newest registration wins;
 * returns the unregister function.
 */
export function registerReauthHandler(handler: ReauthHandler): () => void {
  reauthHandlers.push(handler);
  return () => {
    const i = reauthHandlers.lastIndexOf(handler);
    if (i >= 0) reauthHandlers.splice(i, 1);
  };
}

/** One dialog for every request that hit reauth_required at the same time. */
function askReauth(): Promise<boolean> {
  const handler = reauthHandlers[reauthHandlers.length - 1];
  if (!handler) return Promise.resolve(false);
  if (!pendingReauth) {
    pendingReauth = handler()
      .catch(() => false)
      .finally(() => {
        pendingReauth = null;
      });
  }
  return pendingReauth;
}

const forbiddenListeners = new Set<() => void>();

/** Called after a 403 forbidden from an admin route, once the role was dropped. */
export function onAdminForbidden(listener: () => void): () => void {
  forbiddenListeners.add(listener);
  return () => {
    forbiddenListeners.delete(listener);
  };
}

function lostAdmin() {
  // The admin routes disappear with the role (navigation guard); the listeners say why.
  if (getSessionRole() === 'admin') setSessionRole('user');
  forbiddenListeners.forEach((l) => l());
}

/** Signs in again with the current account's email (spec 7.7); rejects with ApiError. */
export async function confirmAdminPassword(password: string): Promise<void> {
  try {
    await reauthenticate(password);
  } catch (e) {
    throw toAdminError(e);
  }
}

const requester: ApiRequester = {
  async request<T>(method: HttpMethod, path: string, options?: RequestOptions): Promise<T> {
    try {
      return await api.request<T>(method, path, options);
    } catch (e) {
      const err = toAdminError(e);
      if (err.code === 'reauth_required' && (await askReauth())) {
        try {
          return await api.request<T>(method, path, options);
        } catch (again) {
          throw toAdminError(again);
        }
      }
      if (err.code === 'forbidden' && path.startsWith('/v1/admin/')) lostAdmin();
      throw err;
    }
  },
};

/** Every admin route, typed (backend-spec 2.10). */
export const adminApi = createAdminEndpoints(requester);

/** False in a build without EXPO_PUBLIC_API_URL: there is no admin area to reach. */
export const adminAvailable: boolean = apiConfigured;

/** The server the admin is changing (shown in the dashboard footer and the Staging badge). */
export const ADMIN_SERVER_URL: string = API_URL;

/** A plain-http server (local or staging): admin TopBars carry a warning badge. */
export const isStagingServer: boolean = /^http:\/\//i.test(ADMIN_SERVER_URL);

// ---- The in-memory cache ----

export type QueryStatus = 'idle' | 'loading' | 'ready' | 'error';

type Entry = {
  data: unknown;
  error: AdminRequestError | null;
  status: QueryStatus;
  /** A pull-to-refresh is running (data stays visible). */
  refreshing: boolean;
  /** A next page is loading (paged lists). */
  loadingMore: boolean;
  fetchedAt: number | null;
};

type Fetcher = () => Promise<unknown>;
type PageFetcher = (cursor: unknown) => Promise<PageResult<unknown, unknown>>;

const EMPTY: Entry = { data: undefined, error: null, status: 'idle', refreshing: false, loadingMore: false, fetchedAt: null };
const entries = new Map<string, Entry>();
const listeners = new Map<string, Set<() => void>>();
const fetchers = new Map<string, Fetcher>();
const pageFetchers = new Map<string, PageFetcher>();
const runs = new Map<string, number>();
const MAX_ENTRIES = 80;

function notify(key: string) {
  listeners.get(key)?.forEach((l) => l());
}

function update(key: string, patch: Partial<Entry>) {
  entries.set(key, { ...(entries.get(key) ?? EMPTY), ...patch });
  notify(key);
}

function subscribeKey(key: string | null, listener: () => void): () => void {
  if (!key) return () => {};
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(listener);
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(key);
  };
}

/** Drops the oldest unwatched entries once the cache is large (searches create many keys). */
function prune() {
  if (entries.size <= MAX_ENTRIES) return;
  for (const key of entries.keys()) {
    if (entries.size <= MAX_ENTRIES) break;
    if (!listeners.has(key)) entries.delete(key);
  }
}

async function runFetch(key: string, mode: 'load' | 'refresh' | 'silent') {
  const fetcher = fetchers.get(key);
  if (!fetcher) return;
  const id = (runs.get(key) ?? 0) + 1;
  runs.set(key, id);
  const current = entries.get(key) ?? EMPTY;
  if (mode === 'refresh') update(key, { refreshing: true });
  else if (mode === 'load') update(key, { status: current.data === undefined ? 'loading' : current.status, error: current.data === undefined ? null : current.error });
  try {
    const data = await fetcher();
    if (runs.get(key) !== id) return;
    // A refresh of a paged list starts again from its first page.
    update(key, { data, error: null, status: 'ready', refreshing: false, loadingMore: false, fetchedAt: Date.now() });
    prune();
  } catch (e) {
    if (runs.get(key) !== id) return;
    update(key, { error: toAdminError(e), status: 'error', refreshing: false });
  }
}

/** Reloads every watched query whose key starts with one of the prefixes ("user:ID", "users", …). */
export function invalidateAdmin(...prefixes: string[]) {
  for (const key of [...entries.keys()]) {
    if (!prefixes.some((p) => key.startsWith(p))) continue;
    if (listeners.has(key) && fetchers.has(key)) void runFetch(key, 'silent');
    else entries.delete(key);
  }
}

/** The cached data of a key, if any (forms read the user detail their screen already loaded). */
export function peekAdmin<T>(key: string): T | undefined {
  return entries.get(key)?.data as T | undefined;
}

/** Forgets everything (a different account, or not an admin any more). */
export function clearAdminCache() {
  entries.clear();
  runs.clear();
  listeners.forEach((set) => set.forEach((l) => l()));
}

onSessionRoleChange(() => clearAdminCache());

export type AdminQuery<T> = {
  data: T | undefined;
  error: AdminRequestError | null;
  /** First load: nothing to show yet. */
  loading: boolean;
  /** Pull to refresh in progress. */
  refreshing: boolean;
  /** When the shown data arrived (for "Showing data from 10 min ago"). */
  fetchedAt: number | null;
  /** The last reload failed while older data is still shown (offline or a server error). */
  stale: boolean;
  reload: () => void;
  refresh: () => void;
};

function useEntry(key: string | null): Entry {
  return useSyncExternalStore(
    (listener) => subscribeKey(key, listener),
    () => (key ? (entries.get(key) ?? EMPTY) : EMPTY),
  );
}

/**
 * Loads `fetcher` for `key` on mount and whenever the key changes (the key names the request and
 * its parameters: "user:SW-…", "users?{…}"). Cached data shows at once and is refreshed in the
 * background; invalidateAdmin() reloads it silently. A null key loads nothing.
 */
export function useAdminQuery<T>(key: string | null, fetcher: () => Promise<T>): AdminQuery<T> {
  const latest = useRef(fetcher);
  useEffect(() => {
    latest.current = fetcher;
  });
  const entry = useEntry(key);

  useEffect(() => {
    if (!key) return;
    fetchers.set(key, () => latest.current());
    void runFetch(key, 'load');
    return () => {
      if (!listeners.has(key)) fetchers.delete(key);
    };
  }, [key]);

  const reload = useCallback(() => {
    if (key) void runFetch(key, 'load');
  }, [key]);
  const refresh = useCallback(() => {
    if (key) void runFetch(key, 'refresh');
  }, [key]);

  return {
    data: entry.data as T | undefined,
    error: entry.error,
    loading: entry.data === undefined && (entry.status === 'loading' || entry.status === 'idle') && !!key,
    refreshing: entry.refreshing,
    fetchedAt: entry.fetchedAt,
    stale: entry.data !== undefined && entry.status === 'error',
    reload,
    refresh,
  };
}

// ---- Paged lists (offset pages for users and codes, `before` cursors for audit and store events) ----

export type PageResult<T, C> = { items: T[]; next: C | null; total?: number };

type Pages<T, C> = { items: T[]; next: C | null; total: number | null };

export type AdminPages<T> = AdminQuery<T[]> & {
  items: T[];
  total: number | null;
  hasMore: boolean;
  loadingMore: boolean;
  /** Loading the next page failed (the footer offers Retry). */
  moreError: AdminRequestError | null;
  loadMore: () => void;
};

const moreErrors = new Map<string, AdminRequestError>();

async function runMore(key: string) {
  const fetchPage = pageFetchers.get(key);
  const entry = entries.get(key);
  const pages = entry?.data as Pages<unknown, unknown> | undefined;
  if (!fetchPage || !entry || !pages || pages.next === null || entry.loadingMore) return;
  const id = runs.get(key) ?? 0;
  moreErrors.delete(key);
  update(key, { loadingMore: true });
  try {
    const page = await fetchPage(pages.next);
    if (runs.get(key) !== id) return;
    const prev = (entries.get(key)?.data as Pages<unknown, unknown> | undefined) ?? pages;
    update(key, {
      data: { items: [...prev.items, ...page.items], next: page.next, total: page.total ?? prev.total },
      loadingMore: false,
    });
  } catch (e) {
    if (runs.get(key) !== id) return;
    moreErrors.set(key, toAdminError(e));
    update(key, { loadingMore: false });
  }
}

/** A list that loads page after page; a refresh or an invalidation starts again from the first. */
export function useAdminPages<T, C>(key: string | null, fetchPage: (cursor: C | null) => Promise<PageResult<T, C>>): AdminPages<T> {
  const latest = useRef(fetchPage);
  useEffect(() => {
    latest.current = fetchPage;
  });
  const entry = useEntry(key);

  useEffect(() => {
    if (!key) return;
    pageFetchers.set(key, (cursor) => latest.current(cursor as C | null) as Promise<PageResult<unknown, unknown>>);
    fetchers.set(key, async () => {
      const page = await latest.current(null);
      return { items: page.items, next: page.next, total: page.total ?? null } satisfies Pages<T, C>;
    });
    void runFetch(key, 'load');
    return () => {
      if (!listeners.has(key)) {
        fetchers.delete(key);
        pageFetchers.delete(key);
      }
    };
  }, [key]);

  const reload = useCallback(() => {
    if (key) void runFetch(key, 'load');
  }, [key]);
  const refresh = useCallback(() => {
    if (key) void runFetch(key, 'refresh');
  }, [key]);
  const loadMore = useCallback(() => {
    if (key) void runMore(key);
  }, [key]);

  const pages = entry.data as Pages<T, C> | undefined;
  return {
    data: pages?.items,
    items: pages?.items ?? [],
    total: pages?.total ?? null,
    hasMore: !!pages && pages.next !== null,
    error: entry.error,
    loading: entry.data === undefined && (entry.status === 'loading' || entry.status === 'idle') && !!key,
    refreshing: entry.refreshing,
    loadingMore: entry.loadingMore,
    moreError: key && !entry.loadingMore ? (moreErrors.get(key) ?? null) : null,
    fetchedAt: entry.fetchedAt,
    stale: entry.data !== undefined && entry.status === 'error',
    reload,
    refresh,
    loadMore,
  };
}

// ---- Mutations ----

export type AdminMutation<A extends unknown[], R> = {
  /** Runs the request; rejects with AdminRequestError. Invalidates the given keys on success. */
  run: (...args: A) => Promise<R>;
  pending: boolean;
  error: AdminRequestError | null;
  reset: () => void;
};

/**
 * Wraps one admin request: `pending` disables the button that started it, and on success the
 * affected queries reload (no optimistic updates: the server confirms every change).
 */
export function useAdminMutation<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
  invalidates?: string[] | ((result: R, ...args: A) => string[]),
): AdminMutation<A, R> {
  const latest = useRef({ fn, invalidates });
  useEffect(() => {
    latest.current = { fn, invalidates };
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<AdminRequestError | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async (...args: A): Promise<R> => {
    setPending(true);
    setError(null);
    try {
      const result = await latest.current.fn(...args);
      const inv = latest.current.invalidates;
      const keys = typeof inv === 'function' ? inv(result, ...args) : (inv ?? []);
      if (keys.length) invalidateAdmin(...keys);
      return result;
    } catch (e) {
      const err = toAdminError(e);
      if (mounted.current) setError(err);
      throw err;
    } finally {
      if (mounted.current) setPending(false);
    }
  }, []);

  const reset = useCallback(() => setError(null), []);
  return { run, pending, error, reset };
}

// ---- The signed-in admin ----

/** The admin using the app (to grey out actions on yourself), from the account store. */
export function useAdminMe(): User | null {
  return accountUser(useAccount());
}

/** Phones read prices and settings from /v1/config; this phone refetches at once after a save (7.3). */
export function refreshConfigAfterAdminSave() {
  void refreshConfig({ force: true }).catch(() => {});
}
