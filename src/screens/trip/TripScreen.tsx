import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';

import { currentRouteName, goToMap } from '../../navigation/ref';
import { runningTripNow, useTrip } from '../../state/trip';
import { useTheme } from '../../ui/theme';
import { TrackingScreen } from '../TrackingScreen';

/**
 * Route `Trip` (ui-direction-a 4.3): package M replaces this file. Until then it hosts the pre-1.0
 * tracking screen. Android back minimises the trip to the TripBar instead of closing it.
 */
export function TripScreen() {
  const t = useTheme();
  const trip = useTrip();
  const { minimise } = trip;

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        minimise();
        return true;
      });
      return () => sub.remove();
    }, [minimise]),
  );

  // Opened without a running trip (an old notification link, or a trip that ended unseen): once
  // nothing else has taken over the screen, go back to the map.
  const running = !!trip.status;
  useEffect(() => {
    if (running) return;
    const timer = setTimeout(() => {
      if (currentRouteName() === 'Trip' && !runningTripNow()) goToMap();
    }, 800);
    return () => clearTimeout(timer);
  }, [running]);

  if (!trip.status) return <View style={[styles.root, { backgroundColor: t.color.bg }]} />;
  return <TrackingScreen status={trip.status} kind={trip.kind} trail={trip.trail} />;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
