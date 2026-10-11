import { useI18n } from '../../i18n';
import type { RootScreenProps } from '../../navigation/types';
import { useSavedData } from '../../state/saved';
import { OnboardingScreen as LegacyOnboardingScreen } from '../OnboardingScreen';

/**
 * Route `Onboarding` (ui-direction-a 4.3, first launch only): package L replaces this file. Until
 * then it hosts the pre-1.0 welcome screen. Finishing it lands on the map with Setup on top.
 */
export function OnboardingScreen({ navigation }: RootScreenProps<'Onboarding'>) {
  const { lang } = useI18n();
  const saved = useSavedData();
  return (
    <LegacyOnboardingScreen
      onLanguage={(language) => saved.setPreferences((p) => ({ ...p, language }))}
      onDone={() => {
        saved.setPreferences((p) => ({ ...p, language: lang, onboarded: true }));
        navigation.reset({ index: 1, routes: [{ name: 'Tabs' }, { name: 'Setup', params: { entry: 'onboarding' } }] });
      }}
    />
  );
}
