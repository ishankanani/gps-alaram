import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';

import { useI18n } from '../../i18n';
import { formatBytes } from '../../lib/format';
import { reversePlace } from '../../lib/geocode';
import { useRemoteConfig } from '../../api/config';
import { offlineMapAllowed } from '../../lib/plans';
import { usePro } from '../../lib/pro';
import { deleteArea, downloadArea, listAreas, type OfflineArea } from '../../map/offline';
import type { RootScreenProps } from '../../navigation/types';
import {
  AppText,
  Banner,
  Button,
  EmptyState,
  IconButton,
  ListItem,
  ProgressBar,
  Screen,
  Section,
  StickyFooter,
  useDialogs,
  useSkeletonDelay,
  useToast,
} from '../../ui';
import { nbsp } from '../activity/format';

/** The area saved around the rider, in km. */
const RADIUS_KM = 25;

/**
 * OfflineMaps (ui-direction-a 4.3 Settings): save the map around you for underground stations and
 * trips without data (Pro), see and delete saved areas. Stops and alarms work offline anyway; the
 * last 256 MB of map viewed is cached automatically (src/map/offline.ts).
 */
export function OfflineMapsScreen({ navigation }: RootScreenProps<'OfflineMaps'>) {
  const { t: tr, lang } = useI18n();
  const { isPro } = usePro();
  const toast = useToast();
  const dialogs = useDialogs();
  const { proFeatures } = useRemoteConfig();
  const allowed = offlineMapAllowed(isPro, proFeatures);
  const [areas, setAreas] = useState<OfflineArea[] | null>(null);
  const [busy, setBusyState] = useState(false);
  // Also read from MapLibre's progress callbacks, which outlive a render.
  const busyRef = useRef(false);
  const setBusy = (value: boolean) => {
    busyRef.current = value;
    setBusyState(value);
  };
  const [error, setError] = useState<string | null>(null);
  const showSkeleton = useSkeletonDelay(areas == null);

  useEffect(() => {
    let cancelled = false;
    listAreas()
      .then((list) => {
        if (!cancelled) setAreas(list);
      })
      .catch(() => {
        if (!cancelled) setAreas([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function upsert(area: OfflineArea) {
    setAreas((current) => [...(current ?? []).filter((a) => a.id !== area.id), area]);
    if (area.complete && busyRef.current) {
      setBusy(false);
      toast.show({ id: 'offline-done', message: tr('settings.offlineMaps.done'), icon: 'map-check-outline' });
    }
  }

  async function save() {
    if (!allowed) {
      navigation.navigate('Paywall', { reason: 'offlineMap' });
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) throw new Error(tr('settings.offlineNeedsLocation'));
      const position =
        (await Location.getLastKnownPositionAsync({ maxAge: 30 * 60_000 })) ??
        (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }));
      const center = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      const place = await reversePlace(center.latitude, center.longitude, { language: lang }).catch(() => null);
      const name =
        place?.context?.split(',')[0]?.trim() || place?.name || `${center.latitude.toFixed(3)}, ${center.longitude.toFixed(3)}`;
      await downloadArea(center, RADIUS_KM, name, upsert, () => {
        setError(tr('settings.offlineFailed'));
        setBusy(false);
      });
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : tr('settings.offlineFailed'));
      setBusy(false);
    }
  }

  async function remove(area: OfflineArea) {
    await dialogs.confirm({
      title: tr('settings.offlineMaps.deleteTitle', { name: area.name }),
      message: tr('settings.offlineMaps.deleteBody'),
      confirmLabel: tr('settings.offlineMaps.delete'),
      tone: 'danger',
      icon: 'delete-outline',
      onConfirm: async () => {
        await deleteArea(area.id).catch(() => {});
        setAreas((current) => (current ?? []).filter((a) => a.id !== area.id));
        if (!area.complete) setBusy(false);
      },
    });
  }

  const sorted = [...(areas ?? [])].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Screen
      topBar={{ title: tr('settings.offlineMaps') }}
      footer={
        <StickyFooter>
          <Button
            label={tr('settings.offlineMaps.save', { km: RADIUS_KM })}
            icon={allowed ? 'download' : 'lock-outline'}
            block
            loading={busy}
            onPress={() => void save()}
            testID="offline-maps-save"
          />
        </StickyFooter>
      }
      testID="screen-OfflineMaps">
      {!allowed ? (
        <Banner
          tone="promo"
          body={tr('settings.offlineMaps.promo')}
          action={{ label: tr('settings.getPro'), onPress: () => navigation.navigate('Paywall', { reason: 'offlineMap' }) }}
          style={styles.banner}
        />
      ) : null}
      <AppText variant="bodyM" color="textSecondary" style={styles.intro}>
        {tr('settings.offlineMaps.intro')}
      </AppText>
      {error ? <Banner tone="danger" body={error} onClose={() => setError(null)} style={styles.banner} /> : null}

      <Section
        title={tr('settings.offlineMaps.saved')}
        loading={showSkeleton}
        footer={tr('settings.offlineMaps.footer')}
        empty={
          areas != null ? (
            <EmptyState variant="inline" icon="map-outline" title={tr('settings.offlineMaps.empty')} body={tr('settings.offlineMaps.emptyBody')} />
          ) : undefined
        }>
        {sorted.map((area) => {
          const size = nbsp(formatBytes(area.sizeBytes, lang));
          const subtitle = area.complete
            ? tr('settings.offlineMaps.area', { km: area.radiusKm, size })
            : tr('settings.offlineMaps.progress', { percent: Math.floor(area.percentage), size });
          return (
            <ListItem
              key={area.id}
              icon={area.complete ? 'map-check-outline' : 'map-clock-outline'}
              iconColor={area.complete ? 'success' : 'primary'}
              title={area.name}
              meta={
                <>
                  <AppText variant="bodyS" color="textSecondary" tabular>
                    {subtitle}
                  </AppText>
                  {area.complete ? null : <ProgressBar progress={area.percentage / 100} style={styles.progress} />}
                </>
              }
              accessible={false}
              trailing={
                <IconButton
                  icon="delete-outline"
                  color="textSecondary"
                  accessibilityLabel={tr('settings.offlineMaps.deleteA11y', { name: area.name })}
                  onPress={() => void remove(area)}
                />
              }
            />
          );
        })}
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  banner: { marginHorizontal: 16, marginTop: 8 },
  intro: { paddingHorizontal: 16, paddingTop: 8 },
  progress: { width: '100%', marginTop: 4 },
});
