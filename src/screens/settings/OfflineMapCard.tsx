import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useI18n } from '../../i18n';
import { reversePlace } from '../../lib/geocode';
import { deleteArea, downloadArea, listAreas, type OfflineArea } from '../../map/offline';
import { Body, Button, Card, Icon, IconButton, Label } from '../../ui/components';
import { radius, useTheme } from '../../ui/theme';

const RADIUS_KM = 25;

function megabytes(bytes: number) {
  return (bytes / 1_000_000).toFixed(bytes < 10_000_000 ? 1 : 0);
}

/** Save the map around you, for underground stations and trips without mobile data. */
export function OfflineMapCard() {
  const t = useTheme();
  const { t: tr, lang } = useI18n();
  const [areas, setAreas] = useState<OfflineArea[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listAreas()
      .then((list) => !cancelled && setAreas(list))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  function upsert(area: OfflineArea) {
    setAreas((cur) => [...cur.filter((a) => a.id !== area.id), area]);
    if (area.complete) setBusy(false);
  }

  async function download() {
    setError(null);
    setBusy(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) throw new Error(tr('settings.offlineNeedsLocation'));
      const pos =
        (await Location.getLastKnownPositionAsync({ maxAge: 30 * 60_000 })) ??
        (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }));
      const center = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      const place = await reversePlace(center.latitude, center.longitude, { language: lang }).catch(() => null);
      const name = place?.context?.split(',')[0]?.trim() || place?.name || `${center.latitude.toFixed(3)}, ${center.longitude.toFixed(3)}`;
      await downloadArea(center, RADIUS_KM, name, upsert, () => {
        setError(tr('settings.offlineFailed'));
        setBusy(false);
      });
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : tr('settings.offlineFailed'));
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await deleteArea(id).catch(() => {});
    setAreas((cur) => cur.filter((a) => a.id !== id));
  }

  return (
    <Card>
      <Label>{tr('settings.offline')}</Label>
      <Body muted>{tr('settings.offlineBody')}</Body>
      {areas.map((a) => (
        <View key={a.id} style={[styles.area, { backgroundColor: t.surfaceAlt }]}>
          <Icon name={a.complete ? 'map-check' : 'map-clock'} size={22} color={a.complete ? t.good : t.primary} />
          <View style={styles.areaText}>
            <Text style={[styles.areaName, { color: t.text }]} numberOfLines={1}>
              {a.name}
            </Text>
            <Text style={[styles.areaInfo, { color: t.muted }]}>
              {a.complete
                ? tr('settings.offlineReady', { size: megabytes(a.sizeBytes), km: a.radiusKm })
                : tr('settings.offlineProgress', { percent: Math.floor(a.percentage), size: megabytes(a.sizeBytes) })}
            </Text>
          </View>
          <IconButton icon="delete-outline" label={tr('settings.offlineDelete')} onPress={() => void remove(a.id)} size={38} tint={t.muted} />
        </View>
      ))}
      {error ? <Text style={[styles.error, { color: t.bad }]}>{error}</Text> : null}
      <Button
        title={tr('settings.offlineDownload', { km: RADIUS_KM })}
        kind="secondary"
        icon="download"
        busy={busy}
        onPress={() => void download()}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  area: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.md },
  areaText: { flex: 1, gap: 2 },
  areaName: { fontSize: 16, fontWeight: '700' },
  areaInfo: { fontSize: 13 },
  error: { fontSize: 14 },
});
