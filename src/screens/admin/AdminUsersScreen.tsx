import { useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { adminApi, peekAdmin, useAdminPages } from '../../api/admin';
import type { AdminUserListItem } from '../../api/types';
import { useI18n } from '../../i18n';
import { createRequest } from '../../navigation/results';
import { openSheet } from '../../navigation/sheet';
import type { RootScreenProps } from '../../navigation/types';
import { AppText, Chip, ChipRow, EmptyState, ProgressBar, SearchField, useTheme } from '../../ui';
import { AdminScreen, withAdmin } from './components/AdminFrame';
import { ErrorState, ListFooter, SkeletonList } from './components/parts';
import { UserRow } from './components/rows';
import { countryName, flagEmoji } from './lib/countries';
import { formatNumber } from './lib/format';
import {
  buildUserQuery,
  directUserRef,
  parseFilterParam,
  SOURCE_FILTERS,
  USER_FILTER_LABEL,
  USER_FILTERS,
  USER_SORT_LABEL,
  USER_SORTS,
  type SourceFilter,
  type UserSort,
} from './lib/users';

const PAGE = 50;

const SOURCE_LABEL = {
  any: 'admin.users.source.any',
  store: 'admin.sourceBadge.store',
  grant: 'admin.sourceBadge.grant',
  promo: 'admin.sourceBadge.promo',
} as const;

type Pages = { items: AdminUserListItem[] };

/**
 * Route `AdminUsers` (backend-spec 7.7, ui-critiques "user list and finding a user"): search with a
 * 300 ms debounce (email, name, SW-ID or Play order ID), one chip per query, source, country and
 * sort, 50 per page with "Load more".
 */
function AdminUsers({ navigation, route }: RootScreenProps<'AdminUsers'>) {
  const { t } = useI18n();
  const theme = useTheme();
  const initial = parseFilterParam(route.params?.filter);
  const [params, setParams] = useState(route.params);
  const [filter, setFilter] = useState(initial.filter);
  const [source, setSource] = useState<SourceFilter>(initial.source);
  const [country, setCountry] = useState<string | null>(initial.country);
  const [sort, setSort] = useState<UserSort>('newest');
  const [text, setText] = useState(route.params?.query ?? '');
  const [q, setQ] = useState(route.params?.query ?? '');

  // Opened again with other params (a dashboard tile while this list is in the stack).
  if (route.params !== params) {
    setParams(route.params);
    const next = parseFilterParam(route.params?.filter);
    setFilter(next.filter);
    setSource(next.source);
    setCountry(next.country);
    setText(route.params?.query ?? '');
    setQ(route.params?.query ?? '');
  }

  useEffect(() => {
    const timer = setTimeout(() => setQ(text), 300);
    return () => clearTimeout(timer);
  }, [text]);

  const query = buildUserQuery({ filter, source, country, sort, q });
  const key = `users?${JSON.stringify(query)}`;
  const list = useAdminPages<AdminUserListItem, number>(key, async (offset) => {
    const page = await adminApi.users({ ...query, limit: PAGE, offset: offset ?? 0 });
    const next = page.offset + page.items.length;
    return { items: page.items, next: next < page.total && page.items.length > 0 ? next : null, total: page.total };
  });

  // While a new search loads, the previous results stay (dimmed by the progress bar) instead of skeletons.
  const [shownKey, setShownKey] = useState(key);
  if (list.data && shownKey !== key) setShownKey(key);
  const previous = !list.data && shownKey !== key ? peekAdmin<Pages>(shownKey)?.items : undefined;
  const items = list.data ? list.items : (previous ?? []);
  const switching = !list.data && !!previous;

  const filtered = filter !== 'all' || source !== 'any' || !!country || !!q.trim();
  const clearFilters = () => {
    setFilter('all');
    setSource('any');
    setCountry(null);
    setText('');
    setQ('');
  };

  const pickSource = async () => {
    const id = await openSheet({
      title: t('admin.users.source.title'),
      options: SOURCE_FILTERS.map((s) => ({ id: s, label: t(SOURCE_LABEL[s]), selected: s === source })),
    });
    if (id) {
      setSource(id as SourceFilter);
      if (id !== 'any' && filter === 'free') setFilter('all');
    }
  };

  const pickSort = async () => {
    const id = await openSheet({
      title: t('admin.users.sort.title'),
      options: USER_SORTS.map((s) => ({ id: s, label: t(USER_SORT_LABEL[s]), selected: s === sort })),
    });
    if (id) setSort(id as UserSort);
  };

  const pickCountry = async () => {
    const { requestId, result } = createRequest<string[]>();
    navigation.navigate('CountryPicker', { requestId, selected: country ? [country] : [], title: t('admin.users.country.title') });
    const picked = await result;
    if (picked) setCountry(picked[0] ?? null);
  };

  const direct = directUserRef(text);
  const total = list.total;

  const header = (
    <View style={styles.header}>
      <ChipRow radio accessibilityLabel={t('admin.users.filters')}>
        {USER_FILTERS.map((f) => (
          <Chip
            key={f}
            label={t(USER_FILTER_LABEL[f])}
            selected={filter === f}
            onPress={() => {
              setFilter(f);
              if (f === 'free') setSource('any');
            }}
            testID={`admin-users-filter-${f}`}
          />
        ))}
      </ChipRow>
      <ChipRow>
        <Chip
          variant="filter"
          selected={source !== 'any'}
          icon={source === 'any' ? 'chevron-down' : undefined}
          label={source === 'any' ? t('admin.users.source.chip') : t(SOURCE_LABEL[source])}
          onPress={() => void pickSource()}
        />
        <Chip
          variant="filter"
          selected={!!country}
          icon={country ? undefined : 'chevron-down'}
          label={country ? `${flagEmoji(country)} ${countryName(country)}` : t('admin.users.country.chip')}
          onPress={() => void pickCountry()}
        />
        <Chip variant="filter" selected={sort !== 'newest'} icon="sort" label={t(USER_SORT_LABEL[sort])} onPress={() => void pickSort()} />
        {filtered ? <Chip variant="assist" icon="filter-remove-outline" label={t('admin.users.clear')} onPress={clearFilters} /> : null}
      </ChipRow>
      <View style={styles.countRow}>
        <AppText variant="bodyS" color="textTertiary" tabular style={styles.flex}>
          {total != null ? t('admin.users.count', { count: formatNumber(total) }) : ' '}
        </AppText>
      </View>
      {direct ? (
        <Chip
          variant="assist"
          icon="account-arrow-right-outline"
          label={t('admin.home.openUser', { id: direct })}
          onPress={() => navigation.navigate('AdminUser', { userId: direct })}
          style={styles.directChip}
        />
      ) : null}
    </View>
  );

  let empty = null;
  if (list.loading && !switching) empty = <SkeletonList rows={8} />;
  else if (list.error && !list.data) empty = <ErrorState error={list.error} title={t('admin.users.loadFailed')} onRetry={list.reload} />;
  else if (list.data && items.length === 0) {
    empty = (
      <EmptyState
        icon="account-search-outline"
        title={q.trim() ? t('admin.users.noMatchQuery', { query: q.trim() }) : t('admin.users.noMatch')}
        body={t('admin.users.noMatchBody')}
        action={filtered ? { label: t('admin.users.clear'), onPress: clearFilters } : undefined}
      />
    );
  }

  return (
    <AdminScreen title={t('admin.users.title')} scroll={false} fetchedAt={list.fetchedAt} stale={list.stale} testID="screen-AdminUsers">
      <View style={styles.search}>
        <SearchField variant="inline" value={text} onChangeText={setText} placeholder={t('admin.home.searchPlaceholder')} testID="admin-users-search" />
      </View>
      <View style={styles.progress}>{switching || (list.loading && items.length > 0) ? <ProgressBar /> : null}</View>
      <FlatList
        data={items}
        keyExtractor={(u) => u.id}
        renderItem={({ item, index }) => (
          <UserRow
            user={item}
            grouped
            isFirst={index === 0}
            isLast={index === items.length - 1}
            meta={sort === 'lastSeen' ? 'seen' : 'joined'}
            onPress={() => navigation.navigate('AdminUser', { userId: item.id })}
          />
        )}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={
          <ListFooter
            loadingMore={list.loadingMore}
            hasMore={list.hasMore}
            error={list.moreError}
            count={items.length}
            total={total}
            onMore={list.loadMore}
          />
        }
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={list.refresh} colors={[theme.color.primary]} tintColor={theme.color.primary} />}
        contentContainerStyle={styles.content}
        style={switching ? styles.dim : undefined}
      />
    </AdminScreen>
  );
}

export const AdminUsersScreen = withAdmin(AdminUsers);

const styles = StyleSheet.create({
  flex: { flex: 1 },
  search: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },
  progress: { height: 4 },
  header: { gap: 12, paddingTop: 8, paddingBottom: 8 },
  countRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 32 },
  directChip: { marginHorizontal: 16, alignSelf: 'flex-start' },
  content: { paddingBottom: 32 },
  dim: { opacity: 0.6 },
});
