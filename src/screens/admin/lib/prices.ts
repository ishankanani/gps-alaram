// The price editor and list (backend-spec 5.1–5.4): default formats, previews in English and native
// style through formatPrice, the two warnings, and the order of the list. Pure.

import type { AdminPriceRow, PriceFormat, PriceRow, PriceUpdateRequest } from '../../../api/types';
import { BUILTIN_PRICES, CURRENCY_FORMATS, formatPrice, perMonth, yearlySaving } from '../../../lib/pricing';
import { countryName } from './countries';
import { currencyDecimals } from './money';
import type { AdminT } from './text';

/** The format the server uses when none is sent: the built-in row's (same currency), then the currency's. */
export function defaultFormat(country: string, currency: string): PriceFormat | null {
  const builtin = BUILTIN_PRICES.find((r) => r.country === country);
  if (builtin && builtin.currency === currency) return builtin.format;
  return CURRENCY_FORMATS[currency] ?? null;
}

/** A neutral starting point for a currency nobody configured: "PLN 8.99". */
export function genericFormat(currency: string): PriceFormat {
  return {
    symbol: currency,
    position: 'before',
    space: true,
    decimal: '.',
    group: ',',
    decimals: currencyDecimals(currency),
    trimWhole: false,
    grouping: 'standard',
    wordSymbol: true,
  };
}

export function sameFormat(a: PriceFormat | null, b: PriceFormat | null): boolean {
  if (!a || !b) return a === b;
  const keys: (keyof PriceFormat)[] = ['symbol', 'position', 'space', 'decimal', 'group', 'decimals', 'trimWhole', 'grouping', 'wordSymbol'];
  return keys.every((k) => a[k] === b[k]);
}

/** The request body: format null when it equals the default, so the row keeps following it. */
export function priceBody(country: string, row: Omit<PriceRow, 'country'>): PriceUpdateRequest {
  const fallback = defaultFormat(country, row.currency);
  return {
    currency: row.currency,
    monthly: row.monthly,
    yearly: row.yearly,
    lifetime: row.lifetime,
    trialDays: row.trialDays,
    format: sameFormat(fallback, row.format) ? null : row.format,
  };
}

export type PriceWarning = 'yearly_not_cheaper' | 'lifetime_not_above_yearly';

/** The server's non-blocking warnings, worked out before saving. */
export function priceWarnings(row: Pick<PriceRow, 'monthly' | 'yearly' | 'lifetime'>): PriceWarning[] {
  const out: PriceWarning[] = [];
  if (row.yearly >= 12 * row.monthly) out.push('yearly_not_cheaper');
  if (row.lifetime <= row.yearly) out.push('lifetime_not_above_yearly');
  return out;
}

/** "English" uses en (€1.99); "native" any non-English language, which keeps the row's own format. */
export type PriceStyle = 'en' | 'native';
const langOf = (style: PriceStyle) => (style === 'en' ? 'en' : 'de');

export function money(minor: number, row: Pick<PriceRow, 'format'>, style: PriceStyle = 'en'): string {
  return formatPrice(minor, row, langOf(style));
}

/** "CHF 11.00 a year · CHF 0.92 a month · save 58%". */
export function yearlyPreview(row: PriceRow, style: PriceStyle, t: AdminT): string {
  const parts = [
    t('admin.prices.perYear', { price: money(row.yearly, row, style) }),
    t('admin.prices.perMonthOfYear', { price: money(perMonth(row), row, style) }),
  ];
  const saving = row.monthly > 0 ? yearlySaving(row) : 0;
  if (saving >= 1) parts.push(t('admin.prices.save', { percent: saving }));
  return parts.join(' · ');
}

/** "CHF 2.20 / mo · CHF 11.00 / yr · CHF 16.00 once". */
export function rowSummary(row: PriceRow, style: PriceStyle, t: AdminT): string {
  return [
    t('admin.prices.mo', { price: money(row.monthly, row, style) }),
    t('admin.prices.yr', { price: money(row.yearly, row, style) }),
    t('admin.prices.once', { price: money(row.lifetime, row, style) }),
  ].join(' · ');
}

/** "Switzerland", "Other euro countries", "Everyone else". */
export function priceKeyName(country: string, t: AdminT): string {
  if (country === 'EU') return t('admin.prices.eu');
  if (country === 'DEFAULT') return t('admin.prices.default');
  return countryName(country);
}

/**
 * Built-in countries A–Z, then rows an admin added, then EU and DEFAULT (ui-critiques "Admin:
 * pricing by country").
 */
export function sortPriceRows(rows: readonly AdminPriceRow[], t: AdminT): AdminPriceRow[] {
  const rank = (r: AdminPriceRow) => (r.country === 'DEFAULT' ? 3 : r.country === 'EU' ? 2 : r.builtin ? 0 : 1);
  return [...rows].sort((a, b) => {
    const d = rank(a) - rank(b);
    if (d !== 0) return d;
    const an = priceKeyName(a.country, t);
    const bn = priceKeyName(b.country, t);
    return an < bn ? -1 : an > bn ? 1 : 0;
  });
}

/** Rows matching a search by name, key or currency. */
export function filterPriceRows(rows: readonly AdminPriceRow[], query: string, t: AdminT): AdminPriceRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...rows];
  return rows.filter(
    (r) => r.country.toLowerCase() === q || r.currency.toLowerCase().includes(q) || priceKeyName(r.country, t).toLowerCase().includes(q),
  );
}

/** Currencies the editor suggests (the ones with a known format). */
export const KNOWN_CURRENCIES: readonly string[] = Object.keys(CURRENCY_FORMATS);
