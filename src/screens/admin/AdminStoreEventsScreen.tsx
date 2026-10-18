import { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { adminApi, useAdminPages } from '../../api/admin';
import type { StoreEvent } from '../../api/types';
import { useI18n } from '../../i18n';
import type { RootScreenProps } from '../../navigation/types';
import { AppText, Chip, ChipRow, EmptyState, useTheme } from '../../ui';
import { AdminScreen, withAdmin } from './components/AdminFrame';
import { ErrorState, ListFooter, SkeletonList } from './components/parts';
import { STORE_STATUS_LABEL, StoreEventRow } from './components/rows';

const PAGE = 50;
type Filter = 'all' | StoreEvent['status'];
const FILTERS: Filter[] = ['all', 'error', 'unmatched', 'processed', 'stale', 'ignored'];

/**
 * Route `AdminStoreEvents` (backend-spec 2.10, ui-critiques "Admin: Store events screen"): the
 * RevenueCat webhook deliveries, newest first, by status, loading older ones on scroll. Errors and
 * unmatched events (a purchase that never unlocked Pro) can be retried from their detail.
 */
function AdminStoreEvents({ navigation, route }: RootScreenProps<'AdminStoreEvents'>) {
  const { t } = useI18n();
  const theme = useTheme();
  const initial = (FILTERS as string[]).includes(route.params?.status ?? '') ? (route.params!.status as Filter) : 'all';
  const [status, setStatus] = useState<Filter>(initial);
  const [params, setParams] = useState(route.params);
  if (route.params !== params) {
    setParams(route.params);
    setStatus((FILTERS as string[]).includes(route.params?.status ?? '') ? (route.params!.status as Filter) : 'all');
  }

  const list = useAdminPages<StoreEvent, string>(`store-events?${status}`, async (before) => {
    const page = await adminApi.storeEvents({ status: status === 'all' ? undefined : status, before: before ?? undefined, limit: PAGE });
    return { items: page.items, next: page.nextBefore };
  });
  const items = list.items;

  let empty = null;
  if (list.loading) empty = <SkeletonList rows={8} />;
  else if (list.error && !list.data) empty = <ErrorState error={list.error} title={t('admin.storeEvents.loadFailed')} onRetry={list.reload} />;
  else if (list.data) {
    empty =
      status === 'all' ? (
        <EmptyState icon="webhook" title={t('admin.storeEvents.empty')} body={t('admin.storeEvents.emptyBody')} />
      ) : (
        <EmptyState
          icon="check-circle-outline"
          title={t('admin.storeEvents.noneWith', { status: t(STORE_STATUS_LABEL[status]) })}
          action={{ label: t('admin.storeEvents.showAll'), onPress: () => setStatus('all') }}
        />
      );
  }

  return (
    <AdminScreen title={t('admin.storeEvents.title')} scroll={false} fetchedAt={list.fetchedAt} stale={list.stale} testID="screen-AdminStoreEvents">
      <FlatList
        data={items}
        keyExtractor={(e) => e.id}
        ListHeaderComponent={
          <View style={styles.header}>
            <ChipRow radio accessibilityLabel={t('admin.storeEvents.filters')}>
              {FILTERS.map((f) => (
                <Chip
                  key={f}
                  label={f === 'all' ? t('admin.users.filter.all') : t(f === 'error' ? 'admin.storeEvents.errors' : STORE_STATUS_LABEL[f])}
                  selected={status === f}
                  onPress={() => setStatus(f)}
                  testID={`admin-store-filter-${f}`}
                />
              ))}
            </ChipRow>
            <AppText variant="bodyS" color="textTertiary" style={styles.intro}>
              {t('admin.storeEvents.intro')}
            </AppText>
          </View>
        }
        renderItem={({ item, index }) => (
          <StoreEventRow
            event={item}
            grouped
            isFirst={index === 0}
            isLast={index === items.length - 1}
            onPress={() => navigation.navigate('AdminStoreEvent', { eventId: item.id })}
          />
        )}
        ListEmptyComponent={empty}
        ListFooterComponent={<ListFooter auto loadingMore={list.loadingMore} hasMore={list.hasMore} error={list.moreError} count={items.length} onMore={list.loadMore} />}
        onEndReached={() => {
          if (list.hasMore && !list.loadingMore && !list.moreError) list.loadMore();
        }}
        onEndReachedThreshold={0.5}
        refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={list.refresh} colors={[theme.color.primary]} tintColor={theme.color.primary} />}
        contentContainerStyle={styles.content}
      />
    </AdminScreen>
  );
}

export const AdminStoreEventsScreen = withAdmin(AdminStoreEvents);

const styles = StyleSheet.create({
  header: { gap: 12, paddingTop: 8, paddingBottom: 12 },
  intro: { paddingHorizontal: 32 },
  content: { paddingBottom: 32 },
});
