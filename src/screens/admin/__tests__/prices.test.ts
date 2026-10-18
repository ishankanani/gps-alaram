import { describe, expect, it } from 'vitest';

import type { AdminPriceRow } from '../../../api/types';
import { BUILTIN_PRICES } from '../../../lib/pricing';
import { defaultFormat, filterPriceRows, genericFormat, priceBody, priceKeyName, priceWarnings, rowSummary, sortPriceRows, yearlyPreview } from '../lib/prices';
import { t } from './t';

const row = (country: string): AdminPriceRow => {
  const b = BUILTIN_PRICES.find((r) => r.country === country)!;
  return { ...b, builtin: b, overridden: false, updatedAt: null, updatedBy: null };
};

describe('prices', () => {
  it('formats previews with formatPrice in both styles', () => {
    const ch = row('CH');
    expect(rowSummary(ch, 'en', t)).toBe('CHF 2.20 / mo · CHF 11.00 / yr · CHF 16.00 once');
    expect(yearlyPreview(ch, 'en', t)).toBe('CHF 11.00 a year · CHF 0.92 a month · save 58%');
    expect(yearlyPreview(row('DE'), 'native', t)).toBe('9,99 € a year · 0,83 € a month · save 58%');
    expect(yearlyPreview(row('DE'), 'en', t)).toBe('€9.99 a year · €0.83 a month · save 58%');
  });

  it('warns like the server', () => {
    expect(priceWarnings({ monthly: 100, yearly: 1200, lifetime: 1300 })).toEqual(['yearly_not_cheaper']);
    expect(priceWarnings({ monthly: 199, yearly: 999, lifetime: 999 })).toEqual(['lifetime_not_above_yearly']);
    expect(priceWarnings({ monthly: 199, yearly: 999, lifetime: 1499 })).toEqual([]);
  });

  it('sends no format when it is the default one', () => {
    const de = row('DE');
    expect(priceBody('DE', { ...de, monthly: 249 }).format).toBeNull();
    expect(priceBody('DE', { ...de, format: { ...de.format, symbol: 'EUR' } }).format?.symbol).toBe('EUR');
    expect(defaultFormat('PL', 'PLN')?.symbol).toBe('zł');
    expect(defaultFormat('XX', 'XYZ')).toBeNull();
    const generic = genericFormat('XYZ');
    expect(priceBody('XX', { currency: 'XYZ', monthly: 1, yearly: 2, lifetime: 3, trialDays: null, format: generic }).format).toEqual(generic);
    expect(genericFormat('JPY').decimals).toBe(0);
  });

  it('orders built-ins A–Z, then added rows, then EU and everyone else', () => {
    const pl: AdminPriceRow = { ...row('DE'), country: 'PL', currency: 'PLN', builtin: null, overridden: true };
    const sorted = sortPriceRows([row('DEFAULT'), row('EU'), pl, row('GB'), row('AT')], t).map((r) => r.country);
    expect(sorted).toEqual(['AT', 'GB', 'PL', 'EU', 'DEFAULT']);
    expect(priceKeyName('EU', t)).toBe('Other euro countries');
    expect(priceKeyName('DEFAULT', t)).toBe('Everyone else');
    expect(filterPriceRows([row('CH'), row('DE')], 'chf', t).map((r) => r.country)).toEqual(['CH']);
    expect(filterPriceRows([row('CH'), row('DE')], 'germ', t).map((r) => r.country)).toEqual(['DE']);
  });
});
