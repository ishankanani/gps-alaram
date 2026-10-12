import type { Key, Lang, Params, T } from '../../i18n';
import { calendarDaysBetween, type MonthKey, type TripBadge } from '../../lib/history';
import type { BadgeTone } from '../../ui/components/Badge';

// Dates, times and counts for Activity, Saved and TripDetail, put together from the dictionaries
// (month and weekday names, patterns) instead of Intl, so Hermes and Vitest agree and every
// language orders the parts its own way. Pure: no React Native.

/** Keys that come in a .one and an .other form. */
export type PluralBase = {
  [K in Key]: K extends `${infer B}.one` ? (`${B}.other` extends Key ? B : never) : never;
}[Key];

/** French and Hindi treat 0 as singular; Japanese has one form; the rest use 1 = one. */
export function pluralForm(lang: Lang, count: number): 'one' | 'other' {
  if (lang === 'ja') return 'other';
  if (lang === 'fr' || lang === 'hi') return Math.abs(count) < 2 ? 'one' : 'other';
  return count === 1 ? 'one' : 'other';
}

/** tr() with the plural form for `count` (passed as {count}). */
export function plural(tr: T, lang: Lang, base: PluralBase, count: number, params?: Params): string {
  return tr(`${base}.${pluralForm(lang, count)}` as Key, { count, ...params });
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

/** "92 %" in German and French, "92%" in English. */
export function formatPercent(value: number, lang: Lang): string {
  const n = Math.round(value);
  return lang === 'de' || lang === 'fr' || lang === 'fi' || lang === 'sv' || lang === 'nb' || lang === 'da' ? `${n} %` : `${n}%`;
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
