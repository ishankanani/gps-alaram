/**
 * Prices by country, server side (spec 5): admin overrides in country_prices resolve exactly like
 * the built-in rows of src/lib/pricing.ts (exact key → EU alias → DEFAULT).
 *
 * A missing format falls back to the built-in row's format (when that row uses the same currency),
 * then to CURRENCY_FORMATS[currency]. Changing a price here does not change what Google charges.
 */
import type { AdminPriceRow, FieldError, PriceFormat, PriceRow, Warning } from '../../../src/api/types.ts';
import { BUILTIN_PRICES, CURRENCY_FORMATS, EU_ALIAS, resolvePrice } from '../../../src/lib/pricing.ts';
import { isoOrNull } from '../clock.ts';
import { many, one, run, type Db } from '../db/database.ts';
import { validationFailed } from '../http/errors.ts';
import { codePoints, type Body } from '../http/validate.ts';
import { bumpConfigGeneration } from './settings.ts';
import { adminRef } from './users.ts';

export { EU_ALIAS };

/** ISO 4217 currencies with 0 minor digits; every other currency here has 2. */
export const ZERO_DECIMAL_CURRENCIES: readonly string[] = ['JPY', 'KRW', 'CLP', 'VND', 'ISK'];
export const currencyDecimals = (currency: string): 0 | 2 => (ZERO_DECIMAL_CURRENCIES.includes(currency) ? 0 : 2);

export const PRICE_KEY_RE = /^(?:EU|DEFAULT|[A-Z]{2})$/;

type PriceOverrideRow = {
  country: string;
  currency: string;
  monthly_minor: number;
  yearly_minor: number;
  lifetime_minor: number;
  trial_days: number | null;
  format: string | null;
  updated_at: number;
  updated_by: string | null;
};

export const builtinRow = (country: string): PriceRow | null => BUILTIN_PRICES.find((r) => r.country === country) ?? null;

/** The default format for a key and currency: the built-in row's (same currency), then the currency's. */
export function defaultFormat(country: string, currency: string): PriceFormat | null {
  const b = builtinRow(country);
  if (b && b.currency === currency) return b.format;
  return CURRENCY_FORMATS[currency] ?? null;
}

const GROUPS = new Set(['.', ',', ' ', ' ', '’']);
const CONTROL = /[\u0000-\u001F\u007F-\u009F]/;

/** Validates a PriceFormat object; returns the clean copy or null. */
export function parsePriceFormat(v: unknown): PriceFormat | null {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return null;
  const f = v as Record<string, unknown>;
  const symbol = f.symbol;
  if (typeof symbol !== 'string' || symbol.trim() !== symbol || codePoints(symbol) < 1 || codePoints(symbol) > 8 || CONTROL.test(symbol)) return null;
  if (f.position !== 'before' && f.position !== 'after') return null;
  if (typeof f.space !== 'boolean' || typeof f.trimWhole !== 'boolean' || typeof f.wordSymbol !== 'boolean') return null;
  if (f.decimal !== '.' && f.decimal !== ',') return null;
  if (typeof f.group !== 'string' || !GROUPS.has(f.group) || f.group === f.decimal) return null;
  if (f.decimals !== 0 && f.decimals !== 2) return null;
  if (f.grouping !== 'standard' && f.grouping !== 'indian') return null;
  return {
    symbol, position: f.position, space: f.space, decimal: f.decimal, group: f.group, decimals: f.decimals,
    trimWhole: f.trimWhole, grouping: f.grouping, wordSymbol: f.wordSymbol,
  };
}

function toPriceRow(r: PriceOverrideRow): PriceRow | null {
  let format: PriceFormat | null = null;
  if (r.format !== null) {
    try {
      format = parsePriceFormat(JSON.parse(r.format));
    } catch {
      format = null;
    }
  }
  format ??= defaultFormat(r.country, r.currency);
  if (!format) return null;
  return {
    country: r.country, currency: r.currency, monthly: r.monthly_minor, yearly: r.yearly_minor, lifetime: r.lifetime_minor,
    trialDays: r.trial_days, format,
  };
}

const overrideRows = (db: Db): PriceOverrideRow[] => many<PriceOverrideRow>(db, 'SELECT * FROM country_prices ORDER BY country');

/** Every override as a PriceRow (rows without any usable format are skipped). */
export function loadOverrides(db: Db): PriceRow[] {
  return overrideRows(db).map(toPriceRow).filter((r): r is PriceRow => r !== null);
}

/** The resolved row for a country (null or 'DEFAULT' → the DEFAULT row). */
export function resolveCountryPrice(db: Db, country: string | null): PriceRow {
  return resolvePrice(country === 'DEFAULT' ? 'DEFAULT' : country, loadOverrides(db));
}

export function priceWarnings(row: Pick<PriceRow, 'monthly' | 'yearly' | 'lifetime'>): Warning[] {
  const w: Warning[] = [];
  if (row.yearly >= 12 * row.monthly) w.push('yearly_not_cheaper');
  if (row.lifetime <= row.yearly) w.push('lifetime_not_above_yearly');
  return w;
}

/**
 * PUT /v1/admin/prices/:country body (PriceUpdateRequest): integer minor units 1–100,000,000,
 * currency [A-Z]{3}, trialDays 0–30 or null, format optional. The format's decimals must match
 * the currency (0 for JPY, KRW, CLP, VND, ISK; 2 otherwise); without a format the default must
 * exist (fields.format = 'required'). Returns the row and whether the format was given.
 */
export function validatePriceUpdate(country: string, body: Body): { row: PriceRow; explicitFormat: boolean } {
  const fields: Record<string, FieldError> = {};
  const currency = body.currency;
  if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) fields.currency = currency === undefined ? 'required' : 'invalid';
  const amount = (key: 'monthly' | 'yearly' | 'lifetime'): number => {
    const v = body[key];
    if (v === undefined || v === null) fields[key] = 'required';
    else if (typeof v !== 'number' || !Number.isSafeInteger(v)) fields[key] = 'invalid';
    else if (v < 1 || v > 100_000_000) fields[key] = 'out_of_range';
    return typeof v === 'number' ? v : 0;
  };
  const monthly = amount('monthly');
  const yearly = amount('yearly');
  const lifetime = amount('lifetime');
  let trialDays: number | null = null;
  if (body.trialDays !== undefined && body.trialDays !== null) {
    const t = body.trialDays;
    if (typeof t !== 'number' || !Number.isSafeInteger(t)) fields.trialDays = 'invalid';
    else if (t < 0 || t > 30) fields.trialDays = 'out_of_range';
    else trialDays = t;
  }
  let format: PriceFormat | null = null;
  const explicitFormat = body.format !== undefined && body.format !== null;
  if (explicitFormat) {
    format = parsePriceFormat(body.format);
    if (!format) fields.format = 'invalid';
  } else if (typeof currency === 'string' && !fields.currency) {
    format = defaultFormat(country, currency);
    if (!format) fields.format = 'required';
  }
  if (format && typeof currency === 'string' && !fields.currency && format.decimals !== currencyDecimals(currency)) {
    fields.format = 'invalid';
  }
  if (Object.keys(fields).length > 0) throw validationFailed(fields);
  return {
    row: { country, currency: currency as string, monthly, yearly, lifetime, trialDays, format: format! },
    explicitFormat,
  };
}

/** Writes an override; the stored format is NULL unless one was given (defaults keep following the built-ins). */
export function upsertPriceOverride(
  db: Db,
  input: { row: PriceRow; explicitFormat: boolean },
  meta: { by: string | null; now: number },
): { before: PriceRow | null; after: PriceRow } {
  const r = input.row;
  const before = one<PriceOverrideRow>(db, 'SELECT * FROM country_prices WHERE country = ?', r.country);
  run(
    db,
    `INSERT INTO country_prices (country, currency, monthly_minor, yearly_minor, lifetime_minor, trial_days, format, updated_at, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (country) DO UPDATE SET currency = excluded.currency, monthly_minor = excluded.monthly_minor,
       yearly_minor = excluded.yearly_minor, lifetime_minor = excluded.lifetime_minor, trial_days = excluded.trial_days,
       format = excluded.format, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
    r.country, r.currency, r.monthly, r.yearly, r.lifetime, r.trialDays,
    input.explicitFormat ? JSON.stringify(r.format) : null, meta.now, meta.by,
  );
  bumpConfigGeneration(db);
  return { before: before ? toPriceRow(before) : null, after: r };
}

/** Removes an override; returns the removed row, or null when there was none (404). */
export function deletePriceOverride(db: Db, country: string): PriceRow | null {
  const before = one<PriceOverrideRow>(db, 'SELECT * FROM country_prices WHERE country = ?', country);
  if (!before) return null;
  run(db, 'DELETE FROM country_prices WHERE country = ?', country);
  bumpConfigGeneration(db);
  return toPriceRow(before) ?? { country, currency: before.currency, monthly: before.monthly_minor, yearly: before.yearly_minor,
    lifetime: before.lifetime_minor, trialDays: before.trial_days, format: CURRENCY_FORMATS.USD! };
}

export function resetPriceOverrides(db: Db): number {
  const removed = run(db, 'DELETE FROM country_prices').changes;
  bumpConfigGeneration(db);
  return removed;
}

/** GET /v1/admin/prices items: built-in rows merged with overrides, plus override-only rows; EU and DEFAULT last. */
export function listAdminPrices(db: Db): AdminPriceRow[] {
  const overrides = new Map(overrideRows(db).map((r) => [r.country, r]));
  const keys = new Set([...BUILTIN_PRICES.map((r) => r.country), ...overrides.keys()]);
  const rank = (k: string): number => (k === 'EU' ? 1 : k === 'DEFAULT' ? 2 : 0);
  const sorted = [...keys].sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0));
  const out: AdminPriceRow[] = [];
  for (const key of sorted) {
    const builtin = builtinRow(key);
    const o = overrides.get(key);
    const row = o ? toPriceRow(o) : builtin;
    if (!row) continue;
    out.push({
      ...row,
      builtin,
      overridden: o !== undefined,
      updatedAt: o ? isoOrNull(o.updated_at) : null,
      updatedBy: o ? adminRef(db, o.updated_by) : null,
    });
  }
  return out;
}
