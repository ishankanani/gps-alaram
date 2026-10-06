import { describe, expect, it } from 'vitest';

import { formatDistance, formatDuration, formatRadius } from '../format';

describe('format', () => {
  it('formats distances in metric', () => {
    expect(formatDistance(84)).toBe('80 m');
    expect(formatDistance(1234)).toBe('1.2 km');
    expect(formatDistance(23_600)).toBe('24 km');
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
});
