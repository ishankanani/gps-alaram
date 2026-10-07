import { getLocales } from 'expo-localization';
import { createContext, useContext } from 'react';

import { de } from './de';
import { en, type Strings } from './en';
import { hi } from './hi';

export type Lang = 'de' | 'en' | 'hi';
export type Key = keyof Strings;
export type Params = Record<string, string | number>;
export type T = (key: Key, params?: Params) => string;

/** In the order the picker shows them; names are written in their own language. */
export const LANGUAGES: { code: Lang; name: string }[] = [
  { code: 'de', name: 'Deutsch' },
  { code: 'en', name: 'English' },
  { code: 'hi', name: 'हिन्दी' },
];

export const DICTIONARIES: Record<Lang, Strings> = { de, en, hi };

/** The phone's language if we have it, otherwise English. */
export function deviceLanguage(): Lang {
  try {
    const code = getLocales()[0]?.languageCode;
    return code === 'de' || code === 'hi' ? code : 'en';
  } catch {
    return 'en';
  }
}

export function translator(lang: Lang): T {
  const dict = DICTIONARIES[lang];
  return (key, params) => {
    let text = dict[key] ?? en[key];
    if (params) {
      for (const [name, value] of Object.entries(params)) text = text.split(`{${name}}`).join(String(value));
    }
    return text;
  };
}

type I18n = { lang: Lang; t: T };

const I18nContext = createContext<I18n>({ lang: 'en', t: translator('en') });

export const I18nProvider = I18nContext.Provider;

export function useI18n(): I18n {
  return useContext(I18nContext);
}
