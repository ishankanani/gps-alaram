/**
 * Supabase failures as the app's ApiError (src/api/errors.ts). Pure: Vitest checks it.
 *
 * - Our RPCs raise with MESSAGE = an ErrorCode, DETAIL = JSON { message, fields?, details? } and
 *   HINT = an HTTP-like status (supabase/migrations/…_schema.sql, public.api_error()).
 * - PostgREST and Postgres errors (permission denied, expired JWT) and Supabase Auth errors are
 *   mapped to the nearest code the screens already know.
 */
import { ApiError, ERROR_CODES, FIELD_ERRORS } from '../errors';
import type { ErrorCode, FieldError } from '../types';

type Rec = Record<string, unknown>;
const isRecord = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);

/** A PostgREST error object ({ code, message, details, hint }) or anything thrown. */
export function fromPostgrestError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  const e = isRecord(error) ? error : {};
  const code = typeof e.code === 'string' ? e.code : '';
  const message = typeof e.message === 'string' ? e.message : String(error);

  if (code === 'P0001' && (ERROR_CODES as readonly string[]).includes(message)) {
    let extra: Rec = {};
    try {
      const parsed = typeof e.details === 'string' && e.details ? (JSON.parse(e.details) as unknown) : null;
      if (isRecord(parsed)) extra = parsed;
    } catch {
      // A plain-text detail: keep only the code.
    }
    const status = Number.parseInt(typeof e.hint === 'string' ? e.hint : '', 10);
    let fields: Record<string, FieldError> | undefined;
    if (isRecord(extra.fields)) {
      fields = {};
      for (const [name, value] of Object.entries(extra.fields)) {
        fields[name] = typeof value === 'string' && (FIELD_ERRORS as readonly string[]).includes(value) ? (value as FieldError) : 'invalid';
      }
    }
    return new ApiError({
      status: Number.isFinite(status) ? status : 400,
      code: message as ErrorCode,
      message: typeof extra.message === 'string' ? extra.message : message,
      fields,
      details: isRecord(extra.details) ? extra.details : undefined,
    });
  }
  // Postgres: insufficient_privilege (an RPC an anon or non-admin may not call).
  if (code === '42501') return new ApiError({ status: 403, code: 'forbidden', message });
  // PostgREST: JWT expired / invalid.
  if (code === 'PGRST301' || code === 'PGRST302' || /jwt/i.test(message)) return new ApiError({ status: 401, code: 'unauthorized', message });
  if (code === 'PGRST202') return new ApiError({ status: 404, code: 'not_configured', message: 'The Supabase migrations are not installed' });
  if (!code && /network|fetch|load failed|timed? ?out|abort/i.test(message)) {
    return new ApiError({ status: 0, code: /time|abort/i.test(message) ? 'timeout' : 'network', message });
  }
  return new ApiError({ status: 500, code: 'internal', message: message || 'Unknown error' });
}

/** A Supabase Auth error (AuthApiError, AuthRetryableFetchError, …). `field` names the password field of the form. */
export function fromAuthError(error: unknown, passwordField = 'password'): ApiError {
  if (error instanceof ApiError) return error;
  const e = isRecord(error) ? error : {};
  const code = typeof e.code === 'string' ? e.code : '';
  const name = typeof e.name === 'string' ? e.name : '';
  const status = typeof e.status === 'number' ? e.status : 0;
  const message = typeof e.message === 'string' ? e.message : String(error);
  const make = (c: ErrorCode | 'network', s: number, fields?: Record<string, FieldError>) =>
    new ApiError({ status: s, code: c, message, fields });

  if (name === 'AuthRetryableFetchError' || (status === 0 && /fetch|network/i.test(message))) return make('network', 0);
  switch (code) {
    case 'invalid_credentials':
      return make('invalid_credentials', 400);
    case 'email_not_confirmed':
      return make('email_not_confirmed', 400);
    case 'user_already_exists':
    case 'email_exists':
    case 'identity_already_exists':
      return make('email_taken', 409);
    case 'weak_password': {
      const reasons = isRecord(e.weak_password) && Array.isArray(e.weak_password.reasons) ? e.weak_password.reasons : [];
      return make('validation_failed', 400, { [passwordField]: reasons.includes('length') ? 'too_short' : 'too_common' });
    }
    case 'same_password':
      return make('validation_failed', 400, { [passwordField]: 'invalid' });
    case 'email_address_invalid':
    case 'email_address_not_authorized':
      return make('validation_failed', 400, { email: 'invalid_email' });
    case 'otp_expired':
    case 'otp_disabled':
      return make('invalid_reset_code', 400);
    case 'signup_disabled':
    case 'email_provider_disabled':
      return make('signup_disabled', 403);
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
    case 'over_sms_send_rate_limit':
      return make('rate_limited', 429);
    case 'user_banned':
      return make('account_disabled', 403);
    case 'session_not_found':
    case 'session_expired':
    case 'refresh_token_not_found':
    case 'bad_jwt':
      return make('unauthorized', 401);
    case 'reauthentication_needed':
      return make('reauth_required', 401);
    case 'unexpected_failure':
      // Our sign-up trigger refuses new users while auth.signUpEnabled is false.
      if (/database error saving new user/i.test(message)) return make('signup_disabled', 403);
      break;
    default:
      break;
  }
  if (status === 429) return make('rate_limited', 429);
  if (/token has expired or is invalid/i.test(message)) return make('invalid_reset_code', 400);
  if (/invalid login credentials/i.test(message)) return make('invalid_credentials', 400);
  if (/email not confirmed/i.test(message)) return make('email_not_confirmed', 400);
  return make(status >= 500 || status === 0 ? 'unavailable' : 'bad_request', status);
}
