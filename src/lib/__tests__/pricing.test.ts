import { describe, expect, it } from 'vitest';

import { BUILTIN_PRICES, formatPrice, perMonth, resolvePrice, yearlySaving, type PriceRow } from '../pricing';

const NBSP = ' ';
const row = (country: string) => resolvePrice(country);
const all = (country: string, lang: string) => {
  const r = row(country);
  return [r.monthly, r.yearly, r.lifetime].map((m) => formatPrice(m, r, lang)).join(' · ');
};

describe('prices by country', () => {
  it('resolves countries, euro countries without a row, and everyone else', () => {
    expect(row('de').country).toBe('DE');
    expect(row('ES').country).toBe('EU');
    expect(row('BR').country).toBe('DEFAULT');
    expect(row(null).country).toBe('DEFAULT');
    expect(row('BR').currency).toBe('USD');
  });

  it('lets an admin override a row or add a country', () => {
    const pl: PriceRow = { ...row('DE'), country: 'PL', currency: 'PLN', monthly: 899, yearly: 4499, lifetime: 6499 };
    const cheaperDe: PriceRow = { ...row('DE'), monthly: 99 };
    expect(resolvePrice('PL', [pl]).currency).toBe('PLN');
    expect(resolvePrice('DE', [cheaperDe]).monthly).toBe(99);
    expect(resolvePrice('AT', [cheaperDe]).monthly).toBe(199);
  });

  it('formats in the local style', () => {
    expect(all('DE', 'de')).toBe(`1,99${NBSP}€ · 9,99${NBSP}€ · 14,99${NBSP}€`);
    expect(all('AT', 'de')).toBe(`€${NBSP}1,99 · €${NBSP}9,99 · €${NBSP}14,99`);
    expect(all('CH', 'de')).toBe(`CHF${NBSP}2.20 · CHF${NBSP}11.00 · CHF${NBSP}16.00`);
    expect(all('GB', 'en')).toBe('£1.79 · £8.99 · £12.99');
    expect(all('SE', 'sv')).toBe(`25${NBSP}kr · 119${NBSP}kr · 179${NBSP}kr`);
    expect(all('DK', 'da')).toBe(`15${NBSP}kr. · 79${NBSP}kr. · 119${NBSP}kr.`);
    expect(all('JP', 'ja')).toBe('¥300 · ¥1,500 · ¥2,200');
    expect(all('IN', 'hi')).toBe('₹79 · ₹399 · ₹599');
    expect(all('BR', 'en')).toBe('US$1.99 · US$9.99 · US$14.99');
  });

  it('uses English style for English, Hindi and Japanese wherever they live', () => {
    expect(all('DE', 'en')).toBe('€1.99 · €9.99 · €14.99');
    expect(all('CH', 'en')).toBe(`CHF${NBSP}2.20 · CHF${NBSP}11.00 · CHF${NBSP}16.00`);
    expect(formatPrice(11900, row('SE'), 'en')).toBe(`119${NBSP}kr`);
  });

  it('groups thousands, the Indian way for rupees', () => {
    expect(formatPrice(123456789, row('IN'), 'en')).toBe('₹12,34,567.89');
    expect(formatPrice(123456700, row('FR'), 'fr')).toBe(`1 234 567,00${NBSP}€`);
    expect(formatPrice(150000, row('JP'), 'ja')).toBe('¥150,000');
  });

  it('works out the yearly plan per month and the saving, never overstated', () => {
    expect(formatPrice(perMonth(row('DE')), row('DE'), 'de')).toBe(`0,83${NBSP}€`);
    expect(formatPrice(perMonth(row('IN')), row('IN'), 'en')).toBe('₹33.25');
    expect(yearlySaving(row('DE'))).toBe(58);
    expect(yearlySaving(row('SE'))).toBe(60);
  });

  it('keeps every row sensible: yearly cheaper than 12 months, lifetime above yearly', () => {
    for (const r of BUILTIN_PRICES) {
      expect(r.yearly, r.country).toBeLessThan(12 * r.monthly);
      expect(r.lifetime, r.country).toBeGreaterThan(r.yearly);
      expect(yearlySaving(r), r.country).toBeGreaterThanOrEqual(50);
    }
  });
});
