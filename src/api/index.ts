/**
 * The StopWake Cloud singletons (backend-spec 7.1 and 7.2): the base URL from EXPO_PUBLIC_API_URL,
 * the client info (X-Client, Accept-Language) and the token from SecureStore.
 *
 * `api` is the seam of src/api/contract.ts: the admin package calls `api.request(...)`. In a build
 * without EXPO_PUBLIC_API_URL `apiConfigured` is false and every request rejects at once, without
 * touching the network; the app works as before, without accounts.
 */
import * as Application from 'expo-application';
import { getLocales } from 'expo-localization';
import { Platform } from 'react-native';

import { deviceLanguage, type Lang } from '../i18n';
import { loadData } from '../lib/storage';
import { createApiClient, type AuthErrorEvent, type ClientInfo, type ClientRequestOptions } from './client';
import type { ApiAvailability, ApiRequester, HttpMethod } from './contract';
import { createEndpoints } from './endpoints';
import { ApiError } from './errors';
import { getToken } from './secure';

/** No trailing slash; empty in a local build. Inlined at build time. */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').trim().replace(/\/+$/, '');

/** False in a build without EXPO_PUBLIC_API_URL: no account features at all. */
export const apiConfigured = API_URL.length > 0;

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

const client = createApiClient({
  baseUrl: API_URL,
  fetch: (input, init) => fetch(input, init),
  getToken,
  clientInfo,
  onAuthError: (event) => authErrorHandler?.(event),
  onReachability: (reached) => reachabilityHandler?.(reached),
});

const notConfigured = () =>
  new ApiError({ status: 0, code: 'not_configured', message: 'This build has no server (EXPO_PUBLIC_API_URL is not set)' });

async function request<T>(method: HttpMethod, path: string, options?: ClientRequestOptions): Promise<T> {
  if (!apiConfigured) throw notConfigured();
  try {
    return await client.request<T>(method, path, options);
  } catch (e) {
    if (e instanceof ApiError && e.status === 403 && e.code === 'forbidden' && path.startsWith('/v1/admin/')) forbiddenHandler?.();
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
