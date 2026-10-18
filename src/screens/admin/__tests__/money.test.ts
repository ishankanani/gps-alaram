import { describe, expect, it } from 'vitest';

import { convertMinor, currencyDecimals, minorToInput, parseMoney } from '../lib/money';

const minor = (input: string, decimals: 0 | 2) => {
  const r = parseMoney(input, decimals);
  return 'minor' in r ? r.minor : r.error;
};

describe('money input', () => {
  it('knows the zero-decimal currencies', () => {
    expect(currencyDecimals('JPY')).toBe(0);
    expect(currencyDecimals('krw')).toBe(0);
    expect(currencyDecimals('ISK')).toBe(0);
    expect(currencyDecimals('EUR')).toBe(2);
    expect(currencyDecimals('CHF')).toBe(2);
  });

  it('turns decimals into minor units with a dot or a comma', () => {
    expect(minor('2.20', 2)).toBe(220);
    expect(minor('2,20', 2)).toBe(220);
    expect(minor('2.2', 2)).toBe(220);
    expect(minor('2', 2)).toBe(200);
    expect(minor('9.99', 2)).toBe(999);
    expect(minor('.99', 2)).toBe(99);
    expect(minor(' 14,99 ', 2)).toBe(1499);
  });

  it('accepts group separators', () => {
    expect(minor('1,234.50', 2)).toBe(123450);
    expect(minor('1.234,50', 2)).toBe(123450);
    expect(minor('1’234.50', 2)).toBe(123450);
    expect(minor('1 234,50', 2)).toBe(123450);
    expect(minor('1,500', 0)).toBe(1500);
    expect(minor('1.500.000', 0)).toBe(1500000);
  });

  it('handles zero-decimal currencies', () => {
    expect(minor('300', 0)).toBe(300);
    expect(minor('300.00', 0)).toBe(300);
    expect(minor('300.5', 0)).toBe('tooManyDecimals');
  });

  it('rejects bad input', () => {
    expect(minor('', 2)).toBe('empty');
    expect(minor('abc', 2)).toBe('invalid');
    expect(minor('1.2.3,4', 2)).toBe('invalid');
    expect(minor('1,999', 2)).toBe('tooManyDecimals');
    expect(minor('2.999', 2)).toBe('tooManyDecimals');
    expect(minor('0', 2)).toBe('outOfRange');
    expect(minor('2000000', 2)).toBe('outOfRange');
    expect(minor('-1', 2)).toBe('invalid');
  });

  it('shows minor units for editing and converts between digit counts', () => {
    expect(minorToInput(220, 2)).toBe('2.20');
    expect(minorToInput(5, 2)).toBe('0.05');
    expect(minorToInput(300, 0)).toBe('300');
    expect(convertMinor(199, 2, 0)).toBe(2);
    expect(convertMinor(300, 0, 2)).toBe(30000);
    expect(convertMinor(199, 2, 2)).toBe(199);
  });
});
