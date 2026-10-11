import { useEffect } from 'react';

import { PlaceholderScreen } from '../../navigation/PlaceholderScreen';
import { resolveRequest } from '../../navigation/results';
import type { RootScreenProps } from '../../navigation/types';

/**
 * Route `CountryPicker` (ui-direction-a 4.1; a full-screen modal with its own search): package D
 * builds this screen. It answers `route.params.requestId` through resolveRequest() with the chosen
 * ISO codes (string[]), or null when closed. A placeholder until then: it answers null.
 */
export function CountryPickerScreen({ navigation, route }: RootScreenProps<'CountryPicker'>) {
  const { requestId } = route.params;
  useEffect(() => navigation.addListener('beforeRemove', () => resolveRequest<string[]>(requestId, null)), [navigation, requestId]);
  return <PlaceholderScreen presentation="modal" testID="screen-CountryPicker" />;
}
