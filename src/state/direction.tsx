import { useEffect } from 'react';
import { I18nManager, Platform } from 'react-native';

import { isRtlLanguage, useI18n } from '../i18n';
import { useDialogs } from '../ui/components/ConfirmDialog';

/**
 * Keeps the layout direction in step with the app language (Arabic is right to left). The phone's
 * direction follows its own language, but the app language is a choice of its own, so the saved
 * RTL flags are always set from it: allowRTL and forceRTL are stored and read when the app starts
 * (the layout direction cannot change while it runs). When the running direction differs, say so
 * once and ask for a restart (docs.expo.dev/guides/localization, "Dynamically overriding RTL
 * settings"; we have no expo-updates to reload for the user). Maps stay left to right.
 */
export function DirectionSync() {
  const { lang, t: tr } = useI18n();
  const dialogs = useDialogs();

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const rtl = isRtlLanguage(lang);
    I18nManager.allowRTL(rtl);
    I18nManager.forceRTL(rtl);
    if (I18nManager.isRTL !== rtl) {
      void dialogs.alert({
        title: tr('settings.language.restartTitle'),
        message: tr('settings.language.restartBody'),
        buttonLabel: tr('common.done'),
        icon: 'translate',
      });
    }
    // Only a language change matters; the dialog text is whatever language is on screen now.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  return null;
}
