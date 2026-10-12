// Dates, times, counts and money for the admin screens, in fixed en-GB formats ("10 Nov 2026",
// "14:02") without Intl, so the device, the CI emulator and Vitest all print the same. Times are in
// the phone's time zone. Pure.

import { formatCount } from '../../../lib/format';
import { CURRENCY_FORMATS, formatPrice, type PriceFormat } from '../../../lib/pricing';
import type { AdminT } from './text';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export type DateInput = string | number | Date | null | undefined;

/** A Date, or null for null, undefined and unparseable input. */
export function toDate(input: DateInput): Date | null {
  if (input === null || input === undefined || input === '') return null;
  const d = input instanceof Date ? input : new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * "10 Nov 2026"; with `weekday` "Tue, 10 Nov 2026". `year: 'auto'` leaves the year out when it is
 * the current one ("10 Nov").
 */
export function formatDate(
  input: DateInput,
  options: { weekday?: boolean; year?: 'always' | 'auto'; now?: Date } = {},
): string {
  const d = toDate(input);
  if (!d) return '—';
  const now = options.now ?? new Date();
  const showYear = options.year !== 'auto' || d.getFullYear() !== now.getFullYear();
  const day = `${d.getDate()} ${MONTHS[d.getMonth()]}${showYear ? ` ${d.getFullYear()}` : ''}`;
  return options.weekday ? `${WEEKDAYS[d.getDay()]}, ${day}` : day;
}

/** "14:02" (24-hour clock, as en-GB). */
export function formatTime(input: DateInput): string {
  const d = toDate(input);
  return d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : '—';
}

/** "10 Oct, 14:02" this year, "10 Oct 2025, 14:02" otherwise. */
export function formatDateTime(input: DateInput, now: Date = new Date()): string {
  const d = toDate(input);
  if (!d) return '—';
  return `${formatDate(d, { year: 'auto', now })}, ${formatTime(d)}`;
}

/** "Sat, 10 Oct 2026, 14:02:09" for detail sheets. */
export function formatFullDateTime(input: DateInput): string {
  const d = toDate(input);
  if (!d) return '—';
  return `${formatDate(d, { weekday: true })}, ${formatTime(d)}:${pad(d.getSeconds())}`;
}

/** "a range" of two dates: "10 Oct → 10 Nov 2026", or "10 Oct 2026 → forever". */
export function formatRange(from: DateInput, to: DateInput, t: AdminT, now: Date = new Date()): string {
  const a = toDate(from);
  const b = toDate(to);
  if (!a) return '—';
  if (!b) return `${formatDate(a)} → ${t('admin.time.forever')}`;
  const sameYear = a.getFullYear() === b.getFullYear();
  const left = sameYear ? `${a.getDate()} ${MONTHS[a.getMonth()]}` : formatDate(a);
  return `${left} → ${formatDate(b, { now })}`;
}

/** Whole calendar days from `from` to `to` in the phone's time zone (negative when earlier). */
export function calendarDaysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / DAY);
}

/** "just now", "5 min ago", "2 h ago", "yesterday", "3 days ago", then the date; and the future forms. */
export function formatRelative(input: DateInput, t: AdminT, now: Date = new Date()): string {
  const d = toDate(input);
  if (!d) return t('admin.time.never');
  const diff = now.getTime() - d.getTime();
  const abs = Math.abs(diff);
  const future = diff < 0;
  if (abs < MINUTE) return t('admin.time.justNow');
  if (abs < HOUR) {
    const minutes = Math.floor(abs / MINUTE);
    return t(future ? 'admin.time.inMinutes' : 'admin.time.minutesAgo', { count: minutes });
  }
  const days = calendarDaysBetween(d, now);
  if (abs < 12 * HOUR || days === 0) {
    const hours = Math.max(1, Math.floor(abs / HOUR));
    return t(future ? 'admin.time.inHours' : 'admin.time.hoursAgo', { count: hours });
  }
  if (days === 1) return t('admin.time.yesterday');
  if (days === -1) return t('admin.time.tomorrow');
  if (Math.abs(days) < 7) return t(future ? 'admin.time.inDays' : 'admin.time.daysAgo', { count: Math.abs(days) });
  return formatDate(d, { year: 'auto', now });
}

/** A day header in grouped lists: "Today", "Yesterday", "Fri, 9 Oct", "Fri, 9 Oct 2025". */
export function formatDayHeader(input: DateInput, t: AdminT, now: Date = new Date()): string {
  const d = toDate(input);
  if (!d) return '—';
  const days = calendarDaysBetween(d, now);
  if (days === 0) return t('admin.time.today');
  if (days === 1) return t('admin.time.yesterday');
  return formatDate(d, { weekday: true, year: 'auto', now });
}

/** A local day key ("2026-10-11"), for grouping rows by day. */
export function dayKey(input: DateInput): string {
  const d = toDate(input);
  return d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : '';
}

/** 12481 → "12,481". */
export function formatNumber(n: number): string {
  return formatCount(n, 'en');
}

/** 0.0962 → "9.6%" (one decimal under 10 %, none above). */
export function formatPercent(fraction: number): string {
  if (!Number.isFinite(fraction)) return '—';
  const pct = fraction * 100;
  if (pct === 0) return '0%';
  if (pct < 0.1) return '<0.1%';
  return pct < 10 ? `${pct.toFixed(1)}%` : `${Math.round(pct)}%`;
}

/** 14.21 → "US$14.21". */
export function formatUsd(amount: number): string {
  const cents = Math.round(amount * 100);
  const whole = Math.floor(Math.abs(cents) / 100);
  const frac = Math.abs(cents) % 100;
  return `${cents < 0 ? '−' : ''}US$${formatNumber(whole)}.${pad(frac)}`;
}

/** A store price in major units (9.99 EUR) as "€9.99"; unknown currencies as "9.99 XYZ". */
export function formatMoney(amount: number, currency: string | null): string {
  if (!currency) return String(amount);
  const known: PriceFormat | undefined =
    currency === 'USD' ? { ...CURRENCY_FORMATS.USD, symbol: '$' } : CURRENCY_FORMATS[currency];
  const decimals = known?.decimals ?? 2;
  const minor = Math.round(amount * 10 ** decimals);
  if (!known) return `${(minor / 10 ** decimals).toFixed(decimals)} ${currency}`;
  return formatPrice(minor, { format: known }, 'en');
}

/** "SW-7K3P-92QX" stays; long internal ids are shortened for meta lines: "e7128d10…". */
export function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}
