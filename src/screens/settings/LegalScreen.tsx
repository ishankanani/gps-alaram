import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { useI18n, type Key } from '../../i18n';
import type { RootScreenProps } from '../../navigation/types';
import { AppText, Card, Icon, ListItem, Screen, Section, type IconName } from '../../ui';
import { openPage, useAppLinks } from './appLinks';

const FACTS: { icon: IconName; text: Key }[] = [
  { icon: 'map-marker-radius-outline', text: 'settings.legal.location' },
  { icon: 'cellphone-lock', text: 'settings.legal.history' },
  { icon: 'account-outline', text: 'settings.legal.account' },
  { icon: 'eye-off-outline', text: 'settings.legal.noAds' },
];

/**
 * Legal: what StopWake keeps, in four plain sentences, and the full privacy policy, terms and
 * account-deletion pages (served by StopWake Cloud, opened in a browser tab). With `doc`, that page
 * opens straight away (the sign-up consent line links here).
 */
export function LegalScreen({ navigation, route }: RootScreenProps<'Legal'>) {
  const { t: tr } = useI18n();
  const links = useAppLinks();
  const doc = route.params?.doc;
  const opened = useRef(false);

  const docUrl = doc === 'privacy' ? links.privacyUrl : doc === 'terms' ? links.termsUrl : null;
  useEffect(() => {
    if (!docUrl || opened.current) return;
    opened.current = true;
    void openPage(docUrl);
  }, [docUrl]);

  const pages: { key: string; icon: IconName; label: Key; url: string | null }[] = [
    { key: 'privacy', icon: 'shield-account-outline', label: 'settings.privacy', url: links.privacyUrl },
    { key: 'terms', icon: 'file-document-outline', label: 'settings.terms', url: links.termsUrl },
    { key: 'deletion', icon: 'account-remove-outline', label: 'settings.legal.deletion', url: links.accountDeletionUrl },
  ];
  const available = pages.filter((p) => p.url);

  return (
    <Screen topBar={{ title: tr('settings.legal.title') }} testID="screen-Legal">
      <Card title={tr('settings.legal.summary')} style={styles.card}>
        {FACTS.map((fact) => (
          <View key={fact.text} style={styles.fact}>
            <Icon name={fact.icon} size={20} color="primary" />
            <AppText variant="bodyM" style={styles.factText}>
              {tr(fact.text)}
            </AppText>
          </View>
        ))}
      </Card>

      <Section footer={available.length ? undefined : tr('settings.legal.notInBuild')}>
        {available.map((page) => (
          <ListItem
            key={page.key}
            icon={page.icon}
            title={tr(page.label)}
            trailing={<Icon name="open-in-new" size={20} color="textTertiary" />}
            accessibilityHint={tr('settings.opensBrowser')}
            onPress={() => page.url && void openPage(page.url)}
            testID={`legal-${page.key}`}
          />
        ))}
        <ListItem icon="license" title={tr('settings.licences')} chevron onPress={() => navigation.navigate('Licences')} testID="legal-licences" />
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, marginTop: 8, marginBottom: 24 },
  fact: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  factText: { flex: 1 },
});
