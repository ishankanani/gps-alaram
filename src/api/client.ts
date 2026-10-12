/**
 * The HTTP client for StopWake Cloud (backend-spec 7.1). Pure: fetch, the token and the client
 * info are injected, so Vitest runs it with a mock fetch.
 *
 * - Headers: Authorization (when there is a token), X-Client, Accept-Language, Content-Type.
 * - Aborts after `timeoutMs` (10 s; callers pass 20 s for sign-in, sign-up and reset).
 * - Retries only GETs, twice (after 1 s and 3 s), when there was no answer or a 5xx.
 * - 401 unauthorized / reauth_required and 403 account_disabled call onAuthError.
 * - 204 resolves with undefined, 304 with null. Anything that is not JSON is `bad_response`.
 */
import type { ApiRequester, HttpMethod, QueryValue, RequestOptions } from './contract';
import { ApiError, errorFromResponse } from './errors';

export type ClientInfo = {
  platform: 'android' | 'ios';
  /** x.y.z (app.json version). */
  appVersion: string;
  /** Android versionCode; null when unknown. */
  build: string | number | null;
  /** Platform.Version; null when unknown. */
  osVersion: string | number | null;
  /** The app language (an ApiLang). */
  language: string;
  /** The phone's region (ISO 3166 alpha-2), if known. */
  region: string | null;
};

export type AuthErrorKind = 'unauthorized' | 'reauth_required' | 'disabled';

export type AuthErrorEvent = {
  kind: AuthErrorKind;
  error: ApiError;
  /** The token the failed request carried (null without one): stale answers can be ignored. */
  token: string | null;
  path: string;
};

export type ClientRequestOptions = RequestOptions & {
  /** Send this token instead of getToken()'s; null sends none. */
  token?: string | null;
  /** Retry a GET (default true). */
  retry?: boolean;
};

export type ApiClientOptions = {
  baseUrl: string;
  fetch: typeof fetch;
  getToken: () => string | null;
  clientInfo: () => ClientInfo;
  onAuthError?: (event: AuthErrorEvent) => void;
  /** Every answer (for the store's "online" state): true when the server answered at all. */
  onReachability?: (reached: boolean) => void;
  timeoutMs?: number;
  /** Delays before the GET retries. */
  retryDelaysMs?: readonly number[];
  sleep?: (ms: number) => Promise<void>;
};

export type ApiClient = ApiRequester & {
  request<T>(method: HttpMethod, path: string, options?: ClientRequestOptions): Promise<T>;
};

const VERSION_RE = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/;
const OS_RE = /^[0-9A-Za-z._-]{1,20}$/;

/** `android/1.0.0/12/14` (2.1). Anything that would not match the server's pattern becomes '-'. */
export function buildXClient(info: Pick<ClientInfo, 'platform' | 'appVersion' | 'build' | 'osVersion'>): string {
  const parts = String(info.appVersion ?? '').split('.');
  while (parts.length < 3) parts.push('0');
  const candidate = parts.slice(0, 3).map((p) => String(Number.parseInt(p, 10) || 0)).join('.');
  const version = VERSION_RE.test(candidate) ? candidate : '0.0.0';
  const build = info.build != null && /^\d{1,9}$/.test(String(info.build)) ? String(info.build) : '-';
  const os = info.osVersion != null && OS_RE.test(String(info.osVersion)) ? String(info.osVersion) : '-';
  return `${info.platform}/${version}/${build}/${os}`;
}

/** `en-DE`, `hi-IN`, `nb` (2.1). */
export function buildAcceptLanguage(language: string, region: string | null): string {
  const lang = /^[a-z]{2}$/.test(language) ? language : 'en';
  return region && /^[A-Za-z]{2}$/.test(region) ? `${lang}-${region.toUpperCase()}` : lang;
}

/** `?a=1&b=x`; null and undefined values are left out. */
export function buildQuery(query: Record<string, QueryValue> | undefined): string {
  if (!query) return '';
  const parts: string[] = [];
  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined) continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createApiClient(options: ApiClientOptions): ApiClient {
  const {
    baseUrl,
    fetch: doFetch,
    getToken,
    clientInfo,
    onAuthError,
    onReachability,
    timeoutMs: defaultTimeout = 10_000,
    retryDelaysMs = [1000, 3000],
    sleep = defaultSleep,
  } = options;
  const base = baseUrl.replace(/\/+$/, '');

  async function once<T>(method: HttpMethod, path: string, opts: ClientRequestOptions, token: string | null): Promise<T> {
    const info = clientInfo();
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'X-Client': buildXClient(info),
      'Accept-Language': buildAcceptLanguage(info.language, info.region),
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    const hasBody = opts.body !== undefined;
    if (hasBody) headers['Content-Type'] = 'application/json';
    Object.assign(headers, opts.headers);

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, opts.timeoutMs ?? defaultTimeout);
    const outer = opts.signal;
    const forward = () => controller.abort();
    if (outer) {
      if (outer.aborted) controller.abort();
      else outer.addEventListener('abort', forward);
    }

    let response: Response;
    try {
      response = await doFetch(`${base}${path}${buildQuery(opts.query)}`, {
        method,
        headers,
        body: hasBody ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
      });
    } catch (e) {
      onReachability?.(false);
      if (timedOut) throw new ApiError({ status: 0, code: 'timeout', message: `No answer within ${opts.timeoutMs ?? defaultTimeout} ms` });
      throw new ApiError({ status: 0, code: 'network', message: e instanceof Error && e.message ? e.message : 'Network request failed' });
    } finally {
      clearTimeout(timer);
      outer?.removeEventListener('abort', forward);
    }
    onReachability?.(true);

    if (response.status === 204) return undefined as T;
    if (response.status === 304) return null as T;

    let text = '';
    try {
      text = await response.text();
    } catch {
      throw new ApiError({ status: response.status, code: 'network', message: 'The answer was cut off' });
    }
    let parsed: unknown;
    let isJson = false;
    if (text.trim() !== '') {
      try {
        parsed = JSON.parse(text);
        isJson = true;
      } catch {
        isJson = false;
      }
    }

    if (response.ok) {
      if (text.trim() === '') return undefined as T;
      if (!isJson) throw new ApiError({ status: response.status, code: 'bad_response', message: 'The answer was not JSON' });
      return parsed as T;
    }

    const error = errorFromResponse(response.status, isJson ? parsed : undefined, response.headers.get('Retry-After'));
    if (onAuthError) {
      const event = (kind: AuthErrorKind): AuthErrorEvent => ({ kind, error, token, path });
      if (error.status === 401 && error.code === 'unauthorized') onAuthError(event('unauthorized'));
      else if (error.status === 401 && error.code === 'reauth_required') onAuthError(event('reauth_required'));
      else if (error.status === 403 && error.code === 'account_disabled') onAuthError(event('disabled'));
    }
    throw error;
  }

  async function request<T>(method: HttpMethod, path: string, opts: ClientRequestOptions = {}): Promise<T> {
    const token = opts.token !== undefined ? opts.token : getToken();
    const retries = method === 'GET' && opts.retry !== false ? retryDelaysMs : [];
    for (let attempt = 0; ; attempt++) {
      try {
        return await once<T>(method, path, opts, token);
      } catch (e) {
        const retryable =
          e instanceof ApiError && (e.code === 'network' || e.code === 'timeout' || (e.status >= 500 && e.status !== 501));
        if (!retryable || attempt >= retries.length || opts.signal?.aborted) throw e;
        await sleep(retries[attempt]);
      }
    }
  }

  return { request };
}
