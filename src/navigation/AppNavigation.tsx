import { NavigationContainer, type InitialState } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';

import { useI18n } from '../i18n';
import { useSavedData } from '../state/saved';
import { onSessionRoleChange, useIsAdmin } from '../state/session';
import { runningTripNow } from '../state/trip';
import { useToast } from '../ui/components/Toast';
import { useTheme } from '../ui/theme';
import { buildLinking } from './linking';
import { currentRouteName, flushNavigationQueue, navigationRef } from './ref';
import { RootNavigator } from './RootNavigator';
import { navigationTheme } from './theme';
import { isAdminRoute } from './types';

/**
 * The navigation container: theme from the tokens, deep links once onboarding is done, and the
 * first screen. A trip that runs at cold start opens straight on Trip (over the tabs), so the map
 * never flashes first.
 */
export function AppNavigation() {
  const t = useTheme();
  const { t: tr } = useI18n();
  const toast = useToast();
  const { data } = useSavedData();
  const admin = useIsAdmin();
  const onboarded = data.preferences.onboarded;
  const [initial] = useState<{ routeName: 'Onboarding' | 'Tabs'; state: InitialState | undefined }>(() => ({
    routeName: onboarded ? 'Tabs' : 'Onboarding',
    state: onboarded && runningTripNow() ? { index: 1, routes: [{ name: 'Tabs' }, { name: 'Trip' }] } : undefined,
  }));
  const linking = useMemo(() => buildLinking({ enabled: onboarded, admin }), [onboarded, admin]);
  const theme = useMemo(() => navigationTheme(t), [t]);

  // Losing the admin role removes the admin screens; say why if the user was on one.
  useEffect(
    () =>
      onSessionRoleChange((previous, next) => {
        if (previous === 'admin' && next !== 'admin' && isAdminRoute(currentRouteName())) {
          toast.show({ id: 'admin-only', message: tr('nav.adminOnly'), icon: 'shield-account-outline' });
        }
      }),
    [toast, tr],
  );

  return (
    <NavigationContainer
      ref={navigationRef}
      theme={theme}
      linking={linking}
      initialState={initial.state}
      onReady={flushNavigationQueue}>
      <RootNavigator initialRouteName={initial.routeName} />
      <StatusBar style="auto" />
    </NavigationContainer>
  );
}
