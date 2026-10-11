// DateField helpers (ui-direction-a 3.29): day, month and year typed as numbers, no date-picker
// library and no Intl (Hermes and Node format differently). Pure, so it is tested.

export type DatePart = 'day' | 'month' | 'year';

/** The order the parts are typed in: year first in Japanese, day first elsewhere (British English too). */
export function datePartOrder(lang: string | undefined): DatePart[] {
  return lang === 'ja' ? ['year', 'month', 'day'] : ['day', 'month', 'year'];
}

/** A local calendar date from typed parts, or null while incomplete or impossible (31 Feb). */
export function dateFromParts(day: string, month: string, year: string): Date | null {
  if (!/^\d{1,2}$/.test(day) || !/^\d{1,2}$/.test(month) || !/^\d{4}$/.test(year)) return null;
  const d = Number(day);
  const m = Number(month);
  const y = Number(year);
  if (m < 1 || m > 12 || d < 1 || y < 1900 || y > 2999) return null;
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? date : null;
}

/** The parts of a date as the fields show them (no zero padding). */
export function partsFromDate(date: Date | null): Record<DatePart, string> {
  if (!date) return { day: '', month: '', year: '' };
  return { day: String(date.getDate()), month: String(date.getMonth() + 1), year: String(date.getFullYear()) };
}

/** Whole calendar days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / 86_400_000);
}
