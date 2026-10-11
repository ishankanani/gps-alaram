import { PlaceholderScreen } from '../../navigation/PlaceholderScreen';
import type { RootScreenProps } from '../../navigation/types';

/**
 * Route `Language` (ui-direction-a 4.3 "Settings"; a modal when opened from onboarding, a card
 * from Settings): package L builds this screen. A placeholder until then.
 */
export function LanguageScreen({ route }: RootScreenProps<'Language'>) {
  return <PlaceholderScreen presentation={route.params?.presentation === 'modal' ? 'modal' : 'card'} testID="screen-Language" />;
}
