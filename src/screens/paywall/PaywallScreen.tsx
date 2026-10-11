import type { RootScreenProps } from '../../navigation/types';
import { ProScreen } from '../ProScreen';

/**
 * Route `Paywall` (ui-direction-a 4.3, a modal): package A replaces this file. Until then it hosts
 * the pre-1.0 Pro screen, opened with the reason that led here.
 */
export function PaywallScreen({ navigation, route }: RootScreenProps<'Paywall'>) {
  return <ProScreen reason={route.params?.reason ?? null} onBack={() => navigation.goBack()} />;
}
