// The seam between the account package (which implements the HTTP client in client.ts, the
// singletons in index.ts and the account store in account.ts) and the admin package (which only
// calls it). Owned by the lead: change it only with a note in your report.

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export type QueryValue = string | number | boolean | null | undefined;

export type RequestOptions = {
  /** JSON body (sent with Content-Type: application/json). */
  body?: unknown;
  /** Query string; null and undefined values are left out. */
  query?: Record<string, QueryValue>;
  /** Defaults to 10 s (20 s for sign-in, sign-up and reset). */
  timeoutMs?: number;
  signal?: AbortSignal;
  /** e.g. If-None-Match. */
  headers?: Record<string, string>;
};

/**
 * `src/api/index.ts` exports `api: ApiRequester`. Paths start with `/v1/`. A non-2xx answer, a
 * timeout or a network failure rejects with `ApiError` from `src/api/errors.ts`
 * (`{ status, code, message, fields?, retryAfterSeconds?, details? }`; code `network`, `timeout`
 * or `bad_response` for failures without a server answer). A 304 resolves with `null`.
 */
export interface ApiRequester {
  request<T>(method: HttpMethod, path: string, options?: RequestOptions): Promise<T>;
}

/**
 * Also from `src/api/index.ts`: false in a build without `EXPO_PUBLIC_API_URL` (no account
 * features at all; the Account tab says "This build works without an account").
 */
export type ApiAvailability = { apiConfigured: boolean };

/**
 * From `src/api/account.ts`, for the admin area: `reauthenticate(password)` signs in again with
 * the current account's email (spec 7.7, "Confirm it's you" after 401 `reauth_required`) and
 * resolves once the new session is stored; it rejects with ApiError (e.g. `invalid_credentials`).
 */
export type Reauthenticate = (password: string) => Promise<void>;
