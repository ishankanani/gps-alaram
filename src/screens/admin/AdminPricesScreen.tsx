import { useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { adminApi, invalidateAdmin, refreshConfigAfterAdminSave, useAdminQuery } from '../../api/admin';
import { useI18n } from '../../i18n';
import type { RootScreenProps } from '../../navigation/types';
import { AppText, Badge, Banner, EmptyState, IconButton, ListItem, SearchField, Section, useTheme } from '../../ui';
import { AdminScreen, useAdminContext, withAdmin } from './components/AdminFrame';
import { useAdminAction } from './components/actions';
import { ErrorState, FlagBox, SkeletonList } from './components/parts';
import { filterPriceRows, priceKeyName, rowSummary, sortPriceRows } from './lib/prices';

/**
 * Route `AdminPrices` (backend-spec 5.4, ui-critiques "Admin: pricing by country"): one row per
 * price key, formatted with formatPrice and marked "Edited" when overridden; Add country and
 * Reset all. Google Play stays authoritative where the store is connected.
 */
function AdminPrices({ navigation }: RootScreenProps<'AdminPrices'>) {
  const { t } = useI18n();
  const theme = useTheme();
  const act = useAdminAction();
  const { offline } = useAdminContext();
  const query = useAdminQuery('prices', () => adminApi.prices());
  const [search, setSearch] = useState('');
  const data = query.data;
  const rows = data ? filterPriceRows(sortPriceRows(data.items, t), search, t) : [];
  const overrides = data ? data.items.filter((r) => r.overridden).length : 0;

  const resetAll = () =>
    void act({
      title: t('admin.prices.resetTitle'),
      message: t('admin.prices.resetBody', { count: overrides }),
      confirmLabel: t('admin.prices.reset'),
      tone: 'danger',
      icon: 'restore',
      requireText: 'RESET',
      run: () => adminApi.resetPrices(),
      success: (r) => t('admin.prices.resetDone', { count: r.removed }),
      after: () => {
        invalidateAdmin('prices', 'audit', 'dashboard');
        refreshConfigAfterAdminSave();
      },
    });

  return (
    <AdminScreen
      title={t('admin.prices.title')}
      fetchedAt={query.fetchedAt}
      stale={query.stale}
      actions={<IconButton icon="plus" accessibilityLabel={t('admin.prices.add')} onPress={() => navigation.navigate('AdminPrice')} disabled={offline} testID="admin-prices-add" />}
      refreshControl={<RefreshControl refreshing={query.refreshing} onRefresh={query.refresh} colors={[theme.color.primary]} tintColor={theme.color.primary} />}
      testID="screen-AdminPrices">
      <View style={styles.top}>
        <AppText variant="bodyS" color="textSecondary">
          {t('admin.prices.intro')}
        </AppText>
        <Banner tone="info" icon="google-play" body={t('admin.prices.playNote')} />
        <SearchField variant="inline" value={search} onChangeText={setSearch} placeholder={t('admin.prices.search')} />
      </View>

      {!data ? (
        query.error ? (
          <ErrorState error={query.error} title={t('admin.prices.loadFailed')} onRetry={query.reload} />
        ) : (
          <SkeletonList rows={8} />
        )
      ) : rows.length === 0 ? (
        <EmptyState icon="cash-remove" title={t('admin.prices.noMatch', { query: search.trim() })} />
      ) : (
        <Section
          title={t('admin.prices.rows', { count: data.items.length })}
          footer={t('admin.prices.trialDefault', { days: data.defaultTrialDays })}>
          {rows.map((row) => {
            const trial = row.trialDays ?? data.defaultTrialDays;
            const extra = [
              trial > 0 ? t('admin.prices.trial', { days: trial }) : t('admin.prices.noTrial'),
              row.country === 'EU' ? t('admin.prices.euCount', { count: data.euAlias.length }) : null,
            ]
              .filter(Boolean)
              .join(' · ');
            return (
              <ListItem
                key={row.country}
                leading={<FlagBox country={row.country} />}
                title={`${priceKeyName(row.country, t)} · ${row.currency}`}
                subtitle={rowSummary(row, 'en', t)}
                subtitleLines={2}
                meta={
                  <>
                    <AppText variant="bodyS" color="textTertiary">
                      {extra}
                    </AppText>
                    {row.overridden ? <Badge label={row.builtin ? t('admin.common.edited') : t('admin.prices.added')} tone="primary" size="sm" icon="pencil" /> : null}
                  </>
                }
                chevron
                onPress={() => navigation.navigate('AdminPrice', { country: row.country })}
                testID={`admin-price-${row.country}`}
              />
            );
          })}
        </Section>
      )}

      {data ? (
        <Section title={t('admin.user.danger')} footer={overrides ? t('admin.prices.resetFoot', { count: overrides }) : t('admin.prices.noOverrides')}>
          <ListItem icon="restore" title={t('admin.prices.reset')} destructive disabled={offline || overrides === 0} onPress={resetAll} testID="admin-prices-reset" />
        </Section>
      ) : null}
    </AdminScreen>
  );
}

export const AdminPricesScreen = withAdmin(AdminPrices);

const styles = StyleSheet.create({
  top: { paddingHorizontal: 16, paddingTop: 8, gap: 12 },
});
