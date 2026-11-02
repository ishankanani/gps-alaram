import { getLocales } from 'expo-localization';
import { createContext, useContext } from 'react';

import { ar } from './ar';
import { cs } from './cs';
import { da } from './da';
import { de } from './de';
import { en, type Dictionary, type Strings } from './en';
import { es } from './es';
import { fi } from './fi';
import { fr } from './fr';
import { hi } from './hi';
import { it } from './it';
import { ja } from './ja';
import { ko } from './ko';
import { nb } from './nb';
import { nl } from './nl';
import { pl } from './pl';
import { pt } from './pt';
import { sv } from './sv';
import { tr } from './tr';
import { zh } from './zh';

export type Lang =
  | 'ar'
  | 'cs'
  | 'da'
  | 'de'
  | 'en'
  | 'es'
  | 'fi'
  | 'fr'
  | 'hi'
  | 'it'
  | 'ja'
  | 'ko'
  | 'nb'
  | 'nl'
  | 'pl'
  | 'pt'
  | 'sv'
  | 'tr'
  | 'zh';
export type Key = keyof Strings;
export type Params = Record<string, string | number>;
export type T = (key: Key, params?: Params) => string;

/** In the order the picker shows them; names are written in their own language. */
export const LANGUAGES: { code: Lang; name: string }[] = [
  { code: 'cs', name: 'Čeština' },
  { code: 'da', name: 'Dansk' },
  { code: 'de', name: 'Deutsch' },
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' },
  { code: 'fr', name: 'Français' },
  { code: 'it', name: 'Italiano' },
  { code: 'nl', name: 'Nederlands' },
  { code: 'nb', name: 'Norsk' },
  { code: 'pl', name: 'Polski' },
  { code: 'pt', name: 'Português' },
  { code: 'fi', name: 'Suomi' },
  { code: 'sv', name: 'Svenska' },
  { code: 'tr', name: 'Türkçe' },
  { code: 'ar', name: 'العربية' },
  { code: 'hi', name: 'हिन्दी' },
  { code: 'ja', name: '日本語' },
  { code: 'ko', name: '한국어' },
  { code: 'zh', name: '简体中文' },
];

export const DICTIONARIES: Record<Lang, Dictionary> = { ar, cs, da, de, en, es, fi, fr, hi, it, ja, ko, nb, nl, pl, pt, sv, tr, zh };

/** Languages written right to left. Only the layout direction follows this; maps stay left to right. */
export const RTL_LANGUAGES: readonly Lang[] = ['ar'];

export const isRtlLanguage = (lang: Lang): boolean => RTL_LANGUAGES.includes(lang);

/** Phones report Norwegian as "nb", "no" or "nn"; we have Bokmål. Chinese is the Simplified script. */
const ALIASES: Record<string, Lang> = { no: 'nb', nn: 'nb' };

/**
 * Our Lang for a phone locale: the language code ("de"), or for Chinese the script or region
 * (zh-Hans, zh-CN and zh-SG are Simplified; zh-Hant, zh-TW, zh-HK get English: we have no
 * Traditional text). Portuguese from Brazil and Portugal is one dictionary.
 */
export function languageFromLocale(locale: {
  languageCode?: string | null;
  languageTag?: string | null;
  regionCode?: string | null;
}): Lang {
  const code = (locale.languageCode ?? locale.languageTag?.split(/[-_]/)[0] ?? '').toLowerCase();
  if (code === 'zh') {
    const script = /[-_](hans|hant)(?![a-z])/i.exec(locale.languageTag ?? '')?.[1]?.toLowerCase();
    const region = (locale.regionCode ?? '').toUpperCase();
    if (script === 'hans') return 'zh';
    if (script === 'hant' || ['TW', 'HK', 'MO'].includes(region)) return 'en';
    return 'zh';
  }
  if (code in DICTIONARIES) return code as Lang;
  return ALIASES[code] ?? 'en';
}

/** The phone's language if we have it, otherwise English. */
export function deviceLanguage(): Lang {
  try {
    const locale = getLocales()[0];
    return locale ? languageFromLocale(locale) : 'en';
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
