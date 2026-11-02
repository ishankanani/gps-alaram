import { DICTIONARIES, type Key, type Lang, type Params, type T } from '../../i18n';
import type { PluralBase } from '../../i18n/en';
import { calendarDaysBetween, type MonthKey, type TripBadge } from '../../lib/history';
import type { BadgeTone } from '../../ui/components/Badge';

// Dates, times and counts for Activity, Saved and TripDetail, put together from the dictionaries
// (month and weekday names, patterns) instead of Intl, so Hermes and Vitest agree and every
// language orders the parts its own way. Pure: no React Native.

export type { PluralBase };

export type PluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';

/**
 * The CLDR plural category of a whole number, written out per language (no Intl, so Hermes and
 * Vitest agree; a test compares every rule with Intl.PluralRules). French, Portuguese and Hindi
 * treat 0 as singular; Japanese, Korean and Chinese have one form; Polish has one, few, many;
 * Czech one, few, other; Arabic all six; the rest use 1 = one.
 */
export function pluralForm(lang: Lang, count: number): PluralCategory {
  const n = Math.abs(Math.trunc(count));
  switch (lang) {
    case 'ja':
    case 'ko':
    case 'zh':
      return 'other';
    case 'fr':
    case 'hi':
    case 'pt':
      return n < 2 ? 'one' : 'other';
    case 'pl': {
      if (n === 1) return 'one';
      const last = n % 10;
      const lastTwo = n % 100;
      return last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14) ? 'few' : 'many';
    }
    case 'cs':
      if (n === 1) return 'one';
      return n >= 2 && n <= 4 ? 'few' : 'other';
    case 'ar': {
      if (n === 0) return 'zero';
      if (n === 1) return 'one';
      if (n === 2) return 'two';
      const lastTwo = n % 100;
      if (lastTwo >= 3 && lastTwo <= 10) return 'few';
      return lastTwo >= 11 ? 'many' : 'other';
    }
    default:
      return n === 1 ? 'one' : 'other';
  }
}

/**
 * tr() with the plural form for `count` (passed as {count}). A form the language does not spell
 * out ("few" in a language that only needs one and other) falls back to .other.
 */
export function plural(tr: T, lang: Lang, base: PluralBase, count: number, params?: Params): string {
  const form = pluralForm(lang, count);
  const exact = `${base}.${form}`;
  const spelledOut = form === 'one' || form === 'other' || (DICTIONARIES[lang] as Record<string, string | undefined>)[exact];
  return tr((spelledOut ? exact : `${base}.other`) as Key, { count, ...params });
}

function pad2(n: number) {
  return n < 10 ? `0${n}` : String(n);
}

/** "07:58" with a 24-hour clock, "7:58 am" with a 12-hour one. */
export function formatClock(ts: number, h24: boolean, tr: T): string {
  const d = new Date(ts);
  const minutes = pad2(d.getMinutes());
  if (h24) return `${pad2(d.getHours())}:${minutes}`;
  const hour = d.getHours() % 12 || 12;
  return tr(d.getHours() < 12 ? 'activity.time.am' : 'activity.time.pm', { time: `${hour}:${minutes}` });
}

const monthName = (tr: T, month: number) => tr(`activity.month.${month}` as Key);
const monthShort = (tr: T, month: number) => tr(`activity.monthShort.${month}` as Key);
const weekday = (tr: T, day: number) => tr(`activity.weekday.${day}` as Key);

/** "October 2026" */
export function monthLabel(m: MonthKey, tr: T): string {
  return tr('activity.date.monthYear', { month: monthName(tr, m.month), year: m.year });
}

/** "October", for "No trips in October." */
export function monthOnly(m: MonthKey, tr: T): string {
  return monthName(tr, m.month);
}

/** "Sat, 11 Oct 2026" */
export function fullDate(ts: number, tr: T): string {
  const d = new Date(ts);
  return tr('activity.date.full', { weekday: weekday(tr, d.getDay()), day: d.getDate(), month: monthShort(tr, d.getMonth()), year: d.getFullYear() });
}

/** "Today", "Yesterday", "Mon 6 Oct", or "Sat, 11 Oct 2025" in another year. */
export function dayLabel(ts: number, now: number, tr: T): string {
  const days = calendarDaysBetween(ts, now);
  if (days === 0) return tr('activity.today');
  if (days === 1) return tr('activity.yesterday');
  const d = new Date(ts);
  if (d.getFullYear() !== new Date(now).getFullYear()) return fullDate(ts, tr);
  return tr('activity.date.day', { weekday: weekday(tr, d.getDay()), day: d.getDate(), month: monthShort(tr, d.getMonth()) });
}

/** "Yesterday, 18:40" */
export function dayTime(ts: number, now: number, h24: boolean, tr: T): string {
  return tr('activity.dayTime', { day: dayLabel(ts, now, tr), time: formatClock(ts, h24, tr) });
}

/** "6 h 40 min", "23 min", "<1 min" (whole minutes). */
export function formatSpan(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return '<1 min';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

/** A non-breaking space before the unit ("1.4 km" never wraps between number and unit). */
export function nbsp(text: string): string {
  return text.replace(/(\d) (?=[^\d\s])/g, '$1 ');
}

/** "92 %" in German, French and Czech, "%92" in Turkish, "92%" in English. */
export function formatPercent(value: number, lang: Lang): string {
  const n = Math.round(value);
  if (lang === 'tr') return `%${n}`;
  const spaced = ['de', 'fr', 'fi', 'sv', 'nb', 'da', 'cs', 'es'];
  return spaced.includes(lang) ? `${n} %` : `${n}%`;
}

/** The outcome badge of a trip row: tone and label. */
export const BADGE_LOOK: Record<TripBadge, { tone: BadgeTone; label: Key }> = {
  onTime: { tone: 'success', label: 'activity.badge.onTime' },
  tooEarly: { tone: 'warning', label: 'activity.badge.tooEarly' },
  tooLate: { tone: 'warning', label: 'activity.badge.tooLate' },
  ended: { tone: 'neutral', label: 'activity.badge.ended' },
  stoppedByPhone: { tone: 'danger', label: 'activity.badge.stoppedByPhone' },
  didntStart: { tone: 'danger', label: 'activity.badge.didntStart' },
  demo: { tone: 'primary', label: 'activity.badge.demo' },
};
