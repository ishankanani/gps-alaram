import type { LinkingOptions } from '@react-navigation/native';

import type { RootStackParamList } from './types';

/** The app's URL scheme (app.json "scheme"). */
export const SCHEME = 'stopwake';

/**
 * Deep links (4.1): stopwake://stop/{id}, stopwake://redeem/{code}, stopwake://pro, stopwake://trip
 * (the trip notification) and, for admins only, stopwake://admin/user/{id}. Links are off until
 * onboarding is done, so a link never skips it.
 */
export function buildLinking({ enabled, admin }: { enabled: boolean; admin: boolean }): LinkingOptions<RootStackParamList> {
  return {
    enabled,
    prefixes: [`${SCHEME}://`],
    config: {
      initialRouteName: 'Tabs',
      screens: {
        Tabs: {
          screens: {
            MapTab: 'stop/:stopId',
            SavedTab: 'saved',
            ActivityTab: 'activity',
            AccountTab: 'account',
          },
        },
        Trip: 'trip',
        Paywall: 'pro',
        Redeem: 'redeem/:code?',
        Settings: 'settings',
        ...(admin ? { AdminHome: 'admin', AdminUser: 'admin/user/:userId' } : {}),
      },
    },
  };
}
