import { useEffect, useMemo, type ReactNode } from 'react';

import { TripAlarm } from '../../modules/trip-alarm/src';
import { setApiLanguage } from '../api';
import { deviceLanguage, I18nProvider, translator, type Lang } from '../i18n';
import { useSavedData } from './saved';

/**
 * The app language: the one picked in the app, otherwise the phone's (English when we don't have
 * it). The native alarm screen and notifications follow it too.
 */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const { data } = useSavedData();
  const deviceLang = useMemo(() => deviceLanguage(), []);
  const lang: Lang = data.preferences.language ?? deviceLang;
  const i18n = useMemo(() => ({ lang, t: translator(lang) }), [lang]);

  // The alarm screen and notifications are native, and the server answers in the app language
  // (Accept-Language, remote config texts): tell them the language too.
  useEffect(() => {
    TripAlarm?.setLanguage(lang);
    setApiLanguage(lang);
  }, [lang]);

  return <I18nProvider value={i18n}>{children}</I18nProvider>;
}
