import { describe, expect, it } from 'vitest';

import { formatBytes, formatCount, formatDistance, formatDuration, formatRadius } from '../format';

describe('format', () => {
  it('formats distances in metric', () => {
    expect(formatDistance(84)).toBe('80 m');
    expect(formatDistance(1234)).toBe('1.2 km');
    expect(formatDistance(23_600)).toBe('24 km');
  });

  it('uses a decimal comma in German', () => {
    expect(formatDistance(1234, false, 'de')).toBe('1,2 km');
    expect(formatDistance(3218.7, true, 'de')).toBe('2,0 mi');
  });

  it('formats distances in miles', () => {
    expect(formatDistance(100, true)).toBe('330 ft');
    expect(formatDistance(3218.7, true)).toBe('2.0 mi');
  });

  it('formats durations', () => {
    expect(formatDuration(20)).toBe('<1 min');
    expect(formatDuration(600)).toBe('10 min');
    expect(formatDuration(5_400)).toBe('1 h 30 min');
  });

  it('formats radius chips', () => {
    expect(formatRadius(300)).toBe('300 m');
    expect(formatRadius(2000)).toBe('2 km');
  });

  it('formats download sizes and counts', () => {
    expect(formatBytes(850_000)).toBe('850 KB');
    expect(formatBytes(4_230_000)).toBe('4.2 MB');
    expect(formatBytes(4_230_000, 'de')).toBe('4,2 MB');
    expect(formatBytes(38_400_000)).toBe('38 MB');
    expect(formatCount(12345)).toBe('12,345');
    expect(formatCount(1234567, 'de')).toBe('1.234.567');
    expect(formatCount(999)).toBe('999');
  });
});
