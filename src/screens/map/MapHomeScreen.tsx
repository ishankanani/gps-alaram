import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { StyleSheet, View } from 'react-native';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useI18n } from '../../i18n';
import { useTabBarHidden } from '../../navigation/tabBar';
import type { TabScreenProps } from '../../navigation/types';
import { useSavedData } from '../../state/saved';
import { useTrip } from '../../state/trip';
import { HomeScreen } from '../HomeScreen';

/**
 * Route `MapTab` (MapHome, ui-direction-a 4.3): package M replaces this file with the map, the
 * MapSheet and its modes. Until then it hosts the pre-1.0 home screen (search, place sheet,
 * start and demo ride) above the tab bar (which slides away while the keyboard is open). The old
 * screen pads by the bottom inset itself, so it gets an inset of 0: the tab bar covers it.
 */
export function MapHomeScreen({ navigation }: TabScreenProps<'MapTab'>) {
  const { t: tr } = useI18n();
  const saved = useSavedData();
  const trip = useTrip();
  const tabBarHeight = useBottomTabBarHeight();
  const tabBarHidden = useTabBarHidden();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { paddingBottom: tabBarHidden ? 0 : tabBarHeight }]}>
      <SafeAreaInsetsContext.Provider value={{ ...insets, bottom: 0 }}>
        <HomeScreen
          data={saved.data}
          notice={trip.stoppedNotice ? tr('home.stoppedNotice') : null}
          starting={trip.starting}
          onDismissNotice={trip.dismissStoppedNotice}
          onToggleFavourite={(place) => {
            if (saved.toggleFavourite(place) === 'needsPro') navigation.navigate('Paywall', { reason: 'favourites' });
          }}
          onStart={(place, wake) => void trip.start({ place, wake })}
          onDemo={(place, wake, from) => void trip.start({ place, wake, demo: { from } })}
          onOpenSettings={() => navigation.navigate('Settings')}
          onOpenCountries={() => navigation.navigate('Countries')}
          onOpenPro={(reason) => navigation.navigate('Paywall', { reason })}
        />
      </SafeAreaInsetsContext.Provider>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
