import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useI18n, type Key } from '../../i18n';
import { formatBytes } from '../../lib/format';
import type { Place } from '../../lib/geocode';
import type { LatLon } from '../../map/geo';
import { installPack, usePacks } from '../../lib/stations/packs';
import { AppText, Button, EmptyState, ProgressBar, SectionHeader, useTheme } from '../../ui';
import { nbsp } from './mapLogic';
import { PlaceRow } from './PlaceRow';
import { useSearch, useSuggestedPack } from './useMapData';

type Props = {
  query: string;
  near: LatLon | null;
  online: boolean;
  favourites: Place[];
  recents: Place[];
  distanceTo: (place: Place) => string | null;
  /** Finding your position for "Ring when I leave here". */
  locating: boolean;
  locationFailed: boolean;
  onPick: (place: Place) => void;
  onLeaveHere: () => void;
  onDropPin: () => void;
  onClearRecents: () => void;
};

/**
 * MapSheet search mode (4.3): with an empty query, "Ring when I leave here", "Drop a pin on the
 * map", favourites and recents; from two characters, stops (offline) and, from three, addresses
 * (online), with the honest offline, no-results and country-pack states.
 */
export function SearchContent({
  query,
  near,
  online,
  favourites,
  recents,
  distanceTo,
  locating,
  locationFailed,
  onPick,
  onLeaveHere,
  onDropPin,
  onClearRecents,
}: Props) {
  const t = useTheme();
  const { t: tr, lang } = useI18n();
  const q = query.trim();
  const results = useSearch(query, near, lang);
  const packs = usePacks();
  const firstAddress = results.addresses[0];
  const suggested = useSuggestedPack(
    results.stops.length === 0 && firstAddress ? { latitude: firstAddress.latitude, longitude: firstAddress.longitude } : null,
    online,
    [],
  );

  if (q.length < 2) {
    return (
      <View>
        <PlaceRow
          place={{ id: 'leave-here', name: tr(locating ? 'search.locating' : 'map.search.leaveHere'), context: '', latitude: 0, longitude: 0 }}
          subtitle={locationFailed ? tr('search.locationFailed') : tr('map.search.leaveHereBody')}
          icon="map-marker-radius-outline"
          iconTone="primary"
          trailing={locating ? <ActivityIndicator size={20} color={t.color.primary} /> : null}
          onPress={onLeaveHere}
          testID="search-leave-here"
        />
        <PlaceRow
          place={{ id: 'drop-pin', name: tr('map.search.dropPin'), context: '', latitude: 0, longitude: 0 }}
          icon="map-marker-plus-outline"
          last
          onPress={onDropPin}
          testID="search-drop-pin"
        />
        {favourites.length ? (
          <>
            <SectionHeader title={tr('home.favourites')} inSheet />
            {favourites.map((p, i) => (
              <PlaceRow key={p.id} place={p} distance={distanceTo(p)} last={i === favourites.length - 1} onPress={() => onPick(p)} />
            ))}
          </>
        ) : null}
        {recents.length ? (
          <>
            <SectionHeader title={tr('home.recent')} inSheet action={{ label: tr('ui.clear'), onPress: onClearRecents }} />
            {recents.map((p, i) => (
              <PlaceRow key={p.id} place={p} distance={distanceTo(p)} last={i === recents.length - 1} onPress={() => onPick(p)} />
            ))}
          </>
        ) : null}
        <AppText variant="bodyS" color="textTertiary" style={styles.tip}>
          {tr('map.search.tip')}
        </AppText>
      </View>
    );
  }

  const searchingAddresses = q.length >= 3 && online;
  const nothing =
    results.stopsDone &&
    results.stops.length === 0 &&
    results.addresses.length === 0 &&
    !(searchingAddresses && results.addressesLoading) &&
    !suggested;
  const job = suggested ? packs.jobs[suggested.id] : undefined;
  const entry = suggested ? packs.available?.find((p) => p.id === suggested.id) : undefined;

  return (
    <View>
      {results.stops.length ? (
        <>
          <SectionHeader title={tr('map.search.stops')} inSheet first />
          {results.stops.map((p, i) => (
            <PlaceRow
              key={p.id}
              place={p}
              query={q}
              distance={distanceTo(p)}
              last={i === results.stops.length - 1}
              onPress={() => onPick(p)}
              testID={`search-stop-${i}`}
            />
          ))}
        </>
      ) : null}

      {suggested ? (
        <View style={styles.pack}>
          <AppText variant="bodyM" style={styles.flex}>
            {tr('map.pack.hint', {
              country: tr(`country.${suggested.id}` as Key),
              size: nbsp(formatBytes(entry?.bytes ?? 0, lang)),
            })}
          </AppText>
          {job ? (
            <View style={styles.packProgress}>
              <ProgressBar progress={job.progress} accessibilityLabel={tr('map.pack.downloading', { percent: Math.floor(job.progress * 100) })} />
            </View>
          ) : (
            <Button label={tr('map.pack.download')} variant="secondary" size="S" onPress={() => void installPack(suggested.id)} />
          )}
        </View>
      ) : null}

      {searchingAddresses && (results.addresses.length || results.addressesLoading) ? (
        <>
          <SectionHeader
            title={tr('search.addresses')}
            inSheet
            first={!results.stops.length}
            trailing={results.addressesLoading ? <ActivityIndicator size={20} color={t.color.primary} /> : undefined}
          />
          {results.addresses.map((p, i) => (
            <PlaceRow
              key={p.id}
              place={p}
              icon="map-marker-outline"
              distance={distanceTo(p)}
              last={i === results.addresses.length - 1}
              onPress={() => onPick(p)}
              testID={`search-address-${i}`}
            />
          ))}
        </>
      ) : null}

      {q.length >= 3 && (!online || results.addressesFailed) ? (
        <EmptyState variant="inline" icon="wifi-off" title={tr('map.search.addressesOffline')} />
      ) : null}

      {nothing ? (
        <EmptyState
          variant="inline"
          icon="magnify"
          title={tr('map.search.noResultsTitle', { query: q })}
          body={tr('map.search.noResultsBody')}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tip: { paddingHorizontal: 16, paddingTop: 16 },
  pack: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
  packProgress: { width: 96 },
  flex: { flex: 1 },
});
