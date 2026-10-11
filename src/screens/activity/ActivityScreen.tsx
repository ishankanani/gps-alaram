import { useI18n } from '../../i18n';
import { PlaceholderScreen } from '../../navigation/PlaceholderScreen';

/**
 * Route `ActivityTab` (ui-direction-a 4.3 "Activity"; params in src/navigation/types.ts): package
 * L builds this screen. A placeholder until then.
 */
export function ActivityScreen() {
  const { t: tr } = useI18n();
  return <PlaceholderScreen presentation="tab" title={tr('nav.tab.activity')} testID="screen-ActivityTab" />;
}
