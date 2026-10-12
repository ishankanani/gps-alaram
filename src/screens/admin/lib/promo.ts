// Promo codes (backend-spec 1.1, 2.10, 3.4): code normalization, statuses with their badge tones,
// the "gives" sentence and the create/update request built from the form. Pure.

import type { PaidPlan, PromoCode, PromoCreateRequest, PromoUpdateRequest } from '../../../api/types';
import { daysLabelKey } from './durations';
import { formatDate, formatNumber } from './format';
import type { AdminKey, AdminT } from './text';
import { PLAN_LABEL } from './users';

export const PROMO_CODE_MIN = 4;
export const PROMO_CODE_MAX = 32;
export const PROMO_DESCRIPTION_MAX = 200;
export const PROMO_MAX_REDEMPTIONS = 1_000_000;

/** NFKC, trim, uppercase, whitespace runs to "-", only A–Z 0–9 -, no repeated or edge dashes. */
export function normalizePromoCode(input: string): string {
  return input
    .normalize('NFKC')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '-')
    .replace(/[^A-Z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export type CodeError = 'tooShort' | 'tooLong';

export function checkPromoCode(code: string): CodeError | null {
  if (code.length < PROMO_CODE_MIN) return 'tooShort';
  if (code.length > PROMO_CODE_MAX) return 'tooLong';
  return null;
}

export type PromoStatus = PromoCode['status'];
export type PromoFilter = PromoStatus | 'all';

/** Chips: Active · Scheduled · Used up · Expired · Off · All. */
export const PROMO_FILTERS: readonly PromoFilter[] = ['active', 'scheduled', 'exhausted', 'expired', 'inactive', 'all'];

export const PROMO_STATUS_LABEL: Record<PromoFilter, AdminKey> = {
  active: 'admin.promo.status.active',
  scheduled: 'admin.promo.status.scheduled',
  exhausted: 'admin.promo.status.exhausted',
  expired: 'admin.promo.status.expired',
  inactive: 'admin.promo.status.inactive',
  all: 'admin.promo.status.all',
};

export const PROMO_STATUS_TONE: Record<PromoStatus, 'success' | 'primary' | 'warning' | 'neutral' | 'danger'> = {
  active: 'success',
  scheduled: 'primary',
  exhausted: 'warning',
  expired: 'neutral',
  inactive: 'danger',
};

/** "1 month of Pro", "Lifetime Pro", "45 days of Pro (Yearly)". */
export function describeGift(plan: PaidPlan, durationDays: number | null, t: AdminT): string {
  if (plan === 'lifetime' || durationDays === null) return t('admin.promo.gives.lifetime');
  const { key, params } = daysLabelKey(durationDays);
  const length = t(key, params);
  const expected = (plan === 'monthly' && durationDays < 365) || (plan === 'yearly' && durationDays >= 365);
  return expected
    ? t('admin.promo.gives.days', { length })
    : t('admin.promo.gives.daysPlan', { length, plan: t(PLAN_LABEL[plan]) });
}

/** "2 of 100 used", "2 used". */
export function usageText(code: Pick<PromoCode, 'redemptionCount' | 'maxRedemptions'>, t: AdminT): string {
  return code.maxRedemptions === null
    ? t('admin.promo.usedUnlimited', { count: formatNumber(code.redemptionCount) })
    : t('admin.promo.used', { count: formatNumber(code.redemptionCount), max: formatNumber(code.maxRedemptions) });
}

/** The row subtitle: "1 month of Pro · 2 of 100 used · until 30 Dec". */
export function promoSummary(code: PromoCode, t: AdminT, now: Date = new Date()): string {
  const parts = [describeGift(code.plan, code.durationDays, t), usageText(code, t)];
  if (code.status === 'scheduled' && code.startsAt) parts.push(t('admin.promo.from', { date: formatDate(code.startsAt, { year: 'auto', now }) }));
  else if (code.expiresAt) parts.push(t('admin.promo.until', { date: formatDate(code.expiresAt, { year: 'auto', now }) }));
  return parts.join(' · ');
}

export type PromoForm = {
  /** Empty: the server generates XXXX-XXXX-XXXX. */
  code: string;
  plan: PaidPlan;
  /** Days of Pro per redemption; ignored for lifetime. */
  durationDays: number | null;
  /** Empty means unlimited. */
  maxRedemptions: string;
  startsAt: Date | null;
  expiresAt: Date | null;
  description: string;
  active: boolean;
};

export type PromoFormErrors = Partial<Record<'code' | 'durationDays' | 'maxRedemptions' | 'expiresAt' | 'description', AdminKey>>;

export function parseMaxUses(text: string): number | null | 'invalid' {
  const s = text.replace(/[\s,.’']/g, '');
  if (s === '') return null;
  if (!/^\d+$/.test(s)) return 'invalid';
  const n = Number(s);
  return n >= 1 && n <= PROMO_MAX_REDEMPTIONS ? n : 'invalid';
}

/** Client-side checks before the server's (which stay authoritative). */
export function checkPromoForm(form: PromoForm, existing: PromoCode | null): PromoFormErrors {
  const errors: PromoFormErrors = {};
  if (!existing && form.code) {
    const e = checkPromoCode(normalizePromoCode(form.code));
    if (e) errors.code = e === 'tooShort' ? 'admin.promoNew.error.codeShort' : 'admin.promoNew.error.codeLong';
  }
  if (form.plan !== 'lifetime' && (form.durationDays === null || form.durationDays < 1 || form.durationDays > 3650)) {
    errors.durationDays = 'admin.promoNew.error.days';
  }
  const max = parseMaxUses(form.maxRedemptions);
  if (max === 'invalid') errors.maxRedemptions = 'admin.promoNew.error.maxUses';
  else if (existing && max !== null && max < existing.redemptionCount) errors.maxRedemptions = 'admin.promoNew.error.maxBelowUsed';
  if (form.startsAt && form.expiresAt && form.expiresAt.getTime() <= form.startsAt.getTime()) errors.expiresAt = 'admin.promoNew.error.window';
  if (form.description.length > PROMO_DESCRIPTION_MAX) errors.description = 'admin.promoNew.error.description';
  return errors;
}

/** The POST body (create). */
export function promoCreateBody(form: PromoForm): PromoCreateRequest {
  const max = parseMaxUses(form.maxRedemptions);
  const body: PromoCreateRequest = {
    plan: form.plan,
    maxRedemptions: max === 'invalid' ? null : max,
    startsAt: form.startsAt ? form.startsAt.toISOString() : null,
    expiresAt: form.expiresAt ? form.expiresAt.toISOString() : null,
    description: form.description.trim(),
    active: form.active,
  };
  const code = normalizePromoCode(form.code);
  if (code) body.code = code;
  if (form.plan !== 'lifetime' && form.durationDays !== null) body.durationDays = form.durationDays;
  return body;
}

/** The PATCH body (edit): only what changed; plan and duration are left out once the code was used. */
export function promoUpdateBody(form: PromoForm, existing: PromoCode): PromoUpdateRequest {
  const body: PromoUpdateRequest = {};
  const locked = existing.redemptionCount > 0;
  if (!locked && form.plan !== existing.plan) body.plan = form.plan;
  if (!locked && form.plan !== 'lifetime' && form.durationDays !== existing.durationDays && form.durationDays !== null) {
    body.durationDays = form.durationDays;
  }
  const max = parseMaxUses(form.maxRedemptions);
  const nextMax = max === 'invalid' ? existing.maxRedemptions : max;
  if (nextMax !== existing.maxRedemptions) body.maxRedemptions = nextMax;
  const iso = (d: Date | null) => (d ? d.toISOString() : null);
  const sameTime = (a: string | null, b: Date | null) => (a ? new Date(a).getTime() : null) === (b ? b.getTime() : null);
  if (!sameTime(existing.startsAt, form.startsAt)) body.startsAt = iso(form.startsAt);
  if (!sameTime(existing.expiresAt, form.expiresAt)) body.expiresAt = iso(form.expiresAt);
  if (form.description.trim() !== existing.description) body.description = form.description.trim();
  if (form.active !== existing.active) body.active = form.active;
  return body;
}

/** A form from an existing code (edit) or the defaults (create). */
export function promoFormFrom(code: PromoCode | null): PromoForm {
  if (!code) {
    return { code: '', plan: 'monthly', durationDays: 30, maxRedemptions: '', startsAt: null, expiresAt: null, description: '', active: true };
  }
  return {
    code: code.code,
    plan: code.plan,
    durationDays: code.durationDays,
    maxRedemptions: code.maxRedemptions === null ? '' : String(code.maxRedemptions),
    startsAt: code.startsAt ? new Date(code.startsAt) : null,
    expiresAt: code.expiresAt ? new Date(code.expiresAt) : null,
    description: code.description,
    active: code.active,
  };
}

/** The link testers can open: stopwake://redeem/CODE. */
export function redeemLink(code: string): string {
  return `stopwake://redeem/${encodeURIComponent(code)}`;
}
