import { useEffect, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { adminApi, invalidateAdmin, useAdminQuery, type ResetCode } from '../../api/admin';
import type { AdminGrant, AdminNote, AdminStoreSubscription, AdminUserDetail, StoreId } from '../../api/types';
import { useI18n } from '../../i18n';
import { openSheet } from '../../navigation/sheet';
import type { RootScreenProps } from '../../navigation/types';
import {
  AppText,
  Avatar,
  Badge,
  Banner,
  Button,
  Card,
  Dialog,
  IconButton,
  ListItem,
  PlanBadge,
  Section,
  SkeletonCard,
  Touchable,
  useTheme,
  type BadgeTone,
} from '../../ui';
import { AdminScreen, useAdminContext, withAdmin } from './components/AdminFrame';
import { USER_CHANGED, useAdminAction, useCopy, useNow } from './components/actions';
import { ErrorState, FlagBox, IdChip, KeyValueCard } from './components/parts';
import { AuditRow, StoreEventRow } from './components/rows';
import { rememberAudit } from './lib/auditMemory';
import { countryName } from './lib/countries';
import { daysLabelKey, wholeDays } from './lib/durations';
import { formatDate, formatDateTime, formatMoney, formatRange, formatRelative, formatTime, formatUsd, toDate } from './lib/format';
import { grantCounts, latestExtendableGrant, previewRevoke } from './lib/plan';
import { LANGUAGE_NAMES } from './lib/settings';
import type { AdminKey } from './lib/text';
import { PLAN_LABEL, planName } from './lib/users';

const STORE_NAME: Record<StoreId, AdminKey> = {
  play_store: 'admin.store.name.play',
  app_store: 'admin.store.name.apple',
  stripe: 'admin.store.name.stripe',
  amazon: 'admin.store.name.amazon',
  promotional: 'admin.store.name.promotional',
  test_store: 'admin.store.name.test',
  other: 'admin.store.name.other',
};

const GRANT_TONE: Record<AdminGrant['status'], BadgeTone> = { active: 'success', expired: 'neutral', revoked: 'danger' };

/**
 * Route `AdminUser` (backend-spec 7.7, ui-critiques "AdminUser"): who they are, their plan and
 * where it comes from, gifts and codes, store subscriptions, devices, notes, history and store
 * events, and every action on the account.
 */
function AdminUser({ navigation, route }: RootScreenProps<'AdminUser'>) {
  const { t } = useI18n();
  const theme = useTheme();
  const act = useAdminAction();
  const copy = useCopy();
  const { offline, me } = useAdminContext();
  const ref = route.params.userId;
  const query = useAdminQuery(`user:${ref}`, () => adminApi.user(ref));
  const [resetCode, setResetCode] = useState<{ code: ResetCode; who: string } | null>(null);
  const now = useNow();
  const detail = query.data;
  useEffect(() => rememberAudit(detail?.audit), [detail]);

  if (!detail) {
    return (
      <AdminScreen title={t('admin.user.title')} testID="screen-AdminUser">
        {query.error ? (
          <ErrorState error={query.error} title={t('admin.user.loadFailed')} onRetry={query.reload} onBack={() => navigation.goBack()} />
        ) : (
          <View style={styles.pad}>
            <SkeletonCard style={styles.skeletonTall} />
            <SkeletonCard />
            <SkeletonCard />
          </View>
        )}
      </AdminScreen>
    );
  }

  const u = detail.user;
  const id = u.id;
  const self = me?.id === id;
  const account = u.kind === 'account';
  const merged = u.status === 'merged';
  const disabled = u.status === 'disabled';
  const who = u.email ?? u.displayName ?? u.publicId;
  const locked = offline || merged;
  const done = <R,>(p: Promise<R>) =>
    p.then((r) => {
      invalidateAdmin(...USER_CHANGED);
      return r;
    });

  // ---- Actions ----

  const revoke = (g: AdminGrant) => {
    const preview = previewRevoke(detail, g.id, t, now);
    void act({
      title: t('admin.user.revoke.title'),
      message: t('admin.user.revoke.body', { after: preview.after }),
      confirmLabel: t('admin.user.revoke.confirm'),
      tone: 'danger',
      icon: 'close-octagon-outline',
      reason: true,
      run: ({ reason }) => done(adminApi.revokeGrant(id, g.id, { reason })),
      success: () => t('admin.user.revoke.done'),
    });
  };

  const grantMenu = async (g: AdminGrant) => {
    const canExtend = g.status !== 'revoked' && g.endsAt !== null;
    const canRevoke = g.status === 'active';
    const choice = await openSheet({
      title: grantTitle(g),
      options: [
        ...(canExtend ? [{ id: 'extend', label: t('admin.user.gift.addTime'), icon: 'calendar-clock' as const, disabled: locked }] : []),
        ...(canRevoke ? [{ id: 'revoke', label: t('admin.user.gift.revoke'), icon: 'close-octagon-outline' as const, destructive: true, disabled: locked }] : []),
      ],
    });
    if (choice === 'extend') navigation.navigate('AdminExtend', { userId: ref, grantId: String(g.id) });
    if (choice === 'revoke') revoke(g);
  };

  const noteMenu = async (n: AdminNote) => {
    const choice = await openSheet({
      title: t('admin.user.note.menu'),
      options: [
        { id: 'edit', label: t('admin.user.note.edit'), icon: 'pencil-outline', disabled: offline },
        { id: 'delete', label: t('admin.user.note.delete'), icon: 'delete-outline', destructive: true, disabled: offline },
      ],
    });
    if (choice === 'edit') navigation.navigate('AdminNote', { userId: ref, noteId: String(n.id) });
    if (choice === 'delete') {
      void act({
        title: t('admin.user.note.deleteTitle'),
        message: t('admin.user.note.deleteBody'),
        confirmLabel: t('admin.common.delete'),
        tone: 'danger',
        run: () => done(adminApi.deleteNote(n.id)),
        success: () => t('admin.user.note.deleted'),
      });
    }
  };

  const setRole = (role: 'admin' | 'user') =>
    void act({
      title: role === 'admin' ? t('admin.user.role.makeTitle', { who }) : t('admin.user.role.removeTitle', { who }),
      message: role === 'admin' ? t('admin.user.role.makeBody') : t('admin.user.role.removeBody'),
      confirmLabel: role === 'admin' ? t('admin.user.role.make') : t('admin.user.role.remove'),
      tone: role === 'admin' ? 'default' : 'danger',
      icon: 'shield-account-outline',
      password: role === 'admin',
      run: () => done(adminApi.setRole(id, role)),
      success: () => (role === 'admin' ? t('admin.user.role.made', { who }) : t('admin.user.role.removed', { who })),
    });

  const signOutAll = () =>
    void act({
      title: t('admin.user.signOut.title'),
      message: t('admin.user.signOut.body', { count: u.activeSessions }),
      confirmLabel: t('admin.user.signOut.confirm'),
      icon: 'logout',
      run: () => done(adminApi.signOutAll(id)),
      success: (r) => t('admin.user.signOut.done', { count: r.revoked }),
    });

  const createResetCode = () =>
    void act({
      title: t('admin.user.reset.title'),
      message: t('admin.user.reset.body'),
      confirmLabel: t('admin.user.reset.confirm'),
      icon: 'form-textbox-password',
      run: () => done(adminApi.resetCode(id)),
      after: (code) => setResetCode({ code, who }),
    });

  const sync = () =>
    void act({
      title: t('admin.user.sync.title'),
      message: t('admin.user.sync.body'),
      confirmLabel: t('admin.user.sync.confirm'),
      icon: 'sync',
      run: () => done(adminApi.sync(id)),
      success: (r) => (r.synced ? t('admin.user.sync.done') : t('admin.user.sync.nothing')),
    });

  const disable = () =>
    void act({
      title: t('admin.user.disable.title', { who }),
      message: t('admin.user.disable.body'),
      confirmLabel: t('admin.user.disable.confirm'),
      tone: 'danger',
      icon: 'account-cancel-outline',
      reason: true,
      run: ({ reason }) => done(adminApi.disable(id, { reason })),
      success: () => t('admin.user.disable.done', { who }),
    });

  const enable = () =>
    void act({
      title: t('admin.user.enable.title', { who }),
      message: t('admin.user.enable.body'),
      confirmLabel: t('admin.user.enable.confirm'),
      icon: 'account-check',
      run: () => done(adminApi.enable(id)),
      success: () => t('admin.user.enable.done', { who }),
    });

  const remove = () =>
    void act({
      title: t('admin.user.delete.title'),
      message: detail.storeSubscriptions.some((s) => s.status !== 'expired' && s.status !== 'refunded')
        ? t('admin.user.delete.bodyStore', { id: u.publicId })
        : t('admin.user.delete.body', { id: u.publicId }),
      confirmLabel: t('admin.user.delete.confirm'),
      tone: 'danger',
      icon: 'delete-forever-outline',
      requireText: u.publicId,
      reason: true,
      password: true,
      run: ({ reason }) => adminApi.deleteUser(id, { confirm: u.publicId, reason }),
      success: () => t('admin.user.delete.done', { id: u.publicId }),
      after: () => {
        invalidateAdmin('users', 'dashboard', 'audit', 'promo');
        navigation.goBack();
      },
    });

  const more = async () => {
    const choice = await openSheet({
      title: who,
      options: [
        { id: 'edit', label: t('admin.user.menu.edit'), icon: 'account-edit-outline', disabled: locked },
        ...(account ? [{ id: 'reset', label: t('admin.user.menu.reset'), icon: 'form-textbox-password' as const, disabled: locked }] : []),
        { id: 'signout', label: t('admin.user.menu.signOut'), icon: 'logout', disabled: offline || u.activeSessions === 0 },
        ...(account
          ? [
              u.role === 'admin'
                ? {
                    id: 'unadmin',
                    label: t('admin.user.menu.removeAdmin'),
                    description: self ? t('admin.common.selfBlocked') : undefined,
                    icon: 'shield-off-outline' as const,
                    disabled: offline || self,
                  }
                : { id: 'admin', label: t('admin.user.menu.makeAdmin'), icon: 'shield-account-outline' as const, disabled: locked || disabled },
            ]
          : []),
        { id: 'sync', label: t('admin.user.menu.sync'), icon: 'sync', disabled: locked },
        { id: 'copyRc', label: t('admin.user.menu.copyRc'), icon: 'content-copy' },
        { id: 'history', label: t('admin.user.menu.history'), icon: 'history' },
      ],
    });
    switch (choice) {
      case 'edit':
        navigation.navigate('AdminEditUser', { userId: ref });
        break;
      case 'reset':
        createResetCode();
        break;
      case 'signout':
        signOutAll();
        break;
      case 'admin':
        setRole('admin');
        break;
      case 'unadmin':
        setRole('user');
        break;
      case 'sync':
        sync();
        break;
      case 'copyRc':
        copy(id, t('admin.user.rcId'));
        break;
      case 'history':
        navigation.navigate('AdminAudit', { userId: u.publicId });
        break;
      default:
        break;
    }
  };

  // ---- Texts ----

  function grantTitle(g: AdminGrant): string {
    const plan = t(PLAN_LABEL[g.plan]);
    if (g.source === 'promo') return t('admin.user.gift.codeTitle', { code: g.promoCode ?? '—', plan });
    if (!g.endsAt) return t('admin.user.gift.lifetimeTitle');
    const start = toDate(g.startsAt);
    const end = toDate(g.endsAt);
    const length = start && end ? daysLabelKey(Math.max(1, wholeDays(start, end))) : null;
    return t('admin.user.gift.title', { plan, length: length ? t(length.key, length.params) : '' });
  }

  function grantSubtitle(g: AdminGrant): string {
    const parts = [formatRange(g.startsAt, g.endsAt, t)];
    if (g.createdBy) parts.push(t('admin.user.gift.by', { name: g.createdBy.displayName ?? g.createdBy.publicId }));
    if (g.reason) parts.push(`“${g.reason}”`);
    if (g.status === 'revoked' && g.revokedAt) {
      parts.push(t('admin.user.gift.revokedOn', { date: formatDate(g.revokedAt), reason: g.revokeReason ?? '' }));
    }
    return parts.join(' · ');
  }

  const plan = detail.plan;
  const activeGrant = plan.source === 'grant' || plan.source === 'promo' ? bestGrant(detail, now) : null;
  const planStatus = (() => {
    if (disabled) return t('admin.preview.disabled');
    if (!plan.isPro) return t('admin.user.plan.none');
    if (!plan.expiresAt) return t('admin.user.plan.forever');
    const date = formatDate(plan.expiresAt, { weekday: true });
    if (plan.trial) return t('admin.user.plan.trialUntil', { date });
    if (plan.status === 'billing_issue' || plan.status === 'grace_period') return t('admin.user.plan.problem', { date });
    if (plan.willRenew) return t('admin.user.plan.renews', { date });
    return t('admin.user.plan.until', { date });
  })();
  const planSource = (() => {
    if (!plan.isPro || !plan.source) return null;
    if (plan.source === 'store') return t('admin.user.plan.sourceStore', { product: plan.productId ?? '—' });
    if (plan.source === 'promo') return t('admin.user.plan.sourceCode', { code: plan.promoCode ?? activeGrant?.promoCode ?? '—' });
    const by = activeGrant?.createdBy;
    return by ? t('admin.user.plan.sourceGiftBy', { name: by.displayName ?? by.publicId }) : t('admin.user.plan.sourceGift');
  })();

  const lastDevice = [...detail.devices].sort((a, b) => Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt))[0];
  const metaLine = [
    t('admin.user.joined', { date: formatDate(u.createdAt) }),
    t('admin.user.lastSeen', { when: formatRelative(u.lastSeenAt, t) }),
    lastDevice ? t('admin.user.device', { platform: lastDevice.platform === 'ios' ? 'iOS' : 'Android', os: lastDevice.osVersion ?? '?', version: lastDevice.appVersion, build: lastDevice.build ?? '-' }) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const grants = [...detail.grants].sort((a, b) => {
    const rank = (g: AdminGrant) => (grantCounts(g, now) ? 0 : g.status === 'expired' ? 1 : 2);
    return rank(a) - rank(b) || Date.parse(b.createdAt) - Date.parse(a.createdAt);
  });
  const extendable = latestExtendableGrant(detail.grants, now);

  return (
    <AdminScreen
      title={t('admin.user.title')}
      fetchedAt={query.fetchedAt}
      stale={query.stale}
      actions={<IconButton icon="dots-vertical" accessibilityLabel={t('admin.common.more')} onPress={() => void more()} testID="admin-user-more" />}
      refreshControl={<RefreshControl refreshing={query.refreshing} onRefresh={query.refresh} colors={[theme.color.primary]} tintColor={theme.color.primary} />}
      testID="screen-AdminUser">
      <View style={styles.pad}>
        {disabled ? (
          <Banner
            tone="danger"
            icon="account-cancel-outline"
            title={t('admin.user.disabledTitle', { when: formatRelative(u.disabledAt, t) })}
            body={u.disabledReason ? `“${u.disabledReason}”` : t('admin.user.disabledNoReason')}
            action={self || offline ? undefined : { label: t('admin.user.enable.confirm'), onPress: enable }}
          />
        ) : null}
        {merged && u.mergedInto ? (
          <Banner
            tone="neutral"
            icon="call-merge"
            body={t('admin.user.merged', { id: u.mergedInto.publicId })}
            action={{ label: t('admin.common.open'), onPress: () => navigation.push('AdminUser', { userId: u.mergedInto!.id }) }}
          />
        ) : null}

        {/* Profile */}
        <Card testID="admin-user-profile">
          <View style={styles.profileHead}>
            <Avatar size={64} name={u.displayName} email={u.email} pro={plan.isPro} admin={u.role === 'admin'} disabled={u.status !== 'active'} />
            <View style={styles.flex}>
              <AppText variant="titleM" numberOfLines={2}>
                {u.displayName ?? u.email ?? t('admin.user.guest')}
              </AppText>
              {u.displayName && u.email ? (
                <AppText variant="bodyM" color="textSecondary" numberOfLines={1} selectable>
                  {u.email}
                </AppText>
              ) : null}
              <IdChip id={u.publicId} style={styles.idChip} />
            </View>
          </View>
          <View style={styles.badges}>
            <PlanBadge variant={plan.plan === 'lifetime' ? 'lifetime' : plan.isPro ? 'pro' : 'free'} size="md" />
            {u.role === 'admin' ? <Badge label={t('admin.user.badge.admin')} tone="primary" icon="shield-crown-outline" /> : null}
            {disabled ? <Badge label={t('admin.user.badge.disabled')} tone="danger" /> : null}
            {merged ? <Badge label={t('admin.user.badge.merged')} /> : null}
            <Badge label={account ? t('admin.user.badge.account') : t('admin.user.badge.guest')} />
            {self ? <Badge label={t('admin.common.you')} tone="accent" /> : null}
            {u.country ? (
              <View style={styles.country}>
                <FlagBox country={u.country} size={24} />
                <AppText variant="labelS" color="textSecondary">
                  {countryName(u.country)}
                </AppText>
              </View>
            ) : null}
          </View>
          <AppText variant="bodyS" color="textTertiary">
            {metaLine}
          </AppText>
        </Card>
      </View>

      <KeyValueCard
        title={t('admin.user.details')}
        rows={[
          { label: t('admin.user.field.email'), value: u.email ? `${u.email}${u.emailVerified ? '' : ` · ${t('admin.user.unverified')}`}` : '—', onCopy: u.email ? () => copy(u.email!, t('admin.user.field.email')) : undefined },
          { label: t('admin.user.field.name'), value: u.displayName ?? '—' },
          { label: t('admin.user.field.country'), value: u.country ? `${countryName(u.country)} (${u.country})` : '—' },
          { label: t('admin.user.field.language'), value: u.language ? t(LANGUAGE_NAMES[u.language]) : '—' },
          { label: t('admin.user.field.signedUp'), value: u.signedUpAt ? formatDateTime(u.signedUpAt) : t('admin.user.notSignedUp') },
          { label: t('admin.user.field.password'), value: u.passwordSet ? t('admin.common.yes') : t('admin.common.no'), hidden: !account },
          { label: t('admin.user.field.sessions'), value: String(u.activeSessions), numeric: true },
          { label: t('admin.user.field.id'), value: id, numeric: true, onCopy: () => copy(id, t('admin.user.rcId')) },
        ]}
      />

      {/* Plan */}
      <View style={styles.pad}>
        <Card testID="admin-user-plan">
          <View style={styles.planHead}>
            <PlanBadge variant={plan.plan === 'lifetime' ? 'lifetime' : plan.isPro ? 'pro' : 'free'} size="lg" />
            <AppText variant="titleS" style={styles.flex}>
              {planName(plan.plan, t)}
            </AppText>
          </View>
          <AppText variant="bodyL" tabular>
            {planStatus}
          </AppText>
          {planSource ? (
            <AppText variant="bodyM" color="textSecondary">
              {planSource}
            </AppText>
          ) : null}
          <View style={styles.planButtons}>
            <Button
              label={t('admin.user.giveProShort')}
              icon="gift-outline"
              size="M"
              onPress={() => navigation.navigate('AdminGrant', { userId: ref })}
              disabled={locked}
              style={styles.flex}
              testID="admin-user-grant"
            />
            <Button
              label={t('admin.user.changePlan')}
              icon="swap-horizontal"
              variant="secondary"
              size="M"
              onPress={() => navigation.navigate('AdminChangePlan', { userId: ref })}
              disabled={locked}
              style={styles.flex}
              testID="admin-user-change-plan"
            />
          </View>
        </Card>
      </View>

      <Section
        title={t('admin.user.gifts')}
        count={grants.length ? String(grants.length) : undefined}
        action={locked ? undefined : { label: t('admin.user.gift.addTime'), onPress: () => navigation.navigate('AdminExtend', { userId: ref, grantId: extendable ? String(extendable.id) : undefined }) }}
        empty={<AppText variant="bodyM" color="textTertiary" style={styles.emptyRow}>{t('admin.user.noGifts')}</AppText>}>
        {grants.map((g) => {
          const actionable = !locked && (g.status === 'active' || (g.status === 'expired' && g.endsAt !== null));
          return (
            <ListItem
              key={g.id}
              icon={g.source === 'promo' ? 'ticket-percent-outline' : 'gift-outline'}
              iconColor={g.status === 'active' ? 'success' : 'textTertiary'}
              title={grantTitle(g)}
              subtitle={grantSubtitle(g)}
              subtitleLines={2}
              trailing={<Badge label={t(`admin.user.gift.status.${g.status}`)} tone={GRANT_TONE[g.status]} size="sm" />}
              onPress={actionable ? () => void grantMenu(g) : undefined}
              accessibilityHint={actionable ? t('admin.user.gift.hint') : undefined}
            />
          );
        })}
      </Section>

      {detail.storeSubscriptions.length ? (
        detail.storeSubscriptions.map((s) => (
          <KeyValueCard
            key={s.id}
            title={t('admin.user.storeSub', { store: t(STORE_NAME[s.store]) })}
            rows={storeRows(s)}
            footer={
              <ListItem icon="sync" title={t('admin.user.menu.sync')} onPress={locked ? undefined : sync} disabled={locked} chevron />
            }
          />
        ))
      ) : (
        <Section title={t('admin.user.storeSubs')}>
          <ListItem title={t('admin.user.noStore')} subtitle={t('admin.user.noStoreBody')} icon="google-play" onPress={locked ? undefined : sync} />
        </Section>
      )}

      {detail.redemptions.length ? (
        <Section title={t('admin.user.codes')}>
          {detail.redemptions.map((r) => (
            <ListItem
              key={`${r.promoCodeId}-${r.redeemedAt}`}
              icon="ticket-percent-outline"
              title={r.code}
              subtitle={t('admin.user.codeRedeemed', { date: formatDateTime(r.redeemedAt) })}
              trailing={r.grantStatus ? <Badge label={t(`admin.user.gift.status.${r.grantStatus}`)} tone={GRANT_TONE[r.grantStatus]} size="sm" /> : undefined}
              chevron
              onPress={() => navigation.navigate('AdminPromoCode', { codeId: String(r.promoCodeId) })}
            />
          ))}
        </Section>
      ) : null}

      <Section title={t('admin.user.devices')} empty={<AppText variant="bodyM" color="textTertiary" style={styles.emptyRow}>{t('admin.user.noDevices')}</AppText>}>
        {detail.devices.map((d) => (
          <ListItem
            key={d.id}
            icon={d.platform === 'ios' ? 'apple' : 'android'}
            title={t('admin.user.device', { platform: d.platform === 'ios' ? 'iOS' : 'Android', os: d.osVersion ?? '?', version: d.appVersion, build: d.build ?? '-' })}
            subtitle={[
              d.country ? countryName(d.country) : null,
              d.language,
              t('admin.users.seen', { when: formatRelative(d.lastSeenAt, t) }),
              t('admin.user.sessions', { count: d.activeSessions }),
              t('admin.user.firstSeen', { date: formatDate(d.createdAt) }),
            ]
              .filter(Boolean)
              .join(' · ')}
            subtitleLines={2}
          />
        ))}
      </Section>

      <Section title={t('admin.user.notes')} count={detail.notes.length ? String(detail.notes.length) : undefined}>
        {detail.notes.map((n) => (
          <NoteRow key={n.id} note={n} onPress={() => void noteMenu(n)} />
        ))}
        <ListItem icon="note-plus-outline" iconColor="primary" title={t('admin.user.note.add')} onPress={offline ? undefined : () => navigation.navigate('AdminNote', { userId: ref })} disabled={offline} testID="admin-user-add-note" />
      </Section>

      <Section
        title={t('admin.user.history')}
        action={detail.audit.length ? { label: t('admin.common.seeAll'), onPress: () => navigation.navigate('AdminAudit', { userId: u.publicId }) } : undefined}
        empty={<AppText variant="bodyM" color="textTertiary" style={styles.emptyRow}>{t('admin.user.noHistory')}</AppText>}>
        {detail.audit.slice(0, 8).map((e) => (
          <AuditRow key={e.id} entry={e} showDate onPress={() => navigation.navigate('AdminAuditEntry', { entryId: String(e.id) })} />
        ))}
      </Section>

      {detail.storeEvents.length ? (
        <Section title={t('admin.user.storeEvents')}>
          {detail.storeEvents.map((e) => (
            <StoreEventRow key={e.id} event={e} onPress={() => navigation.navigate('AdminStoreEvent', { eventId: e.id })} />
          ))}
        </Section>
      ) : null}

      <Section title={t('admin.user.danger')} footer={self ? t('admin.common.selfBlocked') : undefined}>
        {disabled ? (
          <ListItem icon="account-check" title={t('admin.user.enable.confirm')} onPress={enable} disabled={offline || self} testID="admin-user-enable" />
        ) : (
          <ListItem
            icon="account-cancel-outline"
            title={t('admin.user.disable.confirm')}
            subtitle={t('admin.user.disable.short')}
            destructive
            onPress={disable}
            disabled={locked || self}
            testID="admin-user-disable"
          />
        )}
        <ListItem
          icon="delete-forever-outline"
          title={t('admin.user.delete.confirm')}
          subtitle={t('admin.user.delete.short')}
          destructive
          onPress={remove}
          disabled={offline || self}
          testID="admin-user-delete"
        />
      </Section>

      <Dialog
        visible={!!resetCode}
        onDismiss={() => setResetCode(null)}
        title={t('admin.user.reset.shownTitle')}
        message={resetCode ? t('admin.user.reset.shownBody', { who: resetCode.who, time: formatTime(resetCode.code.expiresAt) }) : undefined}
        icon="form-textbox-password"
        actions={
          <>
            <Button label={t('admin.common.copy')} icon="content-copy" variant="secondary" size="M" onPress={() => resetCode && copy(resetCode.code.code, t('admin.user.reset.code'))} />
            <Button label={t('admin.common.done')} variant="primary" size="M" onPress={() => setResetCode(null)} />
          </>
        }>
        <View style={[styles.codeBox, { backgroundColor: theme.color.fill, borderRadius: theme.radius.md }]}>
          <AppText variant="numL" align="center" selectable style={styles.code} testID="admin-reset-code">
            {resetCode?.code.code ?? ''}
          </AppText>
        </View>
      </Dialog>
    </AdminScreen>
  );

  function storeRows(s: AdminStoreSubscription) {
    const end = s.expiresAt ? formatDate(s.expiresAt) : null;
    let status: string;
    if (s.status === 'trialing') status = t('admin.user.sub.trial', { date: end ?? '—' });
    else if (s.status === 'billing_issue' || s.status === 'grace_period') status = t('admin.user.sub.problem', { date: formatDate(s.graceUntil ?? s.expiresAt) });
    else if (s.status === 'expired') status = t('admin.user.sub.expired', { date: end ?? '—' });
    else if (s.status === 'refunded') status = t('admin.user.sub.refunded');
    else if (s.status === 'revoked') status = t('admin.user.sub.revoked');
    else if (s.status === 'paused') status = t('admin.user.sub.paused');
    else if (!s.expiresAt) status = t('admin.user.sub.lifetime');
    else status = s.willRenew ? t('admin.user.sub.renews', { date: end ?? '—' }) : t('admin.user.sub.cancelled', { date: end ?? '—' });
    const price = [s.priceLocal != null ? formatMoney(s.priceLocal, s.currency) : null, s.priceUsd != null ? formatUsd(s.priceUsd) : null]
      .filter(Boolean)
      .join(' · ');
    return [
      { label: t('admin.user.sub.product'), value: `${s.productId} (${t(PLAN_LABEL[s.plan])})` },
      { label: t('admin.user.sub.status'), value: status },
      { label: t('admin.user.sub.env'), value: s.environment === 'sandbox' ? t('admin.common.sandbox') : t('admin.user.sub.production') },
      { label: t('admin.user.sub.since'), value: formatDate(s.purchasedAt) },
      { label: t('admin.user.sub.grace'), value: formatDate(s.graceUntil), hidden: !s.graceUntil },
      { label: t('admin.user.sub.cancelReason'), value: s.cancelReason ?? '', hidden: !s.cancelReason },
      { label: t('admin.user.sub.price'), value: price || '—', numeric: true },
      { label: t('admin.user.sub.country'), value: s.country ? countryName(s.country) : '—', hidden: !s.country },
      { label: t('admin.user.sub.order'), value: s.originalTransactionId, numeric: true, onCopy: () => copy(s.originalTransactionId, t('admin.user.sub.order')) },
      {
        label: t('admin.user.sub.lastEvent'),
        value: s.lastEventType ? `${s.lastEventType} · ${formatDateTime(s.lastEventAt)}` : formatDateTime(s.lastEventAt),
      },
    ];
  }
}

/** The active gift or code that gives the current plan (for "Source: gift from …"). */
function bestGrant(detail: AdminUserDetail, now: number): AdminGrant | null {
  const active = detail.grants.filter((g) => grantCounts(g, now));
  if (!active.length) return null;
  return active.reduce((a, b) => {
    const ea = a.endsAt ? Date.parse(a.endsAt) : Infinity;
    const eb = b.endsAt ? Date.parse(b.endsAt) : Infinity;
    return eb > ea ? b : a;
  });
}

function NoteRow({ note, onPress }: { note: AdminNote; onPress: () => void }) {
  const { t } = useI18n();
  const theme = useTheme();
  const edited = note.updatedAt !== note.createdAt;
  const author = note.author ? (note.author.displayName ?? note.author.publicId) : t('admin.user.note.unknownAuthor');
  return (
    <Touchable onPress={onPress} accessibilityRole="button" accessibilityHint={t('admin.user.note.hint')} style={styles.note}>
      <AppText variant="bodyM" selectable>
        {note.body}
      </AppText>
      <AppText variant="bodyS" color="textTertiary">
        {t(edited ? 'admin.user.note.metaEdited' : 'admin.user.note.meta', { author, date: formatDateTime(note.createdAt) })}
      </AppText>
      <View style={[styles.noteDivider, { backgroundColor: theme.color.border }]} />
    </Touchable>
  );
}

export const AdminUserScreen = withAdmin(AdminUser);

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pad: { paddingHorizontal: 16, paddingTop: 16, gap: 12 },
  skeletonTall: { height: 160 },
  profileHead: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  idChip: { marginTop: 8 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  country: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  planHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  planButtons: { flexDirection: 'row', gap: 12, flexWrap: 'wrap', marginTop: 4 },
  emptyRow: { padding: 16 },
  note: { paddingHorizontal: 16, paddingVertical: 12, gap: 4 },
  noteDivider: { position: 'absolute', left: 16, right: 0, bottom: 0, height: StyleSheet.hairlineWidth },
  codeBox: { paddingVertical: 16, paddingHorizontal: 12 },
  code: { letterSpacing: 2 },
});
