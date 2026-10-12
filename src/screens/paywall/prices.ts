// What the paywall shows for each plan (backend-spec 5.3 and the critiques' price rules):
// 1. the store's priceString while Google Play is connected (authoritative);
// 2. otherwise the remote-config row (the server's resolved row, admin overrides included);
// 3. before the first config fetch, the built-in table for the phone's region.
// Table amounts are formatted only with formatPrice, perMonth and yearlySaving (src/lib/pricing.ts).
import { formatPrice, perMonth, yearlySaving, type PriceRow } from '../../lib/pricing';
import type { Plan } from '../../lib/pro';

export type ShownPlanType = 'yearly' | 'monthly' | 'lifetime';

export type ShownPlan = {
  type: ShownPlanType;
  /** "€9.99", "₹399", or the store's priceString. */
  price: string;
  /** Yearly: what it comes to per month. */
  perMonth: string | null;
  /** The per-month figure is rounded to whole units ("about ₹33 a month"). */
  perMonthAbout: boolean;
  /** Free days before the first payment: only when this user may have them. */
  trialDays: number | null;
  /** Whole percent saved by yearly against 12 months; null below 10 %. */
  savePercent: number | null;
  /** The store plan to buy; null when prices come from the table. */
  storePlan: Plan | null;
};

/** Below this, a saving is not worth a badge. */
export const MIN_SAVING = 10;

/** Currencies read in whole units: the per-month line rounds down and says "about". */
const WHOLE_UNIT_CURRENCIES = ['INR', 'JPY', 'SEK', 'NOK', 'DKK'];

const ORDER: ShownPlanType[] = ['yearly', 'monthly', 'lifetime'];
const fromStoreType = { annual: 'yearly', monthly: 'monthly', lifetime: 'lifetime' } as const;

/** Plans as Google Play prices them for this user. */
export function plansFromStore(plans: Plan[]): ShownPlan[] {
  const yearly = plans.find((p) => p.type === 'annual');
  const monthly = plans.find((p) => p.type === 'monthly');
  let save: number | null = null;
  if (yearly && monthly && monthly.amount > 0 && yearly.currency === monthly.currency) {
    const pct = Math.floor((1 - yearly.amount / (12 * monthly.amount)) * 100);
    save = pct >= MIN_SAVING ? pct : null;
  }
  const shown = plans.map<ShownPlan>((p) => {
    const type = fromStoreType[p.type];
    return {
      type,
      price: p.price,
      perMonth: type === 'yearly' ? p.perMonth : null,
      perMonthAbout: false,
      trialDays: p.trialDays && p.trialDays > 0 ? p.trialDays : null,
      savePercent: type === 'yearly' ? save : null,
      storePlan: p,
    };
  });
  return shown.sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type));
}

/** Plans from a price row (remote config or the built-in table), formatted for the app language. */
export function plansFromTable(row: PriceRow, lang: string, trialDays: number | null): ShownPlan[] {
  const monthlyMinor = perMonth(row);
  let perMonthMinor = monthlyMinor;
  let about = false;
  if (WHOLE_UNIT_CURRENCIES.includes(row.currency)) {
    const unit = 10 ** row.format.decimals;
    perMonthMinor = Math.floor(row.yearly / 12 / unit) * unit;
    about = perMonthMinor * 12 !== row.yearly;
  }
  const format = WHOLE_UNIT_CURRENCIES.includes(row.currency) ? { format: { ...row.format, trimWhole: true } } : row;
  const saving = yearlySaving(row);
  const trial = trialDays && trialDays > 0 ? trialDays : null;
  return [
    {
      type: 'yearly',
      price: formatPrice(row.yearly, row, lang),
      perMonth: formatPrice(perMonthMinor, format, lang),
      perMonthAbout: about,
      trialDays: trial,
      savePercent: saving >= MIN_SAVING ? saving : null,
      storePlan: null,
    },
    { type: 'monthly', price: formatPrice(row.monthly, row, lang), perMonth: null, perMonthAbout: false, trialDays: null, savePercent: null, storePlan: null },
    { type: 'lifetime', price: formatPrice(row.lifetime, row, lang), perMonth: null, perMonthAbout: false, trialDays: null, savePercent: null, storePlan: null },
  ];
}
