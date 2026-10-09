import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import app from '../../app.json';
import type { AlarmStrength } from '../../modules/trip-alarm/src';
import { LANGUAGES, useI18n, type Lang } from '../i18n';
import type { Preferences } from '../lib/prefs';
import { Body, Card, Divider, Icon, IconButton, Label, Row, Segmented, Title } from '../ui/components';
import { radius, useTheme } from '../ui/theme';
import { OfflineMapCard } from './settings/OfflineMapCard';

type Props = {
  preferences: Preferences;
  onChange: (prefs: Preferences) => void;
  onOpenSetup: () => void;
  onOpenCountries: () => void;
  onBack: () => void;
};

export function SettingsScreen({ preferences, onChange, onOpenSetup, onOpenCountries, onBack }: Props) {
  const t = useTheme();
  const { t: tr, lang } = useI18n();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={{ backgroundColor: t.background }}
      contentContainerStyle={[styles.root, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }]}>
      <IconButton icon="arrow-left" label={tr('common.back')} onPress={onBack} size={44} />
      <Title>{tr('settings.title')}</Title>

      <Card>
        <Label>{tr('settings.language')}</Label>
        {LANGUAGES.map((l, i) => (
          <View key={l.code}>
            {i > 0 ? <Divider /> : null}
            <LanguageRow code={l.code} name={l.name} selected={lang === l.code} onPress={() => onChange({ ...preferences, language: l.code })} />
          </View>
        ))}
      </Card>

      <Card>
        <Label>{tr('settings.units')}</Label>
        <Segmented<boolean>
          value={preferences.useMiles}
          onChange={(useMiles) => onChange({ ...preferences, useMiles })}
          options={[
            { value: false, label: tr('settings.units.km') },
            { value: true, label: tr('settings.units.mi') },
          ]}
        />
      </Card>

      <Card>
        <Label>{tr('settings.alarm')}</Label>
        <Segmented<AlarmStrength>
          value={preferences.strength}
          onChange={(strength) => onChange({ ...preferences, strength })}
          options={[
            { value: 'gentle', label: tr('strength.gentle') },
            { value: 'normal', label: tr('strength.normal') },
            { value: 'heavy', label: tr('strength.heavy') },
          ]}
        />
        <Body muted>{tr(`strength.${preferences.strength}.body`)}</Body>
      </Card>

      <Card>
        <Row
          leading={
            <View style={[styles.rowIcon, { backgroundColor: t.primarySoft }]}>
              <Icon name="earth" size={22} color={t.primary} />
            </View>
          }
          title={tr('settings.countries')}
          subtitle={tr('settings.countriesBody')}
          onPress={onOpenCountries}
        />
      </Card>

      <OfflineMapCard />

      <Card>
        <Row
          leading={
            <View style={[styles.rowIcon, { backgroundColor: t.primarySoft }]}>
              <Icon name="shield-check" size={22} color={t.primary} />
            </View>
          }
          title={tr('settings.setup')}
          subtitle={tr('settings.setupBody')}
          onPress={onOpenSetup}
        />
      </Card>

      <Card>
        <Label>{tr('settings.about')}</Label>
        <Body muted>{tr('settings.aboutBody')}</Body>
        <Text style={[styles.version, { color: t.muted }]}>{tr('settings.version', { version: app.expo.version })}</Text>
      </Card>
    </ScrollView>
  );
}

function LanguageRow({ name, selected, onPress }: { code: Lang; name: string; selected: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected }} style={styles.langRow}>
      <Text style={[styles.langName, { color: t.text }]}>{name}</Text>
      <Icon name={selected ? 'radiobox-marked' : 'radiobox-blank'} size={24} color={selected ? t.primary : t.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { padding: 18, gap: 14 },
  rowIcon: { width: 42, height: 42, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  version: { fontSize: 13 },
  langRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  langName: { fontSize: 17, fontWeight: '600' },
});
