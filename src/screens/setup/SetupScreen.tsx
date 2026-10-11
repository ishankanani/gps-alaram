import { useI18n } from '../../i18n';
import { goToMap } from '../../navigation/ref';
import type { RootScreenProps } from '../../navigation/types';
import { useSavedData } from '../../state/saved';
import { useTrip } from '../../state/trip';
import { SetupScreen as LegacySetupScreen } from '../SetupScreen';

/**
 * Route `Setup` (ui-direction-a 4.3, merged with Permissions as "Get ready"): package L replaces
 * this file. Until then it hosts the pre-1.0 checklist. Opened for a waiting trip (entry 'trip'),
 * Continue starts that trip.
 */
export function SetupScreen({ navigation, route }: RootScreenProps<'Setup'>) {
  const { t: tr } = useI18n();
  const saved = useSavedData();
  const trip = useTrip();
  const pending = route.params?.entry === 'trip' ? trip.pending : null;
  const leave = () => (navigation.canGoBack() ? navigation.goBack() : goToMap());
  return (
    <LegacySetupScreen
      strength={pending?.wake.strength ?? saved.data.preferences.strength}
      continueLabel={pending ? tr('place.start') : tr('common.continue')}
      onContinue={() => (pending ? void trip.launch(pending) : leave())}
      onBack={leave}
    />
  );
}
