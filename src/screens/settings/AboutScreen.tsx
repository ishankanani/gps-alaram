import { Image, StyleSheet, View } from 'react-native';

import { useI18n } from '../../i18n';
import type { RootScreenProps } from '../../navigation/types';
import { AppText, KeyValueRow, ListItem, Screen, Section } from '../../ui';
import { versionInfo } from './appLinks';

const APP_ICON = require('../../../assets/icon.png') as number;

/** About StopWake (ui-direction-a 4.3 Settings): the app, its version and where its data comes from. */
export function AboutScreen({ navigation }: RootScreenProps<'About'>) {
  const { t: tr } = useI18n();
  const { version, build } = versionInfo();
  const sources = [
    { label: tr('settings.about.map'), value: 'OpenFreeMap · OpenStreetMap' },
    { label: tr('settings.about.stopsGermany'), value: 'DB InfraGO (CC BY 4.0)' },
    { label: tr('settings.about.stopsElsewhere'), value: 'OpenStreetMap (ODbL)' },
    { label: tr('settings.about.addresses'), value: 'Photon by komoot' },
  ];
  return (
    <Screen topBar={{ title: tr('settings.aboutRow') }} testID="screen-About">
      <View style={styles.hero}>
        <Image source={APP_ICON} style={styles.icon} accessibilityIgnoresInvertColors />
        <AppText variant="titleM" align="center">
          {tr('app.name')}
        </AppText>
        <AppText variant="bodyM" color="textSecondary" align="center" tabular selectable>
          {build ? tr('settings.about.version', { version, build }) : tr('settings.version', { version })}
        </AppText>
        <AppText variant="bodyM" color="textSecondary" align="center">
          {tr('settings.about.tagline')}
        </AppText>
      </View>
      <Section title={tr('settings.about.sources')}>
        {sources.map((s, i) => (
          <KeyValueRow key={s.label} label={s.label} value={s.value} last={i === sources.length - 1} />
        ))}
      </Section>
      <Section style={styles.links}>
        <ListItem icon="license" title={tr('settings.licences')} chevron onPress={() => navigation.navigate('Licences')} />
        <ListItem icon="scale-balance" title={tr('settings.legal.title')} chevron onPress={() => navigation.navigate('Legal')} />
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: 4, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  icon: { width: 72, height: 72, borderRadius: 16, marginBottom: 12 },
  links: { marginTop: 24 },
});
