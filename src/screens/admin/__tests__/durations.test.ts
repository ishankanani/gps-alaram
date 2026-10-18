import { describe, expect, it } from 'vitest';

import {
  addCalendarMonths,
  checkCustomEnd,
  daysLabelKey,
  endOfLocalDay,
  planForPreset,
  presetDays,
  presetEnd,
  promoPresetFor,
} from '../lib/durations';

describe('duration presets', () => {
  const from = new Date(2026, 9, 11, 16, 30); // 11 Oct 2026, 16:30 local

  it('adds calendar months and clamps the day', () => {
    expect(addCalendarMonths(new Date(2026, 0, 31), 1)).toEqual(new Date(2026, 1, 28));
    expect(addCalendarMonths(new Date(2028, 0, 31), 1)).toEqual(new Date(2028, 1, 29));
    expect(addCalendarMonths(new Date(2026, 10, 30), 3)).toEqual(new Date(2027, 1, 28));
    expect(addCalendarMonths(from, 12)).toEqual(new Date(2027, 9, 11, 16, 30));
  });

  it('ends presets on the same day of a later month', () => {
    expect(presetEnd('1m', from)).toEqual(new Date(2026, 10, 11, 16, 30));
    expect(presetEnd('3m', from)).toEqual(new Date(2027, 0, 11, 16, 30));
    expect(presetEnd('6m', from)).toEqual(new Date(2027, 3, 11, 16, 30));
    expect(presetEnd('1y', from)).toEqual(new Date(2027, 9, 11, 16, 30));
    expect(presetEnd('7d', from)?.getTime()).toBe(from.getTime() + 7 * 86_400_000);
    expect(presetEnd('lifetime', from)).toBeNull();
    expect(presetEnd('custom', from)).toBeNull();
  });

  it('turns presets into whole days for durationDays and extend', () => {
    expect(presetDays('7d', from)).toBe(7);
    expect(presetDays('1m', from)).toBe(31);
    expect(presetDays('1y', from)).toBe(365);
    expect(presetDays('1y', new Date(2027, 5, 1))).toBe(366);
    expect(presetDays('lifetime', from)).toBeNull();
  });

  it('suggests a plan from the duration', () => {
    expect(planForPreset('1m')).toBe('monthly');
    expect(planForPreset('6m')).toBe('monthly');
    expect(planForPreset('1y')).toBe('yearly');
    expect(planForPreset('lifetime')).toBe('lifetime');
    expect(planForPreset('custom', 400)).toBe('yearly');
    expect(planForPreset('custom', 20)).toBe('monthly');
  });

  it('checks custom end dates against the grant rules', () => {
    const now = new Date(2026, 9, 11, 12, 0);
    expect(checkCustomEnd(null, now)).toBe('required');
    expect(checkCustomEnd(new Date(2026, 9, 11, 12, 30), now)).toBe('tooSoon');
    expect(checkCustomEnd(new Date(2026, 9, 10), now)).toBe('tooSoon');
    expect(checkCustomEnd(endOfLocalDay(new Date(2026, 9, 11)), now)).toBeNull();
    expect(checkCustomEnd(new Date(2040, 0, 1), now)).toBe('tooFar');
  });

  it('lasts through the chosen day', () => {
    expect(endOfLocalDay(new Date(2026, 11, 31))).toEqual(new Date(2026, 11, 31, 23, 59));
  });

  it('labels promo lengths', () => {
    expect(promoPresetFor(30)).toBe('1m');
    expect(promoPresetFor(365)).toBe('1y');
    expect(promoPresetFor(45)).toBe('custom');
    expect(promoPresetFor(null)).toBe('lifetime');
    expect(daysLabelKey(30).key).toBe('admin.duration.1m');
    expect(daysLabelKey(92).key).toBe('admin.duration.3m');
    expect(daysLabelKey(45)).toEqual({ key: 'admin.duration.days', params: { count: 45 } });
  });
});
