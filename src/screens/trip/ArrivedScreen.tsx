import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';

import { goToMap } from '../../navigation/ref';
import type { RootScreenProps } from '../../navigation/types';
import { useSavedData } from '../../state/saved';
import { useTrip } from '../../state/trip';
import { useTheme } from '../../ui/theme';
import { DoneScreen } from '../DoneScreen';

/**
 * Route `Arrived` (ui-direction-a 4.3): package M replaces this file. Until then it hosts the
 * pre-1.0 trip summary for the trip that just ended. Android back and Done go to the map.
 */
export function ArrivedScreen({ navigation }: RootScreenProps<'Arrived'>) {
  const t = useTheme();
  const trip = useTrip();
  const saved = useSavedData();

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        goToMap();
        return true;
      });
      return () => sub.remove();
    }, []),
  );

  const ended = trip.ended;
  if (!ended) return <View style={[styles.root, { backgroundColor: t.color.bg }]} />;
  const place = ended.place;
  return (
    <DoneScreen
      ended={ended.event}
      place={place}
      isFavourite={!!place && saved.isFavourite(place)}
      onSaveFavourite={() => {
        if (place && saved.toggleFavourite(place) === 'needsPro') navigation.navigate('Paywall', { reason: 'favourites' });
      }}
      onDone={goToMap}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
