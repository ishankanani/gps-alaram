/**
 * The StopWake Cloud singletons, now answered by Supabase (supabase/README.md): the project from
 * EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY, the client info and the app language.
 *
 * `api` is the seam of src/api/contract.ts: the account store, the config store and the admin
 * package call `api.request('GET', '/v1/...')`, and src/api/supabase/router.ts answers each route
 * with Supabase Auth and RPCs, in the same wire types. In a build without Supabase `apiConfigured`
 * is false and every request rejects at once; the app works as before, without accounts.
 * (The HTTP client for the Node server, client.ts, stays for when server/ is used again.)
 */
import * as Application from 'expo-application';
import { getLocales } from 'expo-localization';
import { Platform } from 'react-native';

import { deviceLanguage, type Lang } from '../i18n';
import { loadData } from '../lib/storage';
import type { AuthErrorEvent, ClientInfo, ClientRequestOptions } from './client';
import type { ApiAvailability, ApiRequester, HttpMethod } from './contract';
import { createEndpoints } from './endpoints';
import { ApiError } from './errors';
import { getInstallId, getToken } from './secure';
import { createSupabaseBackend, SUPABASE_URL, supabaseConfigured } from './supabase/client';
import { createSupabaseRouter } from './supabase/router';

/** The Supabase project URL (no trailing slash); empty in a local build. Inlined at build time. */
export const API_URL = supabaseConfigured ? SUPABASE_URL : '';

/** False in a build without Supabase: no account features at all. */
export const apiConfigured = supabaseConfigured;

export const availability: ApiAvailability = { apiConfigured };

/** The phone's region (ISO 3166 alpha-2, upper case), or null. */
export function deviceRegion(): string | null {
  try {
    const region = getLocales()[0]?.regionCode;
    return region && /^[A-Za-z]{2}$/.test(region) ? region.toUpperCase() : null;
  } catch {
    return null;
  }
}

/** The app's version as x.y.z (app.json "version"). */
export function appVersion(): string {
  const raw = Application.nativeApplicationVersion ?? '0.0.0';
  const parts = raw.split('.').map((p) => String(Number.parseInt(p, 10) || 0));
  while (parts.length < 3) parts.push('0');
  return parts.slice(0, 3).join('.');
}

/** The Android versionCode, or null. */
export function appBuild(): string | null {
  const build = Application.nativeBuildVersion;
  return build && /^\d{1,9}$/.test(build) ? build : null;
}

// ---- The app language (Accept-Language, config) ----

function initialLanguage(): Lang {
  try {
    return loadData().preferences.language ?? deviceLanguage();
  } catch {
    return deviceLanguage();
  }
}

let language: Lang = initialLanguage();
const languageListeners = new Set<(lang: Lang) => void>();

export function getApiLanguage(): Lang {
  return language;
}

/**
 * Tells the API the app's language (Accept-Language, the config's announcement texts, mails). The
 * account screens call it through useApiLanguage(); the language provider should call it too.
 */
export function setApiLanguage(next: Lang) {
  if (next === language) return;
  language = next;
  languageListeners.forEach((l) => l(next));
}

export function onApiLanguageChange(listener: (lang: Lang) => void): () => void {
  languageListeners.add(listener);
  return () => {
    languageListeners.delete(listener);
  };
}

function clientInfo(): ClientInfo {
  return {
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
    appVersion: appVersion(),
    build: appBuild(),
    osVersion: Platform.OS === 'android' || Platform.OS === 'ios' ? String(Platform.Version) : null,
    language,
    region: deviceRegion(),
  };
}

// ---- Hooks the account store installs (no import cycle: account.ts imports this file) ----

let authErrorHandler: ((event: AuthErrorEvent) => void) | null = null;
let reachabilityHandler: ((reached: boolean) => void) | null = null;
let forbiddenHandler: (() => void) | null = null;

export function setAuthErrorHandler(handler: (event: AuthErrorEvent) => void) {
  authErrorHandler = handler;
}

export function setReachabilityHandler(handler: (reached: boolean) => void) {
  reachabilityHandler = handler;
}

/** A 403 `forbidden` from an admin route: the role may have changed, so /me is read again. */
export function setForbiddenHandler(handler: () => void) {
  forbiddenHandler = handler;
}

const router = supabaseConfigured
  ? createSupabaseRouter(
      createSupabaseBackend({
        device: () => {
          const info = clientInfo();
          return {
            installId: getInstallId(),
            platform: info.platform,
            appVersion: info.appVersion,
            build: info.build === null ? null : String(info.build),
            osVersion: info.osVersion === null ? null : String(info.osVersion),
            country: info.region,
            language: info.language,
          };
        },
        language: () => language,
        region: deviceRegion,
      }),
    )
  : null;

const notConfigured = () =>
  new ApiError({ status: 0, code: 'not_configured', message: 'This build has no Supabase project (EXPO_PUBLIC_SUPABASE_URL is not set)' });

/** The account routes whose 401 means "this session is gone" (sign-in itself answers invalid_credentials). */
const SESSION_PATHS = /^\/v1\/(me|plan|promo|admin)/;

async function request<T>(method: HttpMethod, path: string, options?: ClientRequestOptions): Promise<T> {
  if (!router) throw notConfigured();
  try {
    const result = await router.request<T>(method, path, options);
    reachabilityHandler?.(true);
    return result;
  } catch (e) {
    if (e instanceof ApiError) {
      reachabilityHandler?.(!e.offline);
      const token = getToken();
      if (e.code === 'unauthorized' && SESSION_PATHS.test(path)) authErrorHandler?.({ kind: 'unauthorized', error: e, token, path });
      else if (e.code === 'account_disabled') authErrorHandler?.({ kind: 'disabled', error: e, token, path });
      if (e.code === 'forbidden' && path.startsWith('/v1/admin/')) forbiddenHandler?.();
    }
    throw e;
  }
}

/** The requester of src/api/contract.ts. Rejects with ApiError; a 304 resolves with null. */
export const api: ApiRequester & { request<T>(method: HttpMethod, path: string, options?: ClientRequestOptions): Promise<T> } = {
  request,
};

/** Typed calls for the account, plan and config routes. */
export const endpoints = createEndpoints(api);

export { ApiError, errorKey, fieldErrorKey, isApiError, type ApiErrorCode } from './errors';
