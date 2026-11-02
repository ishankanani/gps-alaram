import { describe, expect, it, vi } from 'vitest';

import { DICTIONARIES, translator, type Lang } from '../../../i18n';
import { dayLabel, dayTime, formatClock, formatPercent, formatSpan, fullDate, monthLabel, nbsp, plural, pluralForm } from '../format';

// Hoisted above the imports by vitest: the history module reads files, the dictionaries the locale.
vi.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'en' }] }));
vi.mock('expo-file-system', () => ({ File: class {}, Paths: { document: '' } }));

const en = translator('en');
const de = translator('de');
const NOW = new Date(2026, 9, 11, 9, 0).getTime();

describe('activity formatting', () => {
  it('formats clock times in 24 and 12 hours', () => {
    const t = new Date(2026, 9, 11, 7, 5).getTime();
    expect(formatClock(t, true, en)).toBe('07:05');
    expect(formatClock(t, false, en)).toBe('7:05 am');
    expect(formatClock(new Date(2026, 9, 11, 0, 30).getTime(), false, en)).toBe('12:30 am');
    expect(formatClock(new Date(2026, 9, 11, 18, 40).getTime(), false, en)).toBe('6:40 pm');
  });

  it('names days relative to today', () => {
    expect(dayLabel(new Date(2026, 9, 11, 0, 1).getTime(), NOW, en)).toBe('Today');
    expect(dayLabel(new Date(2026, 9, 10, 23, 59).getTime(), NOW, en)).toBe('Yesterday');
    expect(dayLabel(new Date(2026, 9, 6, 12, 0).getTime(), NOW, en)).toBe('Tue 6 Oct');
    expect(dayLabel(new Date(2025, 11, 31, 12, 0).getTime(), NOW, en)).toBe('Wed, 31 Dec 2025');
    expect(dayTime(new Date(2026, 9, 10, 18, 40).getTime(), NOW, true, en)).toBe('Yesterday, 18:40');
  });

  it('formats months and full dates', () => {
    expect(monthLabel({ year: 2026, month: 9 }, en)).toBe('October 2026');
    expect(fullDate(NOW, en)).toBe('Sun, 11 Oct 2026');
  });

  it('picks plural forms per language', () => {
    expect(pluralForm('en', 1)).toBe('one');
    expect(pluralForm('en', 0)).toBe('other');
    expect(pluralForm('fr', 0)).toBe('one');
    expect(pluralForm('ja', 1)).toBe('other');
    expect(plural(en, 'en', 'activity.stat.onTimeCaption', 11, { total: 12 })).toBe('11 of 12 trips');
    expect(plural(en, 'en', 'activity.stat.onTimeCaption', 1, { total: 1 })).toBe('1 of 1 trip');
    // German text with German plural rules.
    expect(plural(de, 'de', 'onboarding.setup.toFix', 2)).toBe('2 Punkte zu beheben');
  });

  it('agrees with Intl.PluralRules for every language and whole count', () => {
    for (const lang of Object.keys(DICTIONARIES) as Lang[]) {
      const rules = new Intl.PluralRules(lang);
      for (let n = 0; n <= 400; n++) expect(pluralForm(lang, n), `${lang} ${n}`).toBe(rules.select(n));
    }
  });

  it('has the Polish, Czech and Arabic plural forms in the dictionaries', () => {
    const pl = translator('pl');
    expect(plural(pl, 'pl', 'settings.offlineMaps.value', 1, { size: '3 MB' })).toBe('1 obszar · 3 MB');
    expect(plural(pl, 'pl', 'settings.offlineMaps.value', 3, { size: '3 MB' })).toBe('3 obszary · 3 MB');
    expect(plural(pl, 'pl', 'settings.offlineMaps.value', 12, { size: '3 MB' })).toBe('12 obszarów · 3 MB');
    expect(plural(pl, 'pl', 'settings.offlineMaps.value', 22, { size: '3 MB' })).toBe('22 obszary · 3 MB');
    const cs = translator('cs');
    expect(plural(cs, 'cs', 'onboarding.setup.toFix', 3)).toBe('3 věci k opravě');
    expect(plural(cs, 'cs', 'onboarding.setup.toFix', 5)).toBe('5 věcí k opravě');
    const ar = translator('ar');
    expect(plural(ar, 'ar', 'onboarding.setup.toFix', 2)).toBe('2 عنصران للإصلاح');
    expect(plural(ar, 'ar', 'onboarding.setup.toFix', 11)).toBe('11 عنصرًا للإصلاح');
    // A language that spells out only one and other uses .other for the rest.
    expect(plural(translator('es'), 'es', 'onboarding.setup.toFix', 3)).toBe('3 cosas por corregir');
    expect(plural(translator('zh'), 'zh', 'onboarding.setup.toFix', 1)).toBe('1 项待修复');
  });

  it('formats spans, percentages and units', () => {
    expect(formatSpan(20_000)).toBe('<1 min');
    expect(formatSpan(23 * 60_000)).toBe('23 min');
    expect(formatSpan(400 * 60_000)).toBe('6 h 40 min');
    expect(formatSpan(120 * 60_000)).toBe('2 h');
    expect(formatPercent(91.7, 'en')).toBe('92%');
    expect(formatPercent(91.7, 'de')).toBe('92 %');
    expect(formatPercent(91.7, 'tr')).toBe('%92');
    expect(formatPercent(91.7, 'cs')).toBe('92\u00a0%');
    expect(formatPercent(91.7, 'pl')).toBe('92%');
    expect(formatPercent(91.7, 'ar')).toBe('92%');
    expect(nbsp('14.2 km · 23 min')).toBe('14.2 km · 23 min');
  });
});
