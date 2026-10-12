import * as Application from 'expo-application';
import * as WebBrowser from 'expo-web-browser';
import { Linking } from 'react-native';

import { accountUser, useAccount } from '../../api/account';
import { useRemoteConfig } from '../../api/config';
import { API_URL, appBuild, appVersion } from '../../api';

// Where Settings, Help, Legal and About link to: the support address and legal pages from the
// remote config (backend-spec 7.3), with the server's own pages as the fallback, the user's ID,
// the app version and the Play listing.

export type AppLinks = {
  supportEmail: string | null;
  privacyUrl: string | null;
  termsUrl: string | null;
  accountDeletionUrl: string | null;
  /** "SW-7K3P-92QX", once the account (or guest) is known. */
  publicId: string | null;
};

function pick(configured: string, path: string): string | null {
  if (configured) return configured;
  return API_URL ? `${API_URL}${path}` : null;
}

export function useAppLinks(): AppLinks {
  const config = useRemoteConfig();
  const account = useAccount();
  const user = accountUser(account);
  return {
    supportEmail: config.support.email || account.disabled?.supportEmail || null,
    privacyUrl: pick(config.links.privacy, '/privacy'),
    termsUrl: pick(config.links.terms, '/terms'),
    accountDeletionUrl: pick(config.links.accountDeletion, '/account-deletion'),
    publicId: user?.publicId ?? account.disabled?.publicId ?? null,
  };
}

/** "1.0.0" and the build number ("42"), if the build has one. */
export function versionInfo(): { version: string; build: string | null } {
  return { version: appVersion(), build: appBuild() };
}

/** Opens a page in an in-app browser tab (a Custom Tab on Android). */
export async function openPage(url: string): Promise<void> {
  try {
    await WebBrowser.openBrowserAsync(url);
  } catch {
    await Linking.openURL(url).catch(() => {});
  }
}

/** The app's Play Store page: the Play app when it is there, the website otherwise. */
export async function openStoreListing(): Promise<void> {
  const id = Application.applicationId ?? 'com.ishankanani.gpsalarm';
  try {
    await Linking.openURL(`market://details?id=${id}`);
  } catch {
    await openPage(`https://play.google.com/store/apps/details?id=${id}`);
  }
}
