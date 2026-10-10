/**
 * API errors (spec 2.3). The body is always ApiErrorBody; the app maps `code` to its own text and
 * shows `message` only on admin screens, so messages are plain English and never contain secrets.
 */
import type { ApiErrorBody, ErrorCode, FieldError } from '../../../src/api/types.ts';

export type ApiErrorExtra = {
  fields?: Record<string, FieldError>;
  details?: Record<string, unknown>;
  retryAfterSeconds?: number;
  headers?: Record<string, string>;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly fields: Record<string, FieldError> | undefined;
  readonly details: Record<string, unknown> | undefined;
  readonly retryAfterSeconds: number | undefined;
  readonly headers: Record<string, string> | undefined;

  constructor(status: number, code: ErrorCode, message: string, extra: ApiErrorExtra = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = extra.fields;
    this.details = extra.details;
    this.retryAfterSeconds = extra.retryAfterSeconds;
    this.headers = extra.headers;
  }

  toBody(): ApiErrorBody {
    const error: ApiErrorBody['error'] = { code: this.code, message: this.message };
    if (this.fields) error.fields = this.fields;
    if (this.retryAfterSeconds !== undefined) error.retryAfterSeconds = this.retryAfterSeconds;
    if (this.details) error.details = this.details;
    return { error };
  }
}

export const badRequest = (message = 'Malformed request'): ApiError => new ApiError(400, 'bad_request', message);

export const validationFailed = (fields: Record<string, FieldError>): ApiError =>
  new ApiError(400, 'validation_failed', `Invalid fields: ${Object.keys(fields).join(', ')}`, { fields });

export const unauthorized = (): ApiError => new ApiError(401, 'unauthorized', 'Missing, unknown or expired session');

export const invalidCredentials = (): ApiError => new ApiError(401, 'invalid_credentials', 'Wrong email or password');

export const forbidden = (): ApiError => new ApiError(403, 'forbidden', 'Not allowed');

export const notFound = (): ApiError => new ApiError(404, 'not_found', 'Not found');

export const accountDisabled = (publicId: string, supportEmail: string): ApiError =>
  new ApiError(403, 'account_disabled', 'This account is disabled', { details: { publicId, supportEmail } });

export const unavailable = (message = 'Temporarily unavailable, try again'): ApiError => new ApiError(503, 'unavailable', message);
