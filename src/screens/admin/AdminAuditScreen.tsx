import { useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { adminApi, useAdminPages } from '../../api/admin';
import type { AuditEntry } from '../../api/types';
import { useI18n } from '../../i18n';
import type { RootScreenProps } from '../../navigation/types';
import { AppText, Chip, ChipRow, EmptyState, useTheme } from '../../ui';
import { AdminScreen, useAdminContext, withAdmin } from './components/AdminFrame';
import { useNow } from './components/actions';
import { ErrorState, ListFooter, PromptDialog, SkeletonList } from './components/parts';
import { AuditRow } from './components/rows';
import { AUDIT_FILTER_LABEL, AUDIT_FILTERS, auditFilterFor, type AuditFilter } from './lib/audit';
import { rememberAudit } from './lib/auditMemory';
import { dayKey, formatDayHeader } from './lib/format';
import { isUuid, normalizePublicId } from './lib/users';

const PAGE = 50;

type Item = { kind: 'day'; key: string; label: string } | { kind: 'entry'; key: string; entry: AuditEntry; first: boolean; last: boolean };

/** Rows grouped by day, each group drawn as its own section. */
function groupByDay(entries: AuditEntry[], label: (iso: string) => string): Item[] {
  const out: Item[] = [];
  let current = '';
  entries.forEach((entry, i) => {
    const day = dayKey(entry.at);
    if (day !== current) {
      current = day;
      out.push({ kind: 'day', key: `day-${day}`, label: label(entry.at) });
    }
    const next = entries[i + 1];
    out.push({
      kind: 'entry',
      key: String(entry.id),
      entry,
      first: out[out.length - 1]?.kind === 'day',
      last: !next || dayKey(next.at) !== day,
    });
  });
  return out;
}

/** A person filter typed as an SW- ID, an internal ID, or (for admins) env, cli or system. */
function normalizeRef(input: string, labels: readonly string[] = []): string | null {
  const s = input.trim();
  if (!s) return null;
  if (labels.includes(s.toLowerCase())) return s.toLowerCase();
  if (isUuid(s)) return s.toLowerCase();
  return normalizePublicId(s);
}

/**
 * Route `AdminAudit` (backend-spec 2.10 GET /admin/audit, ui-critiques "Admin: audit log"): every
 * admin action, newest first and grouped by day, filtered by kind of action, by admin and by user,
 * loading older entries on scroll (`before`).
 */
function AdminAudit({ navigation, route }: RootScreenProps<'AdminAudit'>) {
  const { t } = useI18n();
  const theme = useTheme();
  const { me } = useAdminContext();
  const nowMs = useNow();
  const [filter, setFilter] = useState<AuditFilter>(auditFilterFor(route.params?.action));
  const [actor, setActor] = useState<string | null>(route.params?.adminId ?? null);
  const [user, setUser] = useState<string | null>(route.params?.userId ?? null);
  const [prompt, setPrompt] = useState<'actor' | 'user' | null>(null);
  const [params, setParams] = useState(route.params);

  // Opened again with other filters (History of another user) while this list is in the stack.
  if (route.params !== params) {
    setParams(route.params);
    setFilter(auditFilterFor(route.params?.action));
    setActor(route.params?.adminId ?? null);
    setUser(route.params?.userId ?? null);
  }

  const query = { action: filter === 'all' ? undefined : filter, actor: actor ?? undefined, user: user ?? undefined };
  const list = useAdminPages<AuditEntry, number>(`audit?${JSON.stringify(query)}`, async (before) => {
    const page = await adminApi.audit({ ...query, before: before ?? undefined, limit: PAGE });
    return { items: page.items, next: page.nextBefore };
  });
  useEffect(() => rememberAudit(list.data), [list.data]);

  const now = new Date(nowMs);
  const items = groupByDay(list.items, (iso) => formatDayHeader(iso, t, now));
  const filtered = filter !== 'all' || !!actor || !!user;
  const clear = () => {
    setFilter('all');
    setActor(null);
    setUser(null);
  };

  let empty = null;
  if (list.loading) empty = <SkeletonList rows={8} />;
  else if (list.error && !list.data) empty = <ErrorState error={list.error} title={t('admin.audit.loadFailed')} onRetry={list.reload} />;
  else if (list.data) {
    empty = filtered ? (
      <EmptyState icon="clipboard-search-outline" title={t('admin.audit.noMatch')} action={{ label: t('admin.users.clear'), onPress: clear }} />
    ) : (
      <EmptyState icon="clipboard-text-clock-outline" title={t('admin.audit.empty')} />
    );
  }

  const header = (
    <View style={styles.header}>
      <ChipRow radio accessibilityLabel={t('admin.audit.filters')}>
        {AUDIT_FILTERS.map((f) => (
          <Chip key={f} label={t(AUDIT_FILTER_LABEL[f])} selected={filter === f} onPress={() => setFilter(f)} testID={`admin-audit-filter-${f}`} />
        ))}
      </ChipRow>
      <ChipRow>
        <Chip
          variant="filter"
          selected={!!actor}
          icon={actor ? undefined : 'shield-account-outline'}
          label={actor ? t('admin.audit.adminIs', { who: actor === me?.publicId ? t('admin.common.you') : actor }) : t('admin.audit.adminAnyone')}
          onPress={() => (actor ? setActor(null) : setPrompt('actor'))}
        />
        {!actor && me ? <Chip variant="assist" icon="account-outline" label={t('admin.audit.mine')} onPress={() => setActor(me.publicId)} /> : null}
        <Chip
          variant="filter"
          selected={!!user}
          icon={user ? undefined : 'account-search-outline'}
          label={user ? t('admin.audit.userIs', { who: user }) : t('admin.audit.userAnyone')}
          onPress={() => (user ? setUser(null) : setPrompt('user'))}
        />
      </ChipRow>
    </View>
  );

  return (
    <AdminScreen title={t('admin.audit.title')} scroll={false} fetchedAt={list.fetchedAt} stale={list.stale} testID="screen-AdminAudit">
      <FlatList
        data={items}
        keyExtractor={(i) => i.key}
        renderItem={({ item }) =>
          item.kind === 'day' ? (
            <AppText variant="labelM" color="textSecondary" accessibilityRole="header" style={styles.day}>
              {item.label}
            </AppText>
          ) : (
            <AuditRow
              entry={item.entry}
              grouped
              isFirst={item.first}
              isLast={item.last}
              onPress={() => navigation.navigate('AdminAuditEntry', { entryId: String(item.entry.id) })}
            />
          )
        }
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={
          <ListFooter auto loadingMore={list.loadingMore} hasMore={list.hasMore} error={list.moreError} count={list.items.length} onMore={list.loadMore} />
        }
        onEndReached={() => {
          if (list.hasMore && !list.loadingMore && !list.moreError) list.loadMore();
        }}
        onEndReachedThreshold={0.5}
        refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={list.refresh} colors={[theme.color.primary]} tintColor={theme.color.primary} />}
        contentContainerStyle={styles.content}
      />
      <PromptDialog
        visible={prompt !== null}
        title={prompt === 'actor' ? t('admin.audit.adminTitle') : t('admin.audit.userTitle')}
        message={prompt === 'actor' ? t('admin.audit.adminBody') : t('admin.audit.userBody')}
        label={t('admin.audit.idLabel')}
        placeholder="SW-7K3P-92QX"
        initial=""
        confirmLabel={t('admin.common.apply')}
        validate={(value) => (normalizeRef(value, prompt === 'actor' ? ['env', 'cli', 'system'] : []) ? null : t('admin.audit.idInvalid'))}
        onCancel={() => setPrompt(null)}
        onSubmit={(value) => {
          const ref = normalizeRef(value, prompt === 'actor' ? ['env', 'cli', 'system'] : []);
          if (prompt === 'actor') setActor(ref);
          else setUser(ref);
          setPrompt(null);
        }}
      />
    </AdminScreen>
  );
}

export const AdminAuditScreen = withAdmin(AdminAudit);

const styles = StyleSheet.create({
  header: { gap: 12, paddingTop: 8 },
  day: { paddingTop: 24, paddingBottom: 8, paddingHorizontal: 32 },
  content: { paddingBottom: 32 },
});
