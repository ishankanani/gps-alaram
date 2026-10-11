import { useI18n } from '../../i18n';
import { PlaceholderScreen } from '../../navigation/PlaceholderScreen';

/**
 * Route `SavedTab` (ui-direction-a 4.3 "Saved"; params in src/navigation/types.ts): package
 * L builds this screen. A placeholder until then.
 */
export function SavedScreen() {
  const { t: tr } = useI18n();
  return <PlaceholderScreen presentation="tab" title={tr('nav.tab.saved')} testID="screen-SavedTab" />;
}
