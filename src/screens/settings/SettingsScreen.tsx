import type { RootScreenProps } from '../../navigation/types';
import { useSavedData } from '../../state/saved';
import { SettingsScreen as LegacySettingsScreen } from '../SettingsScreen';

/**
 * Route `Settings` (ui-direction-a 4.3): package L replaces this file with the grouped Settings.
 * Until then it hosts the pre-1.0 settings screen.
 */
export function SettingsScreen({ navigation }: RootScreenProps<'Settings'>) {
  const saved = useSavedData();
  return (
    <LegacySettingsScreen
      preferences={saved.data.preferences}
      onChange={saved.setPreferences}
      onOpenSetup={() => navigation.navigate('Setup', { entry: 'settings' })}
      onOpenCountries={() => navigation.navigate('Countries')}
      onOpenPro={(reason) => navigation.navigate('Paywall', { reason })}
      onBack={() => navigation.goBack()}
    />
  );
}
