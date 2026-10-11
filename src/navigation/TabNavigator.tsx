import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { AccountScreen } from '../screens/account/AccountScreen';
import { ActivityScreen } from '../screens/activity/ActivityScreen';
import { MapHomeScreen } from '../screens/map/MapHomeScreen';
import { SavedScreen } from '../screens/saved/SavedScreen';
import { AppTabBar } from './AppTabBar';
import type { TabParamList } from './types';

const Tab = createBottomTabNavigator<TabParamList>();

/**
 * The four tabs (4.2) with the custom tab bar. The Map tab is full height; the other roots pad by
 * the tab bar's reported height. Back on another tab returns to Map, then leaves the app.
 */
export function TabNavigator() {
  return (
    <Tab.Navigator
      initialRouteName="MapTab"
      backBehavior="firstRoute"
      tabBar={(props) => <AppTabBar {...props} />}
      screenOptions={{ headerShown: false, animation: 'none' }}>
      <Tab.Screen name="MapTab" component={MapHomeScreen} />
      <Tab.Screen name="SavedTab" component={SavedScreen} />
      <Tab.Screen name="ActivityTab" component={ActivityScreen} />
      <Tab.Screen name="AccountTab" component={AccountScreen} />
    </Tab.Navigator>
  );
}
