import { describe, expect, it, vi } from 'vitest';

import { DICTIONARIES, deviceLanguage, isRtlLanguage, LANGUAGES, languageFromLocale, translator, type Lang } from '..';
import { ADMIN_KEYS, en, type PluralBase } from '../en';

// Hoisted above the imports by vitest.
vi.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'de' }] }));

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('dictionaries', () => {
  // The admin area is staff-facing and English only: other languages fall back to English.
  const keys = (Object.keys(en) as (keyof typeof en)[]).filter((key) => !ADMIN_KEYS.has(key));

  for (const lang of Object.keys(DICTIONARIES) as Lang[]) {
    it(`${lang} has every string, non-empty, with the same placeholders`, () => {
      const dict = DICTIONARIES[lang];
      for (const key of keys) {
        expect(dict[key], `${lang} ${key}`).toBeTruthy();
        expect(placeholders(dict[key] ?? ''), `${lang} ${key}`).toEqual(placeholders(en[key]));
      }
    });
  }

  it('has all 19 languages, each in the picker under its own name and named in every dictionary', () => {
    const codes = Object.keys(DICTIONARIES).sort();
    expect(codes).toEqual(['ar', 'cs', 'da', 'de', 'en', 'es', 'fi', 'fr', 'hi', 'it', 'ja', 'ko', 'nb', 'nl', 'pl', 'pt', 'sv', 'tr', 'zh']);
    expect(LANGUAGES.map((l) => l.code).sort()).toEqual(codes);
    expect(LANGUAGES.find((l) => l.code === 'zh')?.name).toBe('简体中文');
    for (const code of codes) expect(en[`settings.language.name.${code}` as keyof typeof en], code).toBeTruthy();
  });

  // Languages with more than one and other need the extra forms of every plural key.
  const PLURAL_BASES = (Object.keys(en) as string[]).filter((k) => k.endsWith('.one')).map((k) => k.slice(0, -4)) as PluralBase[];
  for (const lang of Object.keys(DICTIONARIES) as Lang[]) {
    it(`${lang} spells out every plural form it uses`, () => {
      const categories = new Intl.PluralRules(lang).resolvedOptions().pluralCategories.filter((c) => c !== 'one' && c !== 'other');
      // Czech "many" and Spanish "many" are only for fractions and millions: no whole count we show reaches them.
      const reachable = categories.filter((c) => [...Array(400).keys()].some((n) => new Intl.PluralRules(lang).select(n) === c));
      const dict = DICTIONARIES[lang] as Record<string, string | undefined>;
      for (const base of PLURAL_BASES) {
        for (const form of reachable) expect(dict[`${base}.${form}`], `${lang} ${base}.${form}`).toBeTruthy();
        for (const form of ['one', 'few', 'many', 'two', 'zero', 'other']) {
          const text = dict[`${base}.${form}`];
          if (text) expect(placeholders(text), `${lang} ${base}.${form}`).toEqual(placeholders(en[`${base}.other` as keyof typeof en]));
        }
      }
    });
  }

  it('detects the phone language, Chinese by script or region and Portuguese from either country', () => {
    expect(languageFromLocale({ languageCode: 'zh', languageTag: 'zh-Hans-CN', regionCode: 'CN' })).toBe('zh');
    expect(languageFromLocale({ languageCode: 'zh', languageTag: 'zh-CN', regionCode: 'CN' })).toBe('zh');
    expect(languageFromLocale({ languageCode: 'zh', languageTag: 'zh-SG', regionCode: 'SG' })).toBe('zh');
    expect(languageFromLocale({ languageCode: 'zh', languageTag: 'zh-Hans-TW', regionCode: 'TW' })).toBe('zh');
    expect(languageFromLocale({ languageCode: 'zh', languageTag: 'zh-Hant-TW', regionCode: 'TW' })).toBe('en');
    expect(languageFromLocale({ languageCode: 'zh', languageTag: 'zh-HK', regionCode: 'HK' })).toBe('en');
    expect(languageFromLocale({ languageCode: 'pt', languageTag: 'pt-BR', regionCode: 'BR' })).toBe('pt');
    expect(languageFromLocale({ languageCode: 'pt', languageTag: 'pt-PT', regionCode: 'PT' })).toBe('pt');
    expect(languageFromLocale({ languageCode: 'ar', languageTag: 'ar-EG', regionCode: 'EG' })).toBe('ar');
    expect(languageFromLocale({ languageCode: 'no', languageTag: 'no-NO' })).toBe('nb');
    expect(languageFromLocale({ languageCode: 'nn', languageTag: 'nn-NO' })).toBe('nb');
    expect(languageFromLocale({ languageCode: null, languageTag: 'ko-KR' })).toBe('ko');
    expect(languageFromLocale({ languageCode: 'xx', languageTag: 'xx' })).toBe('en');
    for (const lang of ['es', 'pl', 'cs', 'tr', 'ko']) expect(languageFromLocale({ languageCode: lang }), lang).toBe(lang);
  });

  it('writes only Arabic right to left', () => {
    expect((Object.keys(DICTIONARIES) as Lang[]).filter(isRtlLanguage)).toEqual(['ar']);
  });

  it('fills placeholders', () => {
    expect(translator('de')('place.minutesBefore', { minutes: 2 })).toBe('2 Min. vorher');
    expect(translator('en')('done.save', { name: 'Ulm Hbf' })).toBe('Save Ulm Hbf?');
    expect(translator('pl')('place.minutesBefore', { minutes: 2 })).toBe('2 min przed');
    expect(translator('zh')('place.minutesBefore', { minutes: 2 })).toBe('提前 2 分钟');
  });

  it('defaults to the phone language', () => {
    expect(deviceLanguage()).toBe('de');
  });
});
