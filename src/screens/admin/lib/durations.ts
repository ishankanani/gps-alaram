// Duration presets for Give Pro, Change plan, Add time and promo codes (backend-spec 2.10 grant
// rules: 1–3650 days, an end date more than 1 h and at most 10 years ahead). Months and years are
// calendar months from the start date, so "1 month" from 11 Oct ends on 11 Nov. Pure.

import type { PaidPlan } from '../../../api/types';
import { DAY, HOUR } from './format';
import type { AdminKey } from './text';

export type DurationPreset = '7d' | '1m' | '3m' | '6m' | '1y' | 'lifetime' | 'custom';

/** Give Pro (backend-spec 7.7): 1 month, 3 months, 6 months, 1 year, Lifetime, Custom date. */
export const GRANT_PRESETS: readonly DurationPreset[] = ['1m', '3m', '6m', '1y', 'lifetime', 'custom'];
/** Change plan to Monthly or Yearly: the same without Lifetime (a plan of its own there). */
export const PLAN_PRESETS: readonly DurationPreset[] = ['1m', '3m', '6m', '1y', 'custom'];
/** Add time to a gift. */
export const EXTEND_PRESETS: readonly DurationPreset[] = ['7d', '1m', '3m', '6m', '1y', 'custom'];
/** Promo codes give a fixed number of days from the redemption. */
export const PROMO_PRESETS: readonly DurationPreset[] = ['7d', '1m', '3m', '6m', '1y', 'custom'];

export const PRESET_LABEL: Record<DurationPreset, AdminKey> = {
  '7d': 'admin.duration.7d',
  '1m': 'admin.duration.1m',
  '3m': 'admin.duration.3m',
  '6m': 'admin.duration.6m',
  '1y': 'admin.duration.1y',
  lifetime: 'admin.duration.lifetime',
  custom: 'admin.duration.custom',
};

export const EXTEND_LABEL: Record<DurationPreset, AdminKey> = {
  '7d': 'admin.extend.7d',
  '1m': 'admin.extend.1m',
  '3m': 'admin.extend.3m',
  '6m': 'admin.extend.6m',
  '1y': 'admin.extend.1y',
  lifetime: 'admin.duration.lifetime',
  custom: 'admin.extend.custom',
};

/** Days a promo preset gives (a code has no start date: it counts from each redemption). */
export const PROMO_PRESET_DAYS: Partial<Record<DurationPreset, number>> = { '7d': 7, '1m': 30, '3m': 90, '6m': 180, '1y': 365 };

export const MAX_GRANT_DAYS = 3650;
/** The server refuses an end date less than this far ahead. */
export const MIN_AHEAD_MS = HOUR;

/** `date` plus `months` calendar months, keeping the time; the day is clamped (31 Jan + 1 → 28 Feb). */
export function addCalendarMonths(date: Date, months: number): Date {
  const target = new Date(date.getTime());
  const day = target.getDate();
  target.setDate(1);
  target.setMonth(target.getMonth() + months);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, last));
  return target;
}

/** The end of a preset counted from `from`; null for lifetime and custom. */
export function presetEnd(preset: DurationPreset, from: Date): Date | null {
  switch (preset) {
    case '7d':
      return new Date(from.getTime() + 7 * DAY);
    case '1m':
      return addCalendarMonths(from, 1);
    case '3m':
      return addCalendarMonths(from, 3);
    case '6m':
      return addCalendarMonths(from, 6);
    case '1y':
      return addCalendarMonths(from, 12);
    default:
      return null;
  }
}

/** Whole days from `from` to `to`, rounded (daylight-saving hours do not count as a day). */
export function wholeDays(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / DAY);
}

/** The preset as a number of days from `from` (what durationDays and extend's days take). */
export function presetDays(preset: DurationPreset, from: Date): number | null {
  const end = presetEnd(preset, from);
  return end ? wholeDays(from, end) : null;
}

/** The plan a duration suggests: a year or more is Yearly, Lifetime is Lifetime, the rest Monthly. */
export function planForPreset(preset: DurationPreset, customDays?: number | null): PaidPlan {
  if (preset === 'lifetime') return 'lifetime';
  if (preset === '1y') return 'yearly';
  if (preset === 'custom' && customDays != null && customDays >= 365) return 'yearly';
  return 'monthly';
}

/** The last minute of a chosen calendar day (a gift "until 31 Dec" lasts through that day). */
export function endOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 0, 0);
}

export type EndError = 'required' | 'tooSoon' | 'tooFar';

/** Checks a custom end date against the grant rules. */
export function checkCustomEnd(end: Date | null, now: Date, maxAheadDays = MAX_GRANT_DAYS): EndError | null {
  if (!end) return 'required';
  if (end.getTime() <= now.getTime() + MIN_AHEAD_MS) return 'tooSoon';
  if (end.getTime() > now.getTime() + maxAheadDays * DAY) return 'tooFar';
  return null;
}

export const END_ERROR_TEXT: Record<EndError, AdminKey> = {
  required: 'admin.duration.error.required',
  tooSoon: 'admin.duration.error.tooSoon',
  tooFar: 'admin.duration.error.tooFar',
};

/** A preset that matches a number of promo days, or custom. */
export function promoPresetFor(days: number | null): DurationPreset {
  if (days === null) return 'lifetime';
  const found = (Object.keys(PROMO_PRESET_DAYS) as DurationPreset[]).find((p) => PROMO_PRESET_DAYS[p] === days);
  return found ?? 'custom';
}

/** "1 month", "3 months", "1 year", "45 days" for a number of days. */
export function daysLabelKey(days: number): { key: AdminKey; params?: Record<string, number> } {
  if (days === 7) return { key: 'admin.duration.7d' };
  if (days === 30 || days === 31) return { key: 'admin.duration.1m' };
  if (days >= 89 && days <= 92) return { key: 'admin.duration.3m' };
  if (days >= 180 && days <= 184) return { key: 'admin.duration.6m' };
  if (days === 365 || days === 366) return { key: 'admin.duration.1y' };
  if (days === 1) return { key: 'admin.duration.oneDay' };
  return { key: 'admin.duration.days', params: { count: days } };
}
