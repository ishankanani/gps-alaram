import type { RootScreenProps } from '../../navigation/types';
import { CountriesScreen as LegacyCountriesScreen } from '../CountriesScreen';

/**
 * Route `Countries` (ui-direction-a 4.3): package L replaces this file. Until then it hosts the
 * pre-1.0 country downloads screen.
 */
export function CountriesScreen({ navigation }: RootScreenProps<'Countries'>) {
  return <LegacyCountriesScreen onBack={() => navigation.goBack()} />;
}
