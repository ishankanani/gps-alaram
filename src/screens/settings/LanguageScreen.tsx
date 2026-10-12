import { StyleSheet } from 'react-native';

import { deviceLanguage, LANGUAGES, useI18n, type Key, type Lang } from '../../i18n';
import type { RootScreenProps } from '../../navigation/types';
import { useSavedData } from '../../state/saved';
import { haptics, ListItem, Screen, Section } from '../../ui';

/**
 * Language (ui-direction-a 4.3 Settings; a modal from onboarding, a card from Settings): follow the
 * phone, or one of the 11 languages by its own name. A choice applies at once (the whole app
 * re-renders in it, the alarm screen too) and closes the list.
 */
export function LanguageScreen({ navigation, route }: RootScreenProps<'Language'>) {
  const { t: tr } = useI18n();
  const saved = useSavedData();
  const modal = route.params?.presentation === 'modal';
  const chosen = saved.data.preferences.language;
  const phone = deviceLanguage();
  const nativeName = (code: Lang) => LANGUAGES.find((l) => l.code === code)?.name ?? code;

  function choose(language: Lang | null) {
    if (language !== chosen) {
      haptics.selection();
      saved.setPreferences((p) => ({ ...p, language }));
    }
    navigation.goBack();
  }

  return (
    <Screen topBar={{ title: tr('settings.language'), leading: modal ? 'close' : 'back' }} testID="screen-Language">
      <Section first>
        <ListItem
          title={tr('settings.language.phone')}
          subtitle={nativeName(phone)}
          selected={chosen == null}
          onPress={() => choose(null)}
          testID="language-phone"
        />
      </Section>
      <Section style={styles.list}>
        {LANGUAGES.map((l) => (
          <ListItem
            key={l.code}
            title={l.name}
            subtitle={tr(`settings.language.name.${l.code}` as Key)}
            selected={chosen === l.code}
            onPress={() => choose(l.code)}
            testID={`language-${l.code}`}
          />
        ))}
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { marginTop: 24 },
});
