import { StyleSheet } from 'react-native';

import { useI18n } from '../../i18n';
import { PlaceholderScreen } from '../../navigation/PlaceholderScreen';
import type { TabScreenProps } from '../../navigation/types';
import { useIsAdmin } from '../../state/session';
import { ListItem } from '../../ui/components/ListItem';
import { Section } from '../../ui/components/Section';

/**
 * Route `AccountTab` (ui-direction-a 4.3 "Account"): package A builds this screen. Until then a
 * placeholder that keeps Settings, the alarm checklist, Pro and (for admins) the admin area
 * reachable.
 */
export function AccountScreen({ navigation }: TabScreenProps<'AccountTab'>) {
  const { t: tr } = useI18n();
  const admin = useIsAdmin();
  return (
    <PlaceholderScreen presentation="tab" title={tr('nav.tab.account')} testID="screen-AccountTab">
      <Section style={styles.section}>
        <ListItem icon="cog-outline" title={tr('settings.title')} chevron onPress={() => navigation.navigate('Settings')} />
        <ListItem
          icon="shield-check-outline"
          title={tr('settings.setup')}
          chevron
          onPress={() => navigation.navigate('Setup', { entry: 'account' })}
        />
        <ListItem icon="crown-outline" title={tr('settings.pro')} chevron onPress={() => navigation.navigate('Paywall', {})} />
        {admin ? (
          <ListItem icon="shield-crown-outline" title={tr('nav.admin')} chevron onPress={() => navigation.navigate('AdminHome')} />
        ) : null}
      </Section>
    </PlaceholderScreen>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 16 },
});
