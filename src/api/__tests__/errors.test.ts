import { describe, expect, it } from 'vitest';

import { en } from '../../i18n/en';
import { ApiError, ERROR_CODES, errorFromResponse, errorKey, fieldErrorKey } from '../errors';
import type { FieldError } from '../types';

const FIELD_ERRORS: FieldError[] = [
  'required', 'invalid', 'invalid_email', 'too_short', 'too_long', 'too_common', 'same_as_email',
  'out_of_range', 'invalid_date', 'in_past', 'unknown_key', 'not_allowed',
];

describe('error copy', () => {
  it('has English text for every server code, network, timeout and bad_response', () => {
    for (const code of [...ERROR_CODES, 'network', 'timeout', 'bad_response'] as const) {
      expect(en[errorKey(code) as keyof typeof en], code).toBeTruthy();
    }
  });

  it('has English text for every field error', () => {
    for (const error of FIELD_ERRORS) expect(en[fieldErrorKey(error) as keyof typeof en], error).toBeTruthy();
  });
});

describe('errorFromResponse', () => {
  it('keeps details and maps unknown field errors to invalid', () => {
    const e = errorFromResponse(403, {
      error: { code: 'account_disabled', message: 'Disabled', details: { publicId: 'SW-7K3P-92QX', supportEmail: 's@example.com' } },
    });
    expect(e).toBeInstanceOf(ApiError);
    expect(e).toMatchObject({ status: 403, code: 'account_disabled', details: { publicId: 'SW-7K3P-92QX' } });
    expect(e.offline).toBe(false);
  });

  it('treats a body without the contract shape as bad_response', () => {
    expect(errorFromResponse(400, { message: 'nope' }).code).toBe('bad_response');
    expect(errorFromResponse(400, undefined).code).toBe('bad_response');
    expect(errorFromResponse(503, undefined).code).toBe('unavailable');
  });
});
