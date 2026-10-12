import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useI18n } from '../../i18n';
import type { Place } from '../../lib/geocode';
import { stopToPlace } from '../../lib/stations/toPlace';
import {
  AppText,
  Button,
  Chip,
  ChipRow,
  EmptyState,
  KindIcon,
  SectionHeader,
  SkeletonRow,
  useSkeletonDelay,
} from '../../ui';
import { PlaceRow } from './PlaceRow';
import type { Nearby } from './useMapData';
import type { LocationPermission } from './useUserLocation';

const NEARBY_SHORT = 3;
const RECENT_ROWS = 3;

type Props = {
  favourites: Place[];
  recents: Place[];
  permission: LocationPermission;
  nearby: Nearby;
  /** "360 m" from you, or null when your position is unknown. */
  distanceTo: (place: Place) => string | null;
  /** "Within 1.5 km". */
  nearbyRange: string;
  showLongPressHint: boolean;
  onPick: (place: Place) => void;
  onAllowLocation: () => void;
  onOpenSetup: () => void;
};

/**
 * MapSheet browse mode (4.3 with the critiques' order): favourite chips, up to 3 recent stops,
 * then nearby stops (3, or all 8 with "Show all nearby"), and the long-press hint for new users.
 */
export function BrowseContent({
  favourites,
  recents,
  permission,
  nearby,
  distanceTo,
  nearbyRange,
  showLongPressHint,
  onPick,
  onAllowLocation,
  onOpenSetup,
}: Props) {
  const { t: tr } = useI18n();
  const [showAll, setShowAll] = useState(false);
  const skeleton = useSkeletonDelay(nearby.loading && nearby.stops.length === 0);
  const nearbyStops = nearby.stops.slice(0, showAll ? 8 : NEARBY_SHORT);
  const recentRows = recents.slice(0, RECENT_ROWS);

  let nearbyBody;
  if (permission === 'unknown' || permission === 'denied' || permission === 'blocked') {
    const blocked = permission === 'blocked';
    nearbyBody = (
      <EmptyState
        variant="inline"
        icon="crosshairs-gps"
        title={tr('map.location.title')}
        body={tr(blocked ? 'map.location.deniedBody' : 'map.location.body')}
        action={{
          label: tr(blocked ? 'map.location.openSetup' : 'map.location.allow'),
          onPress: blocked ? onOpenSetup : onAllowLocation,
        }}
      />
    );
  } else if (permission === 'checking' || (nearby.loading && nearby.stops.length === 0)) {
    nearbyBody = skeleton ? (
      <>
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </>
    ) : (
      <View style={styles.reserve} />
    );
  } else if (nearby.stops.length === 0) {
    nearbyBody = <EmptyState variant="inline" icon="map-marker-off-outline" title={tr('map.nearby.emptyTitle')} body={tr('map.nearby.emptyBody')} />;
  } else {
    nearbyBody = (
      <>
        {nearbyStops.map((stop, i) => {
          const place = stopToPlace(stop);
          return (
            <PlaceRow
              key={stop.id}
              place={place}
              distance={distanceTo(place)}
              last={i === nearbyStops.length - 1}
              onPress={() => onPick(place)}
              testID={`nearby-${i}`}
            />
          );
        })}
        {nearby.stops.length > NEARBY_SHORT ? (
          <Button
            label={tr(showAll ? 'map.nearby.showFewer' : 'map.nearby.showAll')}
            variant="ghost"
            size="S"
            onPress={() => setShowAll((v) => !v)}
            style={styles.showAll}
          />
        ) : null}
      </>
    );
  }

  return (
    <View>
      {favourites.length ? (
        <ChipRow style={styles.chips} accessibilityLabel={tr('home.favourites')}>
          {favourites.slice(0, 8).map((f) => (
            <Chip
              key={f.id}
              variant="assist"
              label={f.name}
              maxWidth={220}
              leading={<KindIcon kind={f.kind ?? 'place'} size={20} />}
              onPress={() => onPick(f)}
            />
          ))}
        </ChipRow>
      ) : null}

      {recentRows.length ? (
        <>
          <SectionHeader title={tr('home.recent')} inSheet first={!favourites.length} />
          {recentRows.map((p, i) => (
            <PlaceRow key={p.id} place={p} distance={distanceTo(p)} last={i === recentRows.length - 1} onPress={() => onPick(p)} />
          ))}
        </>
      ) : null}

      <SectionHeader
        title={tr('map.nearby.title')}
        inSheet
        first={!favourites.length && !recentRows.length}
        trailing={
          permission === 'granted' ? (
            <AppText variant="bodyS" color="textTertiary">
              {nearbyRange}
            </AppText>
          ) : undefined
        }
      />
      {nearbyBody}

      {showLongPressHint ? (
        <AppText variant="bodyS" color="textTertiary" align="center" style={styles.hint}>
          {tr('map.longPressHint')}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { marginTop: 4, marginBottom: 4 },
  showAll: { marginLeft: 8 },
  hint: { paddingHorizontal: 16, paddingTop: 16 },
  reserve: { minHeight: 192 },
});
