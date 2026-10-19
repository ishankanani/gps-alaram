import { describe, expect, it } from 'vitest';

import { fromAuthError, fromPostgrestError } from '../errors';

describe('fromPostgrestError', () => {
  it('reads our RPC errors: code, status, fields and details', () => {
    const e = fromPostgrestError({
      code: 'P0001',
      message: 'validation_failed',
      details: '{"message":"Some fields are invalid","fields":{"reason":"required","x":"weird"}}',
      hint: '400',
    });
    expect(e.code).toBe('validation_failed');
    expect(e.status).toBe(400);
    expect(e.fields).toEqual({ reason: 'required', x: 'invalid' });
    expect(e.message).toBe('Some fields are invalid');
  });

  it('keeps account_disabled details', () => {
    const e = fromPostgrestError({ code: 'P0001', message: 'account_disabled', details: '{"details":{"publicId":"SW-AAAA-BBBB"}}', hint: '403' });
    expect(e.status).toBe(403);
    expect(e.details).toEqual({ publicId: 'SW-AAAA-BBBB' });
  });

  it('maps Postgres and PostgREST failures', () => {
    expect(fromPostgrestError({ code: '42501', message: 'permission denied for function admin_users' }).code).toBe('forbidden');
    expect(fromPostgrestError({ code: 'PGRST301', message: 'JWT expired' }).code).toBe('unauthorized');
    expect(fromPostgrestError({ message: 'TypeError: Network request failed' }).code).toBe('network');
    expect(fromPostgrestError({ code: 'P0001', message: 'not a code' }).code).toBe('internal');
  });
});

describe('fromAuthError', () => {
  it('maps Supabase Auth codes to the screens’ codes', () => {
    expect(fromAuthError({ code: 'invalid_credentials', status: 400, message: 'Invalid login credentials' }).code).toBe('invalid_credentials');
    expect(fromAuthError({ code: 'email_not_confirmed', status: 400 }).code).toBe('email_not_confirmed');
    expect(fromAuthError({ code: 'user_already_exists', status: 422 }).code).toBe('email_taken');
    expect(fromAuthError({ code: 'otp_expired', status: 403 }).code).toBe('invalid_reset_code');
    expect(fromAuthError({ code: 'over_email_send_rate_limit', status: 429 }).code).toBe('rate_limited');
    expect(fromAuthError({ name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' }).code).toBe('network');
    expect(fromAuthError({ code: 'unexpected_failure', status: 500, message: 'Database error saving new user' }).code).toBe('signup_disabled');
  });

  it('puts weak passwords on the form’s password field', () => {
    const e = fromAuthError({ code: 'weak_password', status: 422, weak_password: { reasons: ['length'] } }, 'newPassword');
    expect(e.code).toBe('validation_failed');
    expect(e.fields).toEqual({ newPassword: 'too_short' });
  });
});
