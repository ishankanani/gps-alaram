import { useEffect } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useI18n, type Key } from '../i18n';
import { formatBytes, formatCount } from '../lib/format';
import { BUILT_IN_PACK, PACKS, type CountryPack, type Region } from '../lib/stations/countries';
import { hasUpdate, installPack, packsSupported, refreshAvailable, removePack, usePacks, type PacksState } from '../lib/stations/packs';
import { Body, Button, Card, Divider, Icon, IconButton, Label, Title } from '../ui/components';
import { useTheme } from '../ui/theme';

const REGIONS: Region[] = ['europe', 'americas', 'asiaPacific'];

export function countryName(tr: (key: Key) => string, id: string): string {
  return tr(`country.${id}` as Key);
}

/** Download, update and remove the stops of the countries outside Germany. */
export function CountriesScreen({ onBack }: { onBack: () => void }) {
  const t = useTheme();
  const { t: tr } = useI18n();
  const insets = useSafeAreaInsets();
  const packs = usePacks();

  useEffect(() => {
    void refreshAvailable();
  }, []);

  return (
    <ScrollView
      style={{ backgroundColor: t.background }}
      contentContainerStyle={[styles.root, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }]}>
      <IconButton icon="arrow-left" label={tr('common.back')} onPress={onBack} size={44} />
      <Title>{tr('countries.title')}</Title>
      <Body muted>{tr('countries.body')}</Body>

      {!packsSupported ? (
        <Card>
          <Body>{tr('countries.unsupported')}</Body>
        </Card>
      ) : null}

      {packs.availableError && !packs.available ? (
        <Card>
          <Body>{tr('countries.listFailed')}</Body>
          <Button title={tr('countries.retry')} kind="secondary" icon="refresh" onPress={() => void refreshAvailable()} />
        </Card>
      ) : null}

      {REGIONS.map((region) => (
        <Card key={region}>
          <Label>{tr(`countries.region.${region}` as Key)}</Label>
          {PACKS.filter((p) => p.region === region).map((pack, i) => (
            <View key={pack.id}>
              {i > 0 ? <Divider /> : null}
              <CountryRow pack={pack} packs={packs} />
            </View>
          ))}
        </Card>
      ))}

      <Text style={[styles.credit, { color: t.muted }]}>{tr('countries.credit')}</Text>
    </ScrollView>
  );
}

function CountryRow({ pack, packs }: { pack: CountryPack; packs: PacksState }) {
  const t = useTheme();
  const { t: tr, lang } = useI18n();
  const name = countryName(tr, pack.id);
  const installed = packs.installed.find((p) => p.id === pack.id);
  const available = packs.available?.find((p) => p.id === pack.id);
  const job = packs.jobs[pack.id];
  const builtIn = pack.id === BUILT_IN_PACK;
  const update = hasUpdate(pack.id, packs);

  let status: string;
  let tone = t.muted;
  if (builtIn) status = tr('countries.builtIn');
  else if (job?.phase === 'download') status = tr('countries.downloading', { percent: Math.floor(job.progress * 100) });
  else if (job) status = tr('countries.installing');
  else if (packs.failed[pack.id]) {
    status = tr('countries.failed');
    tone = t.bad;
  } else if (update && available) status = tr('countries.update', { size: formatBytes(available.bytes, lang) });
  else if (installed) status = tr('countries.installed', { count: formatCount(installed.count, lang), size: formatBytes(installed.dbBytes, lang) });
  else if (available) status = tr('countries.download', { size: formatBytes(available.bytes, lang) });
  else status = tr('countries.notYet');

  const canDownload = packsSupported && !!available && !job && (!installed || update);

  function confirmRemove() {
    Alert.alert(name, tr('countries.removeConfirm', { country: name }), [
      { text: tr('common.close'), style: 'cancel' },
      { text: tr('countries.remove'), style: 'destructive', onPress: () => void removePack(pack.id) },
    ]);
  }

  return (
    <Pressable
      disabled={!canDownload}
      onPress={() => void installPack(pack.id)}
      accessibilityRole="button"
      accessibilityLabel={`${name}. ${status}`}
      style={styles.row}>
      <Text style={styles.flag}>{pack.flag}</Text>
      <View style={styles.rowText}>
        <Text style={[styles.name, { color: t.text }]}>{name}</Text>
        <Text style={[styles.status, { color: tone }]}>{status}</Text>
        {job?.phase === 'download' ? (
          <View style={[styles.bar, { backgroundColor: t.surfaceAlt }]}>
            <View style={[styles.barFill, { backgroundColor: t.primary, width: `${Math.max(3, job.progress * 100)}%` }]} />
          </View>
        ) : null}
      </View>
      {builtIn ? (
        <Icon name="check-circle" size={24} color={t.good} />
      ) : job ? (
        <ActivityIndicator color={t.primary} />
      ) : canDownload ? (
        <Icon name={update ? 'update' : 'download'} size={24} color={t.primary} />
      ) : installed ? (
        <IconButton icon="delete-outline" label={tr('countries.remove')} onPress={confirmRemove} size={40} tint={t.muted} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { padding: 18, gap: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10, minHeight: 56 },
  flag: { fontSize: 28 },
  rowText: { flex: 1, gap: 2 },
  name: { fontSize: 17, fontWeight: '600' },
  status: { fontSize: 13 },
  bar: { height: 4, borderRadius: 2, overflow: 'hidden', marginTop: 4 },
  barFill: { height: 4, borderRadius: 2 },
  credit: { fontSize: 12, lineHeight: 17, paddingHorizontal: 4 },
});
