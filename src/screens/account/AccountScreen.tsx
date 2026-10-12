import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { RefreshControl, Share, StyleSheet, View } from 'react-native';

import { apiConfigured, appBuild, appVersion } from '../../api';
import {
  accountUser,
  continueAsNewGuest,
  dismissSignedOutNotice,
  exportData,
  refreshAccount,
  signOut,
  signOutOthers,
  useAccount,
  useApiLanguage,
} from '../../api/account';
import { refreshConfig, useRemoteConfig } from '../../api/config';
import { useI18n } from '../../i18n';
import { restore, usePro } from '../../lib/pro';
import type { TabScreenProps } from '../../navigation/types';
import { setupReady, useDialogs, useIsAdmin, useSetupStatus, useToast } from '../../state';
import { AppText, Badge, Banner, EmptyState, ListItem, Screen, Section, useSkeletonDelay, useTheme } from '../../ui';
import { accountPlanStatus, type PlanAction } from './planStatus';
import { PlanStatusCard, PlanStatusSkeleton } from './PlanStatusCard';
import { ProfileCard, ProfileCardSkeleton } from './ProfileCard';
import { agoText, errorText, mailSupport, openExternal } from './shared';

/** The alarm checklist as a badge: required items missing ("2 to fix") or recommended ones ("1 to improve"). */
function useReliabilityBadge(): { label: string; tone: 'success' | 'warning' | 'neutral' } | null {
  const { t: tr } = useI18n();
  const status = useSetupStatus();
  if (!status) return null;
  const required = [status.location === 'precise', status.locationServices, status.notifications].filter((ok) => !ok).length;
  const recommended = [status.fullScreenAlarm, status.exactAlarms, status.batteryUnrestricted].filter((ok) => !ok).length;
  if (!setupReady(status) || required > 0) return { label: tr('account.reliability.toFix', { count: Math.max(1, required) }), tone: 'warning' };
  if (recommended > 0) return { label: tr('account.reliability.toImprove', { count: recommended }), tone: 'neutral' };
  return { label: tr('account.reliability.ok'), tone: 'success' };
}

/**
 * Route `AccountTab` (ui-direction-a 4.3 "Account", backend-spec 7.6): identity, plan, purchases,
 * the app's settings, the admin entry and the account actions. In a build without a server it
 * says so and keeps everything that works on the phone.
 */
export function AccountScreen({ navigation }: TabScreenProps<'AccountTab'>) {
  const t = useTheme();
  const { t: tr, lang } = useI18n();
  useApiLanguage();
  const toast = useToast();
  const dialogs = useDialogs();
  const account = useAccount();
  const pro = usePro();
  const config = useRemoteConfig();
  const admin = useIsAdmin();
  const reliability = useReliabilityBadge();
  const [refreshing, setRefreshing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const user = accountUser(account);
  const session = account.session;
  const guest = !session || session.kind === 'guest';
  const publicId = user?.publicId ?? session?.publicId ?? null;
  const firstLoad = apiConfigured && !user && (account.syncing || !session) && !account.offline;
  const showSkeleton = useSkeletonDelay(firstLoad);

  // The "checked 2 h ago" line ages while the tab is open.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refreshAccount(), refreshConfig({ force: true })]);
    setNow(Date.now());
    setRefreshing(false);
  }, []);

  const status = accountPlanStatus({ pro, config, entitlements: account.me?.entitlements, lang, tr });

  function onPlanAction(action: PlanAction) {
    if (action === 'getPro' || action === 'seePlans') navigation.navigate('Paywall', {});
    else openExternal(pro.managementUrl);
  }

  async function onRestore() {
    setRestoring(true);
    const active = await restore();
    setRestoring(false);
    toast.show({ id: 'restore', message: tr(active ? 'account.restored' : 'account.restoreNone'), icon: active ? 'check-circle-outline' : undefined });
  }

  async function onSignOut() {
    const ok = await dialogs.confirm({
      title: tr('account.signOutTitle'),
      message: tr('account.signOutBody'),
      confirmLabel: tr('account.signOut'),
      icon: 'logout',
    });
    if (!ok) return;
    await signOut();
    toast.show({ id: 'signed-out', message: tr('account.signedOut'), icon: 'logout' });
  }

  async function onSignOutOthers() {
    let revoked = 0;
    const ok = await dialogs.confirm({
      title: tr('account.signOutOthersTitle'),
      message: tr('account.signOutOthersBody'),
      confirmLabel: tr('account.signOutOthersConfirm'),
      onConfirm: async () => {
        try {
          revoked = await signOutOthers();
        } catch (e) {
          throw new Error(errorText(e, tr));
        }
      },
    });
    if (!ok) return;
    const message =
      revoked === 0 ? tr('account.signOutOthersNone') : revoked === 1 ? tr('account.signOutOthersDoneOne') : tr('account.signOutOthersDone', { count: revoked });
    toast.show({ id: 'sign-out-others', message, icon: 'cellphone-off' });
  }

  async function onExport() {
    setExporting(true);
    try {
      const data = await exportData();
      await Share.share({ title: `stopwake-${data.user.publicId}.json`, message: JSON.stringify(data, null, 2) }, { dialogTitle: tr('account.exportTitle') });
    } catch (e) {
      toast.show({ id: 'export', message: errorText(e, tr), error: true });
    } finally {
      setExporting(false);
    }
  }

  async function onContinueAsGuest() {
    const ok = await dialogs.confirm({
      title: tr('account.continueGuestTitle'),
      message: tr('account.continueGuestBody'),
      confirmLabel: tr('account.continueGuestConfirm'),
    });
    if (ok) await continueAsNewGuest();
  }

  const supportEmail = account.disabled?.supportEmail || config.support.email;
  const banners: ReactNode[] = [];
  if (account.disabled) {
    const id = account.disabled.publicId ?? publicId;
    banners.push(
      <Banner
        key="disabled"
        tone="danger"
        title={tr('account.disabledTitle')}
        body={id ? tr('account.disabledBody', { id }) : tr('account.disabledBodyNoId')}
        action={
          supportEmail
            ? { label: tr('account.contactSupport'), onPress: () => mailSupport(supportEmail, tr('account.supportSubject', { id: id ?? '' })) }
            : { label: tr('account.continueGuest'), onPress: () => void onContinueAsGuest() }
        }
      />,
    );
  } else if (account.signedOutNotice) {
    banners.push(
      <Banner
        key="signed-out"
        tone="warning"
        body={tr('account.signedOutNotice')}
        action={{ label: tr('account.signIn'), onPress: () => navigation.navigate('SignIn', {}) }}
        onClose={dismissSignedOutNotice}
      />,
    );
  }
  if (apiConfigured && account.offline && !account.disabled) {
    banners.push(
      <Banner
        key="offline"
        tone="neutral"
        icon="wifi-off"
        body={account.receivedAt ? tr('account.offline', { ago: agoText(account.receivedAt, now, tr) }) : tr('account.offlineNoPlan')}
      />,
    );
  }

  const version = appVersion();
  const build = appBuild() ?? '–';

  return (
    <Screen
      largeTitle={tr('account.title')}
      testID="screen-AccountTab"
      refreshControl={
        apiConfigured ? (
          <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} colors={[t.color.primary]} progressBackgroundColor={t.color.surface2} />
        ) : undefined
      }>
      <View style={styles.stack}>
        {banners.length ? <View style={styles.banners}>{banners}</View> : null}

        {!apiConfigured ? (
          <View style={[styles.local, { backgroundColor: t.color.surface1, borderRadius: t.radius.lg }]}>
            <EmptyState variant="inline" icon="cellphone-lock" title={tr('account.local.title')} body={tr('account.local.body')} />
          </View>
        ) : showSkeleton ? (
          <ProfileCardSkeleton />
        ) : firstLoad ? null : (
          <ProfileCard
            guest={guest}
            name={user?.displayName ?? null}
            email={user?.email ?? null}
            publicId={publicId}
            pro={pro.isPro}
            signUpEnabled={config.auth.signUpEnabled}
            giftWarning={guest && pro.isPro && (pro.source === 'grant' || pro.source === 'promo')}
            onEdit={() => navigation.navigate('EditProfile')}
            onSignUp={() => navigation.navigate('SignUp')}
            onSignIn={() => navigation.navigate('SignIn', {})}
          />
        )}

        {showSkeleton ? <PlanStatusSkeleton /> : <PlanStatusCard status={status} onAction={onPlanAction} />}
      </View>

      <Section title={tr('account.section.plan')}>
        {apiConfigured && config.features.redeemCodes ? (
          <ListItem icon="ticket-percent-outline" title={tr('account.redeem')} chevron onPress={() => navigation.navigate('Redeem', {})} testID="account-redeem" />
        ) : null}
        {pro.storeConnected || apiConfigured ? (
          <ListItem icon="refresh" title={tr('account.restore')} loading={restoring} disabled={restoring} onPress={() => void onRestore()} testID="account-restore" />
        ) : null}
        {!pro.storeConnected && !apiConfigured ? (
          <ListItem icon="crown-outline" title={tr('account.plan.pro')} chevron onPress={() => navigation.navigate('Paywall', {})} />
        ) : null}
      </Section>

      <Section title={tr('account.section.app')}>
        <ListItem icon="cog-outline" title={tr('account.settings')} chevron onPress={() => navigation.navigate('Settings')} testID="account-settings" />
        <ListItem
          icon="shield-check-outline"
          title={tr('account.reliability')}
          chevron
          accessibilityLabel={reliability ? `${tr('account.reliability')}, ${reliability.label}` : undefined}
          trailing={reliability ? <Badge label={reliability.label} tone={reliability.tone} /> : undefined}
          onPress={() => navigation.navigate('Setup', { entry: 'account' })}
        />
        <ListItem icon="lifebuoy" title={tr('account.help')} chevron onPress={() => navigation.navigate('Help')} />
      </Section>

      {admin ? (
        <Section title={tr('account.section.admin')}>
          <ListItem
            icon="shield-crown-outline"
            title={tr('account.admin')}
            subtitle={tr('account.adminBody')}
            chevron
            onPress={() => navigation.navigate('AdminHome')}
            testID="account-admin"
          />
        </Section>
      ) : null}

      {apiConfigured && session ? (
        <Section title={tr('account.section.account')}>
          {!guest ? <ListItem icon="lock-reset" title={tr('account.changePassword')} chevron onPress={() => navigation.navigate('ChangePassword')} /> : null}
          {!guest ? <ListItem icon="cellphone-off" title={tr('account.signOutOthers')} onPress={() => void onSignOutOthers()} /> : null}
          <ListItem icon="download-outline" title={tr('account.export')} loading={exporting} disabled={exporting} onPress={() => void onExport()} />
          {!guest ? <ListItem icon="logout" title={tr('account.signOut')} onPress={() => void onSignOut()} testID="account-sign-out" /> : null}
          {account.disabled ? <ListItem icon="account-convert-outline" title={tr('account.continueGuest')} onPress={() => void onContinueAsGuest()} /> : null}
          <ListItem
            icon="delete-outline"
            title={guest ? tr('account.deleteData') : tr('account.deleteAccount')}
            destructive
            onPress={() => navigation.navigate('DeleteAccount')}
            testID="account-delete"
          />
        </Section>
      ) : null}

      <AppText variant="bodyS" color="textTertiary" align="center" tabular style={styles.footer}>
        {publicId ? tr('account.footer', { version, build, id: publicId }) : tr('account.footerNoId', { version, build })}
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 16, paddingTop: 8 },
  banners: { gap: 8, marginHorizontal: 16 },
  local: { marginHorizontal: 16 },
  footer: { marginTop: 24, paddingHorizontal: 16 },
});
