// Prices typed as decimals in the price editor, stored as integer minor units (backend-spec 2.10:
// 0 decimals for JPY, KRW, CLP, VND and ISK, 2 for every other currency). Pure.

export const ZERO_DECIMAL_CURRENCIES: readonly string[] = ['JPY', 'KRW', 'CLP', 'VND', 'ISK'];

/** The minor digits of a currency, as the server checks them. */
export function currencyDecimals(currency: string): 0 | 2 {
  return ZERO_DECIMAL_CURRENCIES.includes(currency.toUpperCase()) ? 0 : 2;
}

/** The server's range for an amount in minor units. */
export const MIN_MINOR = 1;
export const MAX_MINOR = 100_000_000;

export type MoneyError = 'empty' | 'invalid' | 'tooManyDecimals' | 'outOfRange';

/**
 * "2.20", "2,20", "2", "1,500" (yen) or "1’234.50" → minor units. Spaces, apostrophes and the
 * group separator are ignored; the last "." or "," is the decimal mark when both appear. A single
 * mark followed by exactly three digits is a group separator for zero-decimal currencies.
 */
export function parseMoney(input: string, decimals: 0 | 2): { minor: number } | { error: MoneyError } {
  let s = input.replace(/[\s  '’]/g, '');
  if (s === '') return { error: 'empty' };
  if (!/^[0-9.,]+$/.test(s)) return { error: 'invalid' };
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  let intPart = s;
  let fracPart = '';
  if (lastDot >= 0 && lastComma >= 0) {
    const mark = lastDot > lastComma ? '.' : ',';
    const other = mark === '.' ? ',' : '.';
    // "1.234,50": the other mark only groups thousands in the whole part.
    const groups = s.slice(0, s.lastIndexOf(mark)).split(other);
    if (groups[0].length < 1 || groups[0].length > 3 || groups.slice(1).some((g) => g.length !== 3)) return { error: 'invalid' };
    s = s.split(other).join('');
    const i = s.lastIndexOf(mark);
    if (s.indexOf(mark) !== i) return { error: 'invalid' };
    intPart = s.slice(0, i);
    fracPart = s.slice(i + 1);
  } else if (lastDot >= 0 || lastComma >= 0) {
    const mark = lastDot >= 0 ? '.' : ',';
    const parts = s.split(mark);
    const groups = parts.length > 2 || (decimals === 0 && parts[1].length === 3);
    if (groups) {
      // "1.500.000" or a yen "1,500": every part after the first must be a group of three.
      if (parts.slice(1).some((p) => p.length !== 3) || parts[0] === '') return { error: 'invalid' };
      intPart = parts.join('');
    } else {
      intPart = parts[0];
      fracPart = parts[1];
    }
  }
  if (intPart === '' && fracPart === '') return { error: 'invalid' };
  if (!/^\d*$/.test(intPart) || !/^\d*$/.test(fracPart)) return { error: 'invalid' };
  // At most the currency's digits; "300.00" yen is fine (zeros only), "1,500" euros is not.
  if (fracPart.length > decimals && (fracPart.length > 2 || /[1-9]/.test(fracPart.slice(decimals)))) {
    return { error: 'tooManyDecimals' };
  }
  const whole = Number(intPart || '0');
  const frac = Number((fracPart + '00').slice(0, decimals) || '0');
  const minor = whole * 10 ** decimals + (decimals > 0 ? frac : 0);
  if (!Number.isSafeInteger(minor) || minor < MIN_MINOR || minor > MAX_MINOR) return { error: 'outOfRange' };
  return { minor };
}

/** Minor units as the editor shows them: 220 → "2.20", 300 yen → "300". */
export function minorToInput(minor: number, decimals: 0 | 2): string {
  if (decimals === 0) return String(minor);
  const whole = Math.floor(minor / 100);
  const frac = minor % 100;
  return `${whole}.${String(frac).padStart(2, '0')}`;
}

/** Re-expresses an amount when the currency's decimals change (JPY ↔ EUR): the typed number stays. */
export function convertMinor(minor: number, from: 0 | 2, to: 0 | 2): number {
  if (from === to) return minor;
  return from === 2 ? Math.round(minor / 100) : minor * 100;
}
