import { describe, expect, it } from 'vitest';

import type { PromoCode } from '../../../api/types';
import {
  checkPromoCode,
  checkPromoForm,
  describeGift,
  normalizePromoCode,
  parseMaxUses,
  promoCreateBody,
  promoFormFrom,
  promoSummary,
  promoUpdateBody,
  redeemLink,
} from '../lib/promo';
import { t } from './t';

const code: PromoCode = {
  id: 1, code: 'WELCOME-2026', plan: 'monthly', durationDays: 30, maxRedemptions: 100, redemptionCount: 2,
  startsAt: null, expiresAt: new Date(2026, 11, 30, 23, 59).toISOString(), active: true, status: 'active',
  description: 'Onboarding emails', createdBy: null, createdAt: '2026-08-12T16:34:41.350Z', updatedAt: '2026-08-12T16:34:41.350Z',
};

describe('promo codes', () => {
  it('normalizes custom codes like the server', () => {
    expect(normalizePromoCode('  spring sale 26 ')).toBe('SPRING-SALE-26');
    expect(normalizePromoCode('--a--b--')).toBe('A-B');
    expect(normalizePromoCode('Früh!ling')).toBe('FRHLING');
    expect(checkPromoCode('ABC')).toBe('tooShort');
    expect(checkPromoCode('A'.repeat(33))).toBe('tooLong');
    expect(checkPromoCode('ABCD')).toBeNull();
  });

  it('describes what a code gives', () => {
    expect(describeGift('monthly', 30, t)).toBe('1 month of Pro');
    expect(describeGift('yearly', 365, t)).toBe('1 year of Pro');
    expect(describeGift('yearly', 45, t)).toBe('45 days of Pro (Yearly)');
    expect(describeGift('lifetime', null, t)).toBe('Lifetime Pro');
    expect(promoSummary(code, t, new Date(2026, 9, 11))).toBe('1 month of Pro · 2 of 100 used · until 30 Dec');
  });

  it('reads max uses', () => {
    expect(parseMaxUses('')).toBeNull();
    expect(parseMaxUses('500')).toBe(500);
    expect(parseMaxUses('1,000')).toBe(1000);
    expect(parseMaxUses('0')).toBe('invalid');
    expect(parseMaxUses('2000000')).toBe('invalid');
  });

  it('builds the create body (the server generates the code when empty)', () => {
    const form = { ...promoFormFrom(null), maxRedemptions: '500', description: ' Press ' };
    expect(promoCreateBody(form)).toEqual({
      plan: 'monthly', durationDays: 30, maxRedemptions: 500, startsAt: null, expiresAt: null, description: 'Press', active: true,
    });
    expect(promoCreateBody({ ...form, code: 'spring 26' }).code).toBe('SPRING-26');
    expect(promoCreateBody({ ...form, plan: 'lifetime', durationDays: null }).durationDays).toBeUndefined();
  });

  it('sends only changes on edit, never plan or length once redeemed', () => {
    const form = promoFormFrom(code);
    expect(promoUpdateBody(form, code)).toEqual({});
    expect(promoUpdateBody({ ...form, active: false, plan: 'yearly', durationDays: 365 }, code)).toEqual({ active: false });
    const unused = { ...code, redemptionCount: 0 };
    expect(promoUpdateBody({ ...promoFormFrom(unused), plan: 'yearly', durationDays: 365 }, unused)).toEqual({ plan: 'yearly', durationDays: 365 });
    expect(promoUpdateBody({ ...form, expiresAt: null, maxRedemptions: '' }, code)).toEqual({ expiresAt: null, maxRedemptions: null });
  });

  it('checks the form', () => {
    expect(checkPromoForm(promoFormFrom(null), null)).toEqual({});
    expect(checkPromoForm({ ...promoFormFrom(null), code: 'ab' }, null).code).toBe('admin.promoNew.error.codeShort');
    expect(checkPromoForm({ ...promoFormFrom(code), maxRedemptions: '1' }, code).maxRedemptions).toBe('admin.promoNew.error.maxBelowUsed');
    expect(
      checkPromoForm({ ...promoFormFrom(null), startsAt: new Date(2026, 10, 1), expiresAt: new Date(2026, 9, 1) }, null).expiresAt,
    ).toBe('admin.promoNew.error.window');
    expect(redeemLink('A B')).toBe('stopwake://redeem/A%20B');
  });
});
