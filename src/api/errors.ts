/**
 * Errors from StopWake Cloud (backend-spec 2.3 and 7.1). Pure: no react-native import, so the
 * client and its Vitest tests can use it.
 */
import type { ApiErrorBody, ErrorCode, FieldError } from './types';

/** Server codes plus the three failures that never reached (or never came back from) the server. */
export type ApiErrorCode = ErrorCode | 'network' | 'timeout' | 'bad_response';

export type ApiErrorInit = {
  /** HTTP status; 0 when there was no answer. */
  status: number;
  code: ApiErrorCode;
  /** English, for logs and admin screens. The app shows its own text (errorKey). */
  message: string;
  fields?: Record<string, FieldError>;
  retryAfterSeconds?: number;
  details?: Record<string, unknown>;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly fields?: Record<string, FieldError>;
  readonly retryAfterSeconds?: number;
  readonly details?: Record<string, unknown>;

  constructor(init: ApiErrorInit) {
    super(init.message);
    this.name = 'ApiError';
    this.status = init.status;
    this.code = init.code;
    if (init.fields) this.fields = init.fields;
    if (init.retryAfterSeconds != null) this.retryAfterSeconds = init.retryAfterSeconds;
    if (init.details) this.details = init.details;
  }

  /** No answer from the server: offline, DNS, refused, timed out. */
  get offline(): boolean {
    return this.code === 'network' || this.code === 'timeout';
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

/** Every code the server may send (2.2). Unknown codes from a newer server become bad_response. */
export const ERROR_CODES: readonly ErrorCode[] = [
  'bad_request', 'validation_failed', 'unsupported_media_type', 'payload_too_large',
  'unauthorized', 'invalid_credentials', 'reauth_required',
  'forbidden', 'account_disabled', 'signup_disabled', 'redeem_disabled',
  'not_found', 'method_not_allowed',
  'email_taken', 'already_signed_up', 'not_an_account', 'subscription_active', 'last_admin',
  'cannot_target_self', 'confirm_mismatch', 'already_revoked', 'already_lifetime',
  'promo_invalid', 'promo_expired', 'promo_exhausted', 'promo_already_redeemed',
  'code_taken', 'promo_in_use', 'invalid_reset_code',
  'rate_limited', 'mail_unavailable', 'not_configured', 'unavailable', 'internal',
  'email_not_confirmed', 'confirmation_sent',
];

export const FIELD_ERRORS: readonly FieldError[] = [
  'required', 'invalid', 'invalid_email', 'too_short', 'too_long', 'too_common', 'same_as_email',
  'out_of_range', 'invalid_date', 'in_past', 'unknown_key', 'not_allowed',
];

/** The i18n key of an error's user-facing text: `errors.<code>` (src/i18n/en/errors.ts). */
export function errorKey(code: ApiErrorCode): `errors.${ApiErrorCode}` {
  return `errors.${code}`;
}

/** The i18n key of a field error: `errors.field.<error>`. */
export function fieldErrorKey(error: FieldError): `errors.field.${FieldError}` {
  return `errors.field.${error}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Seconds from a Retry-After header (seconds or an HTTP date). */
export function parseRetryAfter(header: string | null | undefined, now = Date.now()): number | undefined {
  if (!header) return undefined;
  const trimmed = header.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const at = Date.parse(trimmed);
  if (Number.isNaN(at)) return undefined;
  return Math.max(0, Math.ceil((at - now) / 1000));
}

/**
 * Builds the ApiError for a non-2xx answer. `body` is the parsed JSON (or undefined when the body
 * was not JSON, e.g. a proxy's HTML error page).
 */
export function errorFromResponse(status: number, body: unknown, retryAfterHeader?: string | null): ApiError {
  const error = isRecord(body) && isRecord((body as Partial<ApiErrorBody>).error) ? (body as { error: Record<string, unknown> }).error : null;
  const code = error && typeof error.code === 'string' ? error.code : null;
  if (!error || !code || !(ERROR_CODES as readonly string[]).includes(code)) {
    // A gateway in front of the server (Fly, Cloudflare) answering for it.
    const gateway = status === 502 || status === 503 || status === 504;
    return new ApiError({
      status,
      code: gateway ? 'unavailable' : 'bad_response',
      message: code ? `Unknown error code ${code} (HTTP ${status})` : `Unexpected answer (HTTP ${status})`,
      retryAfterSeconds: parseRetryAfter(retryAfterHeader),
    });
  }
  let fields: Record<string, FieldError> | undefined;
  if (isRecord(error.fields)) {
    fields = {};
    for (const [name, value] of Object.entries(error.fields)) {
      fields[name] = typeof value === 'string' && (FIELD_ERRORS as readonly string[]).includes(value) ? (value as FieldError) : 'invalid';
    }
  }
  const bodyRetry = typeof error.retryAfterSeconds === 'number' && Number.isFinite(error.retryAfterSeconds) ? error.retryAfterSeconds : undefined;
  return new ApiError({
    status,
    code: code as ErrorCode,
    message: typeof error.message === 'string' ? error.message : code,
    fields,
    retryAfterSeconds: bodyRetry ?? parseRetryAfter(retryAfterHeader),
    details: isRecord(error.details) ? error.details : undefined,
  });
}
