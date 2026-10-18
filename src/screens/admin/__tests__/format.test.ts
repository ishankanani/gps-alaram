import { describe, expect, it } from 'vitest';

import {
  calendarDaysBetween,
  dayKey,
  formatDate,
  formatDateTime,
  formatDayHeader,
  formatMoney,
  formatPercent,
  formatRange,
  formatRelative,
  formatTime,
  formatUsd,
} from '../lib/format';
import { t } from './t';

describe('admin formats (en-GB, no Intl)', () => {
  const now = new Date(2026, 9, 11, 16, 34);

  it('formats dates and times', () => {
    expect(formatDate(new Date(2026, 10, 10))).toBe('10 Nov 2026');
    expect(formatDate(new Date(2026, 10, 10), { weekday: true })).toBe('Tue, 10 Nov 2026');
    expect(formatDate(new Date(2026, 10, 10), { year: 'auto', now })).toBe('10 Nov');
    expect(formatDate(new Date(2027, 0, 2), { year: 'auto', now })).toBe('2 Jan 2027');
    expect(formatDate(null)).toBe('—');
    expect(formatDate('nonsense')).toBe('—');
    expect(formatTime(new Date(2026, 9, 10, 9, 5))).toBe('09:05');
    expect(formatDateTime(new Date(2026, 9, 10, 14, 2), now)).toBe('10 Oct, 14:02');
    expect(formatRange(new Date(2026, 9, 10), new Date(2026, 10, 10), t)).toBe('10 Oct → 10 Nov 2026');
    expect(formatRange(new Date(2026, 9, 10), null, t)).toBe('10 Oct 2026 → forever');
  });

  it('says how long ago', () => {
    expect(formatRelative(new Date(now.getTime() - 20_000), t, now)).toBe('just now');
    expect(formatRelative(new Date(now.getTime() - 5 * 60_000), t, now)).toBe('5 min ago');
    expect(formatRelative(new Date(now.getTime() - 2 * 3_600_000), t, now)).toBe('2 h ago');
    expect(formatRelative(new Date(2026, 9, 10, 10, 0), t, now)).toBe('Yesterday');
    expect(formatRelative(new Date(2026, 9, 8, 10, 0), t, now)).toBe('3 days ago');
    expect(formatRelative(new Date(2026, 8, 1), t, now)).toBe('1 Sep');
    expect(formatRelative(new Date(2026, 9, 14, 10, 0), t, now)).toBe('in 3 days');
    expect(formatRelative(null, t, now)).toBe('Never');
  });

  it('groups by day', () => {
    expect(formatDayHeader(new Date(2026, 9, 11, 1), t, now)).toBe('Today');
    expect(formatDayHeader(new Date(2026, 9, 10, 23), t, now)).toBe('Yesterday');
    expect(formatDayHeader(new Date(2026, 9, 9), t, now)).toBe('Fri, 9 Oct');
    expect(dayKey(new Date(2026, 0, 5, 3))).toBe('2026-01-05');
    expect(calendarDaysBetween(new Date(2026, 9, 10, 23), new Date(2026, 9, 11, 1))).toBe(1);
  });

  it('formats percentages and money', () => {
    expect(formatPercent(0.0962)).toBe('9.6%');
    expect(formatPercent(0.5)).toBe('50%');
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(0.0004)).toBe('<0.1%');
    expect(formatUsd(14.21)).toBe('US$14.21');
    expect(formatUsd(1234.5)).toBe('US$1,234.50');
    expect(formatMoney(9.99, 'EUR')).toBe('€9.99');
    expect(formatMoney(11.5884, 'USD')).toBe('$11.59');
    expect(formatMoney(300, 'JPY')).toBe('¥300');
    expect(formatMoney(8.99, 'XYZ')).toBe('8.99 XYZ');
  });
});
