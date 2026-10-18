import { RefreshControl, StyleSheet, View } from 'react-native';

import { adminApi, invalidateAdmin, useAdminQuery } from '../../api/admin';
import { useI18n } from '../../i18n';
import type { RootScreenProps } from '../../navigation/types';
import { AppText, Badge, Banner, Button, Card, SkeletonCard, useTheme } from '../../ui';
import { AdminScreen, useAdminContext, withAdmin } from './components/AdminFrame';
import { useAdminAction, useCopy } from './components/actions';
import { CodeBlock, ErrorState, KeyValueCard } from './components/parts';
import { STORE_STATUS_LABEL, STORE_STATUS_TONE } from './components/rows';
import { formatFullDateTime } from './lib/format';

/**
 * Route `AdminStoreEvent` (backend-spec 2.10 GET /store-events/:id and POST …/retry): one RevenueCat
 * delivery with its user, times and error, the stored payload (copyable), and Retry for unmatched
 * or failed events.
 */
function AdminStoreEvent({ navigation, route }: RootScreenProps<'AdminStoreEvent'>) {
  const { t } = useI18n();
  const theme = useTheme();
  const act = useAdminAction();
  const copy = useCopy();
  const { offline } = useAdminContext();
  const id = route.params.eventId;
  const query = useAdminQuery(`store-event:${id}`, () => adminApi.storeEvent(id));
  const data = query.data;

  if (!data) {
    return (
      <AdminScreen title={t('admin.storeEvent.title')} testID="screen-AdminStoreEvent">
        {query.error ? (
          <ErrorState error={query.error} title={t('admin.storeEvent.loadFailed')} onRetry={query.reload} onBack={() => navigation.goBack()} />
        ) : (
          <View style={styles.pad}>
            <SkeletonCard />
            <SkeletonCard />
          </View>
        )}
      </AdminScreen>
    );
  }

  const e = data.event;
  const retryable = e.status === 'unmatched' || e.status === 'error';
  const retry = () =>
    void act({
      title: t('admin.storeEvent.retryTitle'),
      message: e.status === 'unmatched' ? t('admin.storeEvent.retryUnmatched') : t('admin.storeEvent.retryError'),
      confirmLabel: t('admin.storeEvent.retry'),
      icon: 'refresh',
      run: () => adminApi.retryStoreEvent(e.id),
      success: (r) => t('admin.storeEvent.retried', { status: t(STORE_STATUS_LABEL[r.event.status]) }),
      after: () => invalidateAdmin('store-event', 'user:', 'users', 'dashboard', 'audit'),
    });

  return (
    <AdminScreen
      title={t('admin.storeEvent.title')}
      fetchedAt={query.fetchedAt}
      stale={query.stale}
      refreshControl={<RefreshControl refreshing={query.refreshing} onRefresh={query.refresh} colors={[theme.color.primary]} tintColor={theme.color.primary} />}
      testID="screen-AdminStoreEvent">
      <View style={styles.pad}>
        <Card>
          <AppText variant="titleM" selectable>
            {e.type}
          </AppText>
          <View style={styles.badges}>
            <Badge label={t(STORE_STATUS_LABEL[e.status])} tone={STORE_STATUS_TONE[e.status]} dot />
            {e.environment ? <Badge label={e.environment === 'sandbox' ? t('admin.common.sandbox') : t('admin.user.sub.production')} tone={e.environment === 'sandbox' ? 'warning' : 'neutral'} /> : null}
          </View>
          <AppText variant="bodyM" color="textSecondary">
            {t(`admin.storeEvent.explain.${e.status}`)}
          </AppText>
        </Card>
        {e.error ? <Banner tone="danger" title={t('admin.storeEvent.error')} body={e.error} /> : null}
        {retryable ? (
          <Button label={t('admin.storeEvent.retry')} icon="refresh" size="M" onPress={retry} disabled={offline} testID="admin-store-event-retry" />
        ) : null}
      </View>

      <KeyValueCard
        title={t('admin.storeEvent.details')}
        rows={[
          { label: t('admin.storeEvent.user'), value: e.user ? [e.user.displayName, e.user.publicId].filter(Boolean).join(' · ') : t('admin.store.noUser') },
          { label: t('admin.storeEvent.appUserId'), value: e.appUserId ?? '—', numeric: true, onCopy: e.appUserId ? () => copy(e.appUserId!, t('admin.storeEvent.appUserId')) : undefined },
          { label: t('admin.storeEvent.id'), value: e.id, numeric: true, onCopy: () => copy(e.id, t('admin.storeEvent.id')) },
          { label: t('admin.storeEvent.eventAt'), value: formatFullDateTime(e.eventAt) },
          { label: t('admin.storeEvent.receivedAt'), value: formatFullDateTime(e.receivedAt) },
          { label: t('admin.storeEvent.processedAt'), value: e.processedAt ? formatFullDateTime(e.processedAt) : '—' },
        ]}
      />
      {e.user ? (
        <View style={styles.pad}>
          <Button label={t('admin.auditEntry.openUser')} icon="account-outline" variant="secondary" size="M" onPress={() => navigation.navigate('AdminUser', { userId: e.user!.id })} />
        </View>
      ) : null}

      <View style={styles.payload}>
        <CodeBlock label={t('admin.storeEvent.payload')} text={JSON.stringify(data.payload, null, 2)} />
      </View>
    </AdminScreen>
  );
}

export const AdminStoreEventScreen = withAdmin(AdminStoreEvent);

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 16, paddingTop: 16, gap: 12 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  payload: { paddingTop: 24 },
});
