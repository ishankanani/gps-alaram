import { useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { adminApi, useAdminPages } from '../../api/admin';
import type { PromoCode } from '../../api/types';
import { useI18n } from '../../i18n';
import type { RootScreenProps } from '../../navigation/types';
import { AppText, Badge, Chip, ChipRow, EmptyState, IconButton, ListItem, SearchField, useTheme } from '../../ui';
import { AdminScreen, useAdminContext, withAdmin } from './components/AdminFrame';
import { useNow } from './components/actions';
import { ErrorState, ListFooter, SkeletonList, ToneCircle } from './components/parts';
import { formatNumber } from './lib/format';
import { PROMO_FILTERS, PROMO_STATUS_LABEL, PROMO_STATUS_TONE, promoSummary, type PromoFilter } from './lib/promo';

const PAGE = 50;

/**
 * Route `AdminPromoCodes` (backend-spec 7.7): codes by status (Active, Scheduled, Used up, Expired,
 * Off, All) with search, 50 per page, and "+" for a new code.
 */
function AdminPromoCodes({ navigation, route }: RootScreenProps<'AdminPromoCodes'>) {
  const { t } = useI18n();
  const theme = useTheme();
  const { offline } = useAdminContext();
  const nowMs = useNow();
  const initial = (PROMO_FILTERS as readonly string[]).includes(route.params?.status ?? '') ? (route.params!.status as PromoFilter) : 'active';
  const [status, setStatus] = useState<PromoFilter>(initial);
  const [text, setText] = useState('');
  const [q, setQ] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setQ(text.trim()), 300);
    return () => clearTimeout(timer);
  }, [text]);

  const key = `promo-codes?${JSON.stringify({ status, q })}`;
  const list = useAdminPages<PromoCode, number>(key, async (offset) => {
    const page = await adminApi.promoCodes({ status, q: q || undefined, limit: PAGE, offset: offset ?? 0 });
    const next = page.offset + page.items.length;
    return { items: page.items, next: next < page.total && page.items.length > 0 ? next : null, total: page.total };
  });
  const items = list.items;
  const now = new Date(nowMs);

  let empty = null;
  if (list.loading) empty = <SkeletonList rows={5} />;
  else if (list.error && !list.data) empty = <ErrorState error={list.error} title={t('admin.promos.loadFailed')} onRetry={list.reload} />;
  else if (list.data) {
    empty =
      status === 'all' && !q ? (
        <EmptyState
          icon="ticket-percent-outline"
          title={t('admin.promos.empty')}
          body={t('admin.promos.emptyBody')}
          action={offline ? undefined : { label: t('admin.promos.create'), onPress: () => navigation.navigate('AdminPromoNew'), icon: 'plus' }}
        />
      ) : (
        <EmptyState
          icon="ticket-outline"
          title={q ? t('admin.promos.noMatchQuery', { query: q }) : t('admin.promos.noMatch', { status: t(PROMO_STATUS_LABEL[status]) })}
          action={{ label: t('admin.promos.showAll'), onPress: () => {
            setStatus('all');
            setText('');
          } }}
        />
      );
  }

  return (
    <AdminScreen
      title={t('admin.promos.title')}
      scroll={false}
      fetchedAt={list.fetchedAt}
      stale={list.stale}
      actions={
        <IconButton icon="plus" accessibilityLabel={t('admin.promos.create')} onPress={() => navigation.navigate('AdminPromoNew')} disabled={offline} testID="admin-promos-new" />
      }
      testID="screen-AdminPromoCodes">
      <View style={styles.search}>
        <SearchField variant="inline" value={text} onChangeText={setText} placeholder={t('admin.promos.search')} />
      </View>
      <FlatList
        data={items}
        keyExtractor={(p) => String(p.id)}
        ListHeaderComponent={
          <View style={styles.header}>
            <ChipRow radio accessibilityLabel={t('admin.promos.filters')}>
              {PROMO_FILTERS.map((s) => (
                <Chip key={s} label={t(PROMO_STATUS_LABEL[s])} selected={status === s} onPress={() => setStatus(s)} testID={`admin-promos-${s}`} />
              ))}
            </ChipRow>
            <AppText variant="bodyS" color="textTertiary" tabular style={styles.count}>
              {list.total != null ? t('admin.promos.count', { count: formatNumber(list.total) }) : ' '}
            </AppText>
          </View>
        }
        renderItem={({ item, index }) => (
          <ListItem
            grouped
            isFirst={index === 0}
            isLast={index === items.length - 1}
            leading={<ToneCircle icon={item.plan === 'lifetime' ? 'infinity' : 'ticket-percent-outline'} tone={item.status === 'active' ? 'primary' : 'neutral'} size={40} />}
            title={item.code}
            subtitle={promoSummary(item, t, now)}
            subtitleLines={2}
            meta={
              item.description ? (
                <AppText variant="bodyS" color="textTertiary" numberOfLines={1}>
                  {item.description}
                </AppText>
              ) : undefined
            }
            trailing={<Badge label={t(PROMO_STATUS_LABEL[item.status])} tone={PROMO_STATUS_TONE[item.status]} size="sm" />}
            chevron
            onPress={() => navigation.navigate('AdminPromoCode', { codeId: String(item.id) })}
            testID={`admin-promo-${item.code}`}
          />
        )}
        ListEmptyComponent={empty}
        ListFooterComponent={
          <ListFooter loadingMore={list.loadingMore} hasMore={list.hasMore} error={list.moreError} count={items.length} total={list.total} onMore={list.loadMore} />
        }
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={list.refresh} colors={[theme.color.primary]} tintColor={theme.color.primary} />}
        contentContainerStyle={styles.content}
      />
    </AdminScreen>
  );
}

export const AdminPromoCodesScreen = withAdmin(AdminPromoCodes);

const styles = StyleSheet.create({
  search: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },
  header: { gap: 12, paddingTop: 4, paddingBottom: 8 },
  count: { paddingHorizontal: 32 },
  content: { paddingBottom: 32 },
});
