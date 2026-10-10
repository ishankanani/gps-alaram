/**
 * Plan prices by country and a deterministic price formatter (docs/design/backend-spec.md, 5).
 * No imports: the app and the server both use it. Also the Play Console price sheet.
 */
export type PriceFormat = {
  symbol: string;                 // '€', 'CHF', 'kr', 'kr.', '£', '$', 'US$', '¥', '₹'
  position: 'before' | 'after';
  space: boolean;                 // U+00A0 between symbol and number
  decimal: '.' | ',';
  group: string;                  // '.', ',', '\u00A0', '\u202F', '\u2019'
  decimals: 0 | 2;                // ISO 4217 minor digits
  trimWhole: boolean;             // drop ",00" when the amount is whole (25 kr, ₹79)
  grouping: 'standard' | 'indian';
  wordSymbol: boolean;            // CHF, kr, kr., zł: placement kept in English style
};
export type PriceRow = {
  country: string;                // 'DE' | 'EU' | 'DEFAULT' | any ISO2 added by an admin
  currency: string;
  monthly: number; yearly: number; lifetime: number;   // minor units
  trialDays: number | null;
  format: PriceFormat;
};

const NBSP = '\u00A0';
const NNBSP = '\u202F';
const base = { decimals: 2, trimWhole: false, grouping: 'standard', wordSymbol: false } as const;
const euroAfter: PriceFormat = { ...base, symbol: '€', position: 'after', space: true, decimal: ',', group: '.' };
const euroBefore: PriceFormat = { ...euroAfter, position: 'before' };
const euroEnglish: PriceFormat = { ...base, symbol: '€', position: 'before', space: false, decimal: '.', group: ',' };
const dollar: PriceFormat = { ...base, symbol: '$', position: 'before', space: false, decimal: '.', group: ',' };
const krone = (symbol: string, group: string): PriceFormat =>
  ({ ...base, symbol, position: 'after', space: true, decimal: ',', group, trimWhole: true, wordSymbol: true });
const eur = (country: string, format: PriceFormat): PriceRow =>
  ({ country, currency: 'EUR', monthly: 199, yearly: 999, lifetime: 1499, trialDays: null, format });

export const BUILTIN_PRICES: readonly PriceRow[] = [
  eur('DE', euroAfter), eur('AT', euroBefore),
  { country: 'CH', currency: 'CHF', monthly: 220, yearly: 1100, lifetime: 1600, trialDays: null,
    format: { ...base, symbol: 'CHF', position: 'before', space: true, decimal: '.', group: '\u2019', wordSymbol: true } },
  eur('LU', euroAfter), eur('NL', euroBefore), eur('BE', euroBefore),
  { country: 'GB', currency: 'GBP', monthly: 179, yearly: 899, lifetime: 1299, trialDays: null, format: { ...dollar, symbol: '£' } },
  eur('IE', euroEnglish),
  { country: 'SE', currency: 'SEK', monthly: 2500, yearly: 11900, lifetime: 17900, trialDays: null, format: krone('kr', NBSP) },
  { country: 'NO', currency: 'NOK', monthly: 2500, yearly: 12900, lifetime: 18900, trialDays: null, format: krone('kr', NBSP) },
  { country: 'DK', currency: 'DKK', monthly: 1500, yearly: 7900, lifetime: 11900, trialDays: null, format: krone('kr.', '.') },
  eur('FI', { ...euroAfter, group: NBSP }), eur('FR', { ...euroAfter, group: NNBSP }),
  { country: 'US', currency: 'USD', monthly: 199, yearly: 999, lifetime: 1499, trialDays: null, format: dollar },
  { country: 'CA', currency: 'CAD', monthly: 279, yearly: 1399, lifetime: 1999, trialDays: null, format: dollar },
  { country: 'AU', currency: 'AUD', monthly: 349, yearly: 1699, lifetime: 2499, trialDays: null, format: dollar },
  { country: 'JP', currency: 'JPY', monthly: 300, yearly: 1500, lifetime: 2200, trialDays: null, format: { ...dollar, symbol: '¥', decimals: 0 } },
  { country: 'IN', currency: 'INR', monthly: 7900, yearly: 39900, lifetime: 59900, trialDays: null,
    format: { ...dollar, symbol: '₹', trimWhole: true, grouping: 'indian' } },
  eur('EU', euroAfter),
  { country: 'DEFAULT', currency: 'USD', monthly: 199, yearly: 999, lifetime: 1499, trialDays: null, format: { ...dollar, symbol: 'US$' } },
];

export const EU_ALIAS: readonly string[] = ['BG','HR','CY','EE','GR','IT','LV','LT','MT','PT','SK','SI','ES','AD','MC','SM','VA','ME','XK','AX','GF','GP','MQ','RE','YT','PM','BL','MF'];

/** Formats for currencies an admin may add without giving one (country rows override these). */
export const CURRENCY_FORMATS: Readonly<Record<string, PriceFormat>> = {
  EUR: euroAfter, CHF: BUILTIN_PRICES[2].format, GBP: { ...dollar, symbol: '£' }, SEK: krone('kr', NBSP),
  NOK: krone('kr', NBSP), DKK: krone('kr.', '.'), USD: { ...dollar, symbol: 'US$' }, CAD: { ...dollar, symbol: 'CA$' },
  AUD: { ...dollar, symbol: 'A$' }, JPY: { ...dollar, symbol: '¥', decimals: 0 }, INR: { ...dollar, symbol: '₹', trimWhole: true, grouping: 'indian' },
  PLN: { ...euroAfter, symbol: 'zł', group: NBSP, wordSymbol: true }, CZK: { ...krone('Kč', NBSP) }, NZD: { ...dollar, symbol: 'NZ$' },
};

/** Languages whose speakers expect "€1.99" wherever they live. */
export const ENGLISH_STYLE_LANGS: readonly string[] = ['en', 'hi', 'ja'];

export function resolvePrice(country: string | null | undefined, overrides: readonly PriceRow[] = []): PriceRow {
  const rows = new Map(BUILTIN_PRICES.map((r) => [r.country, r]));
  for (const o of overrides) rows.set(o.country, o);
  const c = (country ?? '').toUpperCase();
  return rows.get(c) ?? (EU_ALIAS.includes(c) ? rows.get('EU') : undefined) ?? rows.get('DEFAULT')!;
}

function groupDigits(int: number, sep: string, style: PriceFormat['grouping']): string {
  const s = String(int);
  if (style === 'indian' && s.length > 3) {
    let rest = s.slice(0, -3);
    const parts: string[] = [];
    while (rest.length > 2) { parts.unshift(rest.slice(-2)); rest = rest.slice(0, -2); }
    if (rest) parts.unshift(rest);
    return `${parts.join(sep)}${sep}${s.slice(-3)}`;
  }
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}

/** 199 + DE row → "1,99 €" in German, "€1.99" in English. Deterministic: no Intl. */
export function formatPrice(minor: number, row: Pick<PriceRow, 'format'>, lang: string): string {
  let f = row.format;
  if (ENGLISH_STYLE_LANGS.includes(lang)) {
    f = { ...f, decimal: '.', group: ',', position: f.wordSymbol ? f.position : 'before', space: f.wordSymbol ? f.space : false };
  }
  const div = 10 ** f.decimals;
  const int = Math.floor(minor / div);
  const frac = minor % div;
  let n = groupDigits(int, f.group, f.grouping);
  if (f.decimals > 0 && !(f.trimWhole && frac === 0)) n += f.decimal + String(frac).padStart(f.decimals, '0');
  const sp = f.space ? NBSP : '';
  return f.position === 'before' ? `${f.symbol}${sp}${n}` : `${n}${sp}${f.symbol}`;
}

/** What the yearly plan comes to per month, in minor units (rounded half up). */
export const perMonth = (row: PriceRow): number => Math.round(row.yearly / 12);
/** Whole percent saved by yearly against 12 months, rounded down (never overstated). */
export const yearlySaving = (row: PriceRow): number => Math.floor((1 - row.yearly / (12 * row.monthly)) * 100);
