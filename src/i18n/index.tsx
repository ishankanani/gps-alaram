import { getLocales } from 'expo-localization';
import { createContext, useContext } from 'react';

import { da } from './da';
import { de } from './de';
import { en, type Strings } from './en';
import { fi } from './fi';
import { fr } from './fr';
import { hi } from './hi';
import { it } from './it';
import { ja } from './ja';
import { nb } from './nb';
import { nl } from './nl';
import { sv } from './sv';

export type Lang = 'da' | 'de' | 'en' | 'fi' | 'fr' | 'hi' | 'it' | 'ja' | 'nb' | 'nl' | 'sv';
export type Key = keyof Strings;
export type Params = Record<string, string | number>;
export type T = (key: Key, params?: Params) => string;

/** In the order the picker shows them; names are written in their own language. */
export const LANGUAGES: { code: Lang; name: string }[] = [
  { code: 'da', name: 'Dansk' },
  { code: 'de', name: 'Deutsch' },
  { code: 'en', name: 'English' },
  { code: 'fr', name: 'Français' },
  { code: 'it', name: 'Italiano' },
  { code: 'nl', name: 'Nederlands' },
  { code: 'nb', name: 'Norsk' },
  { code: 'fi', name: 'Suomi' },
  { code: 'sv', name: 'Svenska' },
  { code: 'hi', name: 'हिन्दी' },
  { code: 'ja', name: '日本語' },
];

export const DICTIONARIES: Record<Lang, Partial<Strings>> = { da, de, en, fi, fr, hi, it, ja, nb, nl, sv };

/** Phones report Norwegian as "nb", "no" or "nn"; we have Bokmål. */
const ALIASES: Record<string, Lang> = { no: 'nb', nn: 'nb' };

/** The phone's language if we have it, otherwise English. */
export function deviceLanguage(): Lang {
  try {
    const code = getLocales()[0]?.languageCode ?? '';
    if (code in DICTIONARIES) return code as Lang;
    return ALIASES[code] ?? 'en';
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
