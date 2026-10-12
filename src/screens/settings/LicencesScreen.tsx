import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useI18n } from '../../i18n';
import { AppText, Button, Icon, ListItem, Screen, Section } from '../../ui';
import { openPage } from './appLinks';
import { LICENCES, type LicenceItem } from './licences';

/**
 * Open-source licences (ui-direction-a 4.3 Settings): one row per project or data source with its
 * licence; tapping a row shows the full text below it.
 */
export function LicencesScreen() {
  const { t: tr } = useI18n();
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Screen topBar={{ title: tr('settings.licences') }} testID="screen-Licences">
      <AppText variant="bodyM" color="textSecondary" style={styles.intro}>
        {tr('settings.licences.intro')}
      </AppText>
      <Section>
        {LICENCES.map((item) => (
          <LicenceRow key={item.id} item={item} open={open === item.id} onToggle={() => setOpen(open === item.id ? null : item.id)} />
        ))}
      </Section>
    </Screen>
  );
}

function LicenceRow({ item, open, onToggle }: { item: LicenceItem; open: boolean; onToggle: () => void }) {
  const { t: tr } = useI18n();
  return (
    <View>
      <ListItem
        title={item.name}
        subtitle={`${item.licence} · ${item.holder}`}
        subtitleLines={2}
        trailing={<Icon name={open ? 'chevron-up' : 'chevron-down'} size={20} color="textTertiary" />}
        onPress={onToggle}
        accessibilityHint={open ? undefined : tr('settings.licences.show')}
        testID={`licence-${item.id}`}
      />
      {open ? (
        <View style={styles.text}>
          <AppText variant="bodyS" color="textSecondary" selectable>
            {item.text}
          </AppText>
          <Button label={tr('settings.licences.readOnline')} variant="ghost" size="S" icon="open-in-new" onPress={() => void openPage(item.url)} style={styles.link} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  intro: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 },
  text: { paddingHorizontal: 16, paddingBottom: 16, gap: 8 },
  link: { alignSelf: 'flex-start', marginLeft: -14 },
});
