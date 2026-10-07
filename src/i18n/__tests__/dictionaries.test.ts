import { describe, expect, it, vi } from 'vitest';

import { DICTIONARIES, deviceLanguage, translator, type Lang } from '..';
import { en } from '../en';

// Hoisted above the imports by vitest.
vi.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'de' }] }));

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('dictionaries', () => {
  for (const lang of Object.keys(DICTIONARIES) as Lang[]) {
    it(`${lang} has every string, non-empty, with the same placeholders`, () => {
      const dict = DICTIONARIES[lang];
      for (const key of Object.keys(en) as (keyof typeof en)[]) {
        expect(dict[key], `${lang} ${key}`).toBeTruthy();
        expect(placeholders(dict[key]), `${lang} ${key}`).toEqual(placeholders(en[key]));
      }
    });
  }

  it('fills placeholders', () => {
    expect(translator('de')('place.minutesBefore', { minutes: 2 })).toBe('2 Min. vorher');
    expect(translator('en')('done.save', { name: 'Ulm Hbf' })).toBe('Save Ulm Hbf?');
  });

  it('defaults to the phone language', () => {
    expect(deviceLanguage()).toBe('de');
  });
});
