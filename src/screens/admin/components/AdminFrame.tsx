import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useNetworkState } from 'expo-network';
import { createContext, useCallback, useContext, useEffect, useMemo, type ComponentType, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  adminAvailable,
  confirmAdminPassword,
  isStagingServer,
  onAdminForbidden,
  registerReauthHandler,
  toAdminError,
  useAdminMe,
} from '../../../api/admin';
import type { User } from '../../../api/types';
import { I18nProvider, translator, useI18n } from '../../../i18n';
import { navigationRef } from '../../../navigation/ref';
import {
  Badge,
  Banner,
  DialogProvider,
  EmptyState,
  Screen,
  useDialogs,
  useToast,
  type ScreenProps,
} from '../../../ui';
import { formatRelative } from '../lib/format';

// Every admin screen is wrapped in this frame: English texts and en-GB formats whatever the app
// language (ui-critiques), its own dialog host (so Cancel and the field labels are English too),
// the "Confirm it's you" dialog for 401 reauth_required, the toast when the role is lost, and the
// offline state that disables every action.

const ADMIN_I18N = { lang: 'en' as const, t: translator('en') };

type AdminContextValue = {
  /** No connection: actions are disabled, cached data shows with a banner. */
  offline: boolean;
  /** The signed-in admin. */
  me: User | null;
};

const AdminContext = createContext<AdminContextValue>({ offline: false, me: null });

export function useAdminContext(): AdminContextValue {
  return useContext(AdminContext);
}

/** Leaves the admin screens for the Account tab. */
export function leaveAdmin() {
  if (navigationRef.isReady()) navigationRef.navigate('Tabs', { screen: 'AccountTab' }, { pop: true });
}

function AdminServices({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const dialogs = useDialogs();
  const toast = useToast();
  const network = useNetworkState();
  const me = useAdminMe();
  const offline = network.isConnected === false || network.isInternetReachable === false;
  const email = me?.email ?? null;

  // The focused admin screen answers reauth_required (its dialogs are the visible ones).
  useFocusEffect(
    useCallback(
      () =>
        registerReauthHandler(async () => {
          const result = await dialogs.confirm({
            title: t('admin.reauth.title'),
            message: email ? t('admin.reauth.bodyEmail', { email }) : t('admin.reauth.body'),
            icon: 'shield-account-outline',
            confirmLabel: t('admin.reauth.confirm'),
            cancelLabel: t('admin.reauth.leave'),
            requirePassword: true,
            onConfirm: async ({ password }) => {
              try {
                await confirmAdminPassword(password ?? '');
              } catch (e) {
                const err = toAdminError(e);
                throw new Error(err.code === 'invalid_credentials' ? t('admin.reauth.wrong') : err.message);
              }
            },
          });
          if (!result) {
            leaveAdmin();
            return false;
          }
          return true;
        }),
      [dialogs, email, t],
    ),
  );

  useEffect(
    () =>
      onAdminForbidden(() => {
        toast.show({ id: 'admin-only', message: t('admin.lostRole'), icon: 'shield-account-outline' });
      }),
    [toast, t],
  );

  const value = useMemo(() => ({ offline, me }), [offline, me]);
  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

/** Wraps an admin screen component in the frame. */
export function withAdmin<P extends object>(Component: ComponentType<P>): ComponentType<P> {
  function AdminFramed(props: P) {
    return (
      <I18nProvider value={ADMIN_I18N}>
        <DialogProvider>
          <AdminServices>
            <Component {...props} />
          </AdminServices>
        </DialogProvider>
      </I18nProvider>
    );
  }
  AdminFramed.displayName = `withAdmin(${Component.displayName ?? Component.name ?? 'Screen'})`;
  return AdminFramed;
}

type AdminScreenProps = Omit<ScreenProps, 'topBar'> & {
  title: string;
  /** card: back arrow (default); modal: close. */
  presentation?: 'card' | 'modal';
  /** IconButtons on the right of the TopBar. */
  actions?: ReactNode;
  onClose?: () => void;
  /** When the shown data arrived, for the offline and stale banners. */
  fetchedAt?: number | null;
  /** The last refresh failed while older data shows. */
  stale?: boolean;
};

/**
 * An admin screen: a TopBar with the Admin badge (and a Staging badge on a plain-http server), the
 * offline or stale banner above the content, then the content.
 */
export function AdminScreen({ title, presentation = 'card', actions, onClose, fetchedAt, stale, children, ...rest }: AdminScreenProps) {
  const { t } = useI18n();
  const { offline } = useAdminContext();
  const navigation = useNavigation();
  const trailing =
    isStagingServer || actions ? (
      <View style={styles.trailing}>
        {isStagingServer ? (
          <Badge label={t('admin.common.staging')} tone="warning" size="sm" accessibilityLabel={t('admin.common.stagingHint')} />
        ) : null}
        {actions}
      </View>
    ) : undefined;
  const when = fetchedAt ? formatRelative(fetchedAt, t) : null;
  const banner =
    offline || stale ? (
      <Banner
        tone="neutral"
        icon={offline ? 'wifi-off' : 'cloud-alert-outline'}
        body={
          offline
            ? when
              ? t('admin.common.offline', { when })
              : t('admin.common.offlineNoData')
            : t('admin.common.stale', { when: when ?? t('admin.time.never') })
        }
        style={styles.banner}
      />
    ) : null;

  if (!adminAvailable) {
    return (
      <Screen topBar={{ title, admin: true, leading: presentation === 'modal' ? 'close' : 'back' }} {...rest}>
        <EmptyState icon="server-off" title={t('admin.noServer.title')} body={t('admin.noServer.body')} />
      </Screen>
    );
  }

  return (
    <Screen
      topBar={{
        title,
        admin: true,
        leading: presentation === 'modal' ? 'close' : 'back',
        onLeadingPress: onClose ?? (() => navigation.goBack()),
        trailing,
      }}
      {...rest}>
      {rest.scroll === false ? (
        <View style={styles.flex}>
          {banner}
          {children}
        </View>
      ) : (
        <>
          {banner}
          {children}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  trailing: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 4 },
  banner: { marginHorizontal: 16, marginTop: 8 },
  flex: { flex: 1 },
});
