import { RefreshControl, StyleSheet, View } from 'react-native';

import { adminApi, invalidateAdmin, useAdminQuery } from '../../api/admin';
import { useI18n } from '../../i18n';
import type { RootScreenProps } from '../../navigation/types';
import { AppText, Avatar, Badge, Card, IconButton, ListItem, ProgressBar, Section, SkeletonCard, useTheme } from '../../ui';
import { AdminScreen, useAdminContext, withAdmin } from './components/AdminFrame';
import { useAdminAction, useCopy } from './components/actions';
import { ErrorState, Footnote, KeyValueCard } from './components/parts';
import { formatDate, formatDateTime } from './lib/format';
import { describeGift, PROMO_STATUS_LABEL, PROMO_STATUS_TONE, redeemLink, usageText } from './lib/promo';
import { PLAN_LABEL } from './lib/users';

const PROMO_CHANGED = ['promo', 'dashboard', 'audit'];

/**
 * Route `AdminPromoCode` (backend-spec 7.7): one code with what it gives, its use and validity, the
 * newest 100 redemptions, Edit, Copy, and Delete while unused (otherwise Turn off).
 */
function AdminPromoCode({ navigation, route }: RootScreenProps<'AdminPromoCode'>) {
  const { t } = useI18n();
  const theme = useTheme();
  const act = useAdminAction();
  const copy = useCopy();
  const { offline } = useAdminContext();
  const id = Number(route.params.codeId);
  const query = useAdminQuery(`promo:${id}`, () => adminApi.promoCode(id));
  const data = query.data;

  if (!data) {
    return (
      <AdminScreen title={t('admin.promo.title')} testID="screen-AdminPromoCode">
        {query.error ? (
          <ErrorState error={query.error} title={t('admin.promo.loadFailed')} onRetry={query.reload} onBack={() => navigation.goBack()} />
        ) : (
          <View style={styles.pad}>
            <SkeletonCard />
            <SkeletonCard />
          </View>
        )}
      </AdminScreen>
    );
  }

  const p = data.promoCode;
  const used = p.redemptionCount > 0;

  const toggle = () =>
    void act({
      title: p.active ? t('admin.promo.offTitle', { code: p.code }) : t('admin.promo.onTitle', { code: p.code }),
      message: p.active ? t('admin.promo.offBody') : t('admin.promo.onBody'),
      confirmLabel: p.active ? t('admin.promo.off') : t('admin.promo.on'),
      tone: p.active ? 'danger' : 'default',
      icon: p.active ? 'ticket-outline' : 'ticket-percent-outline',
      run: () => adminApi.updatePromo(p.id, { active: !p.active }),
      success: () => (p.active ? t('admin.promo.offDone', { code: p.code }) : t('admin.promo.onDone', { code: p.code })),
      after: () => invalidateAdmin(...PROMO_CHANGED),
    });

  const remove = () =>
    void act({
      title: t('admin.promo.deleteTitle', { code: p.code }),
      message: t('admin.promo.deleteBody'),
      confirmLabel: t('admin.promo.delete'),
      tone: 'danger',
      icon: 'delete-outline',
      run: () => adminApi.deletePromo(p.id),
      success: () => t('admin.promo.deleted', { code: p.code }),
      after: () => {
        invalidateAdmin(...PROMO_CHANGED);
        navigation.goBack();
      },
    });

  return (
    <AdminScreen
      title={t('admin.promo.title')}
      fetchedAt={query.fetchedAt}
      stale={query.stale}
      actions={
        <IconButton icon="pencil-outline" accessibilityLabel={t('admin.promo.edit')} onPress={() => navigation.navigate('AdminPromoNew', { codeId: String(p.id) })} disabled={offline} testID="admin-promo-edit" />
      }
      refreshControl={<RefreshControl refreshing={query.refreshing} onRefresh={query.refresh} colors={[theme.color.primary]} tintColor={theme.color.primary} />}
      testID="screen-AdminPromoCode">
      <View style={styles.pad}>
        <Card>
          <View style={styles.codeRow}>
            <AppText variant="numM" selectable style={styles.code} testID="admin-promo-code">
              {p.code}
            </AppText>
            <IconButton icon="content-copy" accessibilityLabel={t('admin.promo.copyCode')} onPress={() => copy(p.code, p.code)} />
          </View>
          <View style={styles.badges}>
            <Badge label={t(PROMO_STATUS_LABEL[p.status])} tone={PROMO_STATUS_TONE[p.status]} dot />
            <Badge label={describeGift(p.plan, p.durationDays, t)} tone="accent" icon="crown-outline" />
          </View>
          {p.description ? (
            <AppText variant="bodyM" color="textSecondary">
              {p.description}
            </AppText>
          ) : null}
          {p.maxRedemptions ? (
            <View style={styles.usage}>
              <ProgressBar progress={p.redemptionCount / p.maxRedemptions} accessibilityLabel={usageText(p, t)} />
              <AppText variant="bodyS" color="textSecondary" tabular>
                {usageText(p, t)}
              </AppText>
            </View>
          ) : null}
        </Card>
      </View>

      <KeyValueCard
        title={t('admin.promo.details')}
        rows={[
          { label: t('admin.promo.gives'), value: describeGift(p.plan, p.durationDays, t) },
          { label: t('admin.form.plan'), value: t(PLAN_LABEL[p.plan]) },
          { label: t('admin.promo.usedLabel'), value: usageText(p, t), numeric: true },
          { label: t('admin.promo.validFrom'), value: p.startsAt ? formatDateTime(p.startsAt) : t('admin.promo.now') },
          { label: t('admin.promo.validUntil'), value: p.expiresAt ? formatDateTime(p.expiresAt) : t('admin.promo.noEnd') },
          { label: t('admin.promo.createdBy'), value: p.createdBy ? (p.createdBy.displayName ?? p.createdBy.publicId) : '—' },
          { label: t('admin.promo.created'), value: formatDate(p.createdAt) },
          { label: t('admin.promo.updated'), value: formatDateTime(p.updatedAt) },
        ]}
      />
      <Footnote>{t('admin.promo.rule')}</Footnote>

      <Section title={t('admin.promo.share')}>
        <ListItem icon="content-copy" title={t('admin.promo.copyCode')} onPress={() => copy(p.code, p.code)} />
        <ListItem
          icon="link-variant"
          title={t('admin.promo.copyLink')}
          subtitle={t('admin.promo.copyLinkBody', { link: redeemLink(p.code) })}
          onPress={() => copy(redeemLink(p.code), t('admin.promo.link'))}
        />
      </Section>

      <Section
        title={t('admin.promo.redemptions')}
        count={used ? String(p.redemptionCount) : undefined}
        empty={
          <AppText variant="bodyM" color="textTertiary" style={styles.emptyRow}>
            {t('admin.promo.noRedemptions')}
          </AppText>
        }>
        {data.redemptions.map((r) => (
          <ListItem
            key={`${r.user.id}-${r.redeemedAt}`}
            leading={<Avatar size={32} name={r.user.displayName} email={r.user.email} />}
            leadingWidth={32}
            title={r.user.email ?? r.user.displayName ?? r.user.publicId}
            subtitle={`${r.user.publicId} · ${formatDateTime(r.redeemedAt)}`}
            trailing={r.grantStatus ? <Badge label={t(`admin.user.gift.status.${r.grantStatus}`)} tone={r.grantStatus === 'active' ? 'success' : r.grantStatus === 'revoked' ? 'danger' : 'neutral'} size="sm" /> : undefined}
            chevron
            onPress={() => navigation.navigate('AdminUser', { userId: r.user.id })}
          />
        ))}
      </Section>
      {p.redemptionCount > data.redemptions.length ? <Footnote>{t('admin.promo.newest', { count: data.redemptions.length })}</Footnote> : null}

      <Section title={t('admin.user.danger')} footer={used ? t('admin.promo.usedFoot') : undefined}>
        <ListItem
          icon={p.active ? 'ticket-outline' : 'ticket-percent-outline'}
          title={p.active ? t('admin.promo.off') : t('admin.promo.on')}
          subtitle={p.active ? t('admin.promo.offShort') : t('admin.promo.onShort')}
          destructive={p.active}
          onPress={toggle}
          disabled={offline}
          testID="admin-promo-toggle"
        />
        {!used ? (
          <ListItem icon="delete-outline" title={t('admin.promo.delete')} subtitle={t('admin.promo.deleteShort')} destructive onPress={remove} disabled={offline} testID="admin-promo-delete" />
        ) : null}
      </Section>
    </AdminScreen>
  );
}

export const AdminPromoCodeScreen = withAdmin(AdminPromoCode);

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 16, paddingTop: 16, gap: 12 },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  code: { flex: 1, letterSpacing: 0.5 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  usage: { gap: 6 },
  emptyRow: { padding: 16 },
});
