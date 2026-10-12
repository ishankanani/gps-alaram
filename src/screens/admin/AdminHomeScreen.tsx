import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { ADMIN_SERVER_URL, adminApi, peekAdmin, useAdminQuery, type DashboardDays } from '../../api/admin';
import type { AdminDashboard } from '../../api/types';
import { useI18n } from '../../i18n';
import type { RootScreenProps } from '../../navigation/types';
import {
  AppText,
  Badge,
  Card,
  Chip,
  ChipRow,
  ListItem,
  Section,
  SegmentedControl,
  SkeletonCard,
  SkeletonTile,
  StatTile,
  TextField,
  useTheme,
  useToast,
} from '../../ui';
import { AdminScreen, withAdmin } from './components/AdminFrame';
import { SignupChart, ShareBar, StackedBar } from './components/charts';
import { ErrorState, FlagBox } from './components/parts';
import { AuditRow, UserRow } from './components/rows';
import { rememberAudit } from './lib/auditMemory';
import { countryName } from './lib/countries';
import { formatNumber, formatPercent, formatRelative, formatTime, formatUsd } from './lib/format';
import { compareVersions, valuesFrom } from './lib/settings';
import { directUserRef } from './lib/users';

const DAY_OPTIONS: DashboardDays[] = [7, 30, 90];

/**
 * Route `AdminHome` (backend-spec 7.7, ui-critiques "Admin dashboard"): find a user, the KPI tiles,
 * sign-ups by day, Pro by source and by plan, top countries, app versions, the store connection,
 * recent sign-ups and admin actions, and the way into every other admin screen.
 */
function AdminHome({ navigation }: RootScreenProps<'AdminHome'>) {
  const { t } = useI18n();
  const theme = useTheme();
  const toast = useToast();
  const [days, setDays] = useState<DashboardDays>(30);
  const [prevDays, setPrevDays] = useState<DashboardDays>(30);
  const [search, setSearch] = useState('');

  const dash = useAdminQuery(`dashboard:${days}`, () => adminApi.dashboard(days));
  const recent = useAdminQuery('users:recent', () => adminApi.users({ kind: 'account', sort: 'created', order: 'desc', limit: 5 }));
  const settings = useAdminQuery('settings', () => adminApi.settings());
  const health = useAdminQuery('health', () => adminApi.health());

  // Switching 7/30/90 only changes the chart: keep showing the rest meanwhile.
  const data = dash.data ?? peekAdmin<AdminDashboard>(`dashboard:${prevDays}`);
  useEffect(() => rememberAudit(data?.recentAudit), [data]);

  const values = settings.data ? valuesFrom(settings.data.items).values : null;
  const minVersion = values?.['app.minVersion'] ?? null;
  const latestVersion = values?.['app.latestVersion'] ?? null;

  const refresh = () => {
    dash.refresh();
    recent.reload();
    settings.reload();
    health.reload();
  };

  const directRef = directUserRef(search);
  const find = () => {
    const q = search.trim();
    if (!q) return;
    if (directRef) navigation.navigate('AdminUser', { userId: directRef });
    else navigation.navigate('AdminUsers', { query: q });
  };

  const pasteId = async () => {
    const text = (await Clipboard.getStringAsync().catch(() => '')).trim();
    const ref = text ? directUserRef(text) : null;
    if (ref) navigation.navigate('AdminUser', { userId: ref });
    else toast.show({ id: 'admin-paste', message: t('admin.home.pasteNone'), icon: 'clipboard-alert-outline' });
  };

  const header = (
    <View style={styles.search}>
      <TextField
        value={search}
        onChangeText={setSearch}
        icon="magnify"
        placeholder={t('admin.home.searchPlaceholder')}
        clearable
        autoCapitalize="none"
        returnKeyType="search"
        onSubmitEditing={find}
        testID="admin-home-search"
      />
      {search.trim() ? (
        <Section>
          <ListItem
            dense
            icon={directRef ? 'account-arrow-right-outline' : 'magnify'}
            title={directRef ? t('admin.home.openUser', { id: directRef }) : t('admin.home.searchFor', { query: search.trim() })}
            chevron
            onPress={find}
          />
        </Section>
      ) : (
        <ChipRow style={styles.chipsFlush}>
          <Chip variant="assist" icon="clipboard-text-outline" label={t('admin.home.pasteId')} onPress={() => void pasteId()} />
          <Chip variant="assist" icon="account-multiple-outline" label={t('admin.home.allUsers')} onPress={() => navigation.navigate('AdminUsers')} />
        </ChipRow>
      )}
    </View>
  );

  if (!data) {
    return (
      <AdminScreen title={t('admin.home.title')} testID="screen-AdminHome">
        {header}
        {dash.error && !dash.loading ? (
          <ErrorState error={dash.error} title={t('admin.home.loadFailed')} onRetry={dash.reload} />
        ) : (
          <View style={styles.pad}>
            <View style={styles.grid}>
              <SkeletonTile style={styles.tile} />
              <SkeletonTile style={styles.tile} />
            </View>
            <View style={styles.grid}>
              <SkeletonTile style={styles.tile} />
              <SkeletonTile style={styles.tile} />
            </View>
            <SkeletonCard style={styles.skeletonChart} />
            <SkeletonCard />
          </View>
        )}
      </AdminScreen>
    );
  }

  const d = data;
  const proOfUsers = d.users.total ? d.pro.total / d.users.total : 0;
  const issues = d.store.billingIssues;
  const webhookProblems = d.webhooks.errors24h + d.webhooks.unmatched7d;
  const versionDevices = d.appVersions.reduce((n, v) => n + v.devices, 0);
  const topUsers = d.countries[0]?.users ?? 1;

  return (
    <AdminScreen
      title={t('admin.home.title')}
      fetchedAt={dash.fetchedAt}
      stale={dash.stale}
      refreshControl={<RefreshControl refreshing={dash.refreshing} onRefresh={refresh} colors={[theme.color.primary]} tintColor={theme.color.primary} />}
      testID="screen-AdminHome">
      {header}

      <View style={styles.pad}>
        <View style={styles.grid}>
          <StatTile
            compact
            style={styles.tile}
            icon="account-multiple-outline"
            label={t('admin.home.kpi.users')}
            value={formatNumber(d.users.total)}
            caption={t('admin.home.kpi.usersNew', { count: formatNumber(d.users.new.last7d) })}
            captionTone={d.users.new.last7d > 0 ? 'success' : 'neutral'}
            onPress={() => navigation.navigate('AdminUsers')}
          />
          <StatTile
            compact
            style={styles.tile}
            icon="pulse"
            label={t('admin.home.kpi.active')}
            value={formatNumber(d.users.active.last7d)}
            caption={t('admin.home.kpi.activeToday', { count: formatNumber(d.users.active.last1d) })}
          />
        </View>
        <View style={styles.grid}>
          <StatTile
            compact
            style={styles.tile}
            icon="crown-outline"
            label={t('admin.home.kpi.pro')}
            value={formatNumber(d.pro.total)}
            caption={t('admin.home.kpi.proShare', { share: formatPercent(d.pro.share || proOfUsers) })}
            onPress={() => navigation.navigate('AdminUsers', { filter: 'pro' })}
          />
          <StatTile
            compact
            style={styles.tile}
            icon="timer-sand"
            label={t('admin.home.kpi.trials')}
            value={formatNumber(d.pro.trials)}
            caption={t('admin.home.kpi.trialsOf', { count: formatNumber(d.pro.total) })}
            onPress={() => navigation.navigate('AdminUsers', { filter: 'trial' })}
          />
        </View>
        <View style={styles.grid}>
          <StatTile
            compact
            style={styles.tile}
            icon="cash-multiple"
            label={t('admin.home.kpi.mrr')}
            value={formatUsd(d.store.mrrUsd)}
            caption={t('admin.home.kpi.mrrCaption', { count: formatNumber(d.store.active) })}
          />
          <StatTile
            compact
            style={styles.tile}
            icon="credit-card-clock-outline"
            label={t('admin.home.kpi.billing')}
            value={formatNumber(issues)}
            caption={issues > 0 ? t('admin.home.kpi.billingSome') : t('admin.home.kpi.billingNone')}
            captionTone={issues > 0 ? 'danger' : 'neutral'}
            onPress={() => navigation.navigate('AdminStoreEvents')}
          />
        </View>

        <Card title={t('admin.home.signups.title')} headerTrailing={<AppText variant="bodyS" color="textTertiary">{t('admin.home.signups.utc')}</AppText>}>
          <SegmentedControl
            options={DAY_OPTIONS.map((n) => ({ value: n, label: t('admin.home.days', { count: n }) }))}
            value={days}
            onChange={(next) => {
              setPrevDays(days);
              setDays(next);
            }}
            accessibilityLabel={t('admin.home.signups.range')}
          />
          {dash.data ? (
            <SignupChart days={d.signupsByDay} />
          ) : (
            <SkeletonCard style={styles.skeletonChart} />
          )}
          <AppText variant="bodyS" color="textSecondary">
            {t('admin.home.signups.new', {
              today: formatNumber(d.users.new.today),
              week: formatNumber(d.users.new.last7d),
              month: formatNumber(d.users.new.last30d),
            })}
          </AppText>
        </Card>

        <Card title={t('admin.home.bySource.title')} headerTrailing={<Badge label={formatNumber(d.pro.total)} tone="accent" count />}>
          <StackedBar
            total={d.pro.total}
            emptyLabel={t('admin.home.noPro')}
            segments={[
              { key: 'store', label: t('admin.sourceBadge.store'), value: d.pro.bySource.store, color: theme.chart.store },
              { key: 'grant', label: t('admin.sourceBadge.grant'), value: d.pro.bySource.grant, color: theme.chart.gift },
              { key: 'promo', label: t('admin.sourceBadge.promo'), value: d.pro.bySource.promo, color: theme.chart.code },
            ]}
          />
        </Card>

        <Card title={t('admin.home.byPlan.title')}>
          <StackedBar
            total={d.pro.total}
            emptyLabel={t('admin.home.noPro')}
            segments={[
              { key: 'monthly', label: t('admin.plan.monthly'), value: d.pro.byPlan.monthly, color: theme.chart.monthly },
              { key: 'yearly', label: t('admin.plan.yearly'), value: d.pro.byPlan.yearly, color: theme.chart.yearly },
              { key: 'lifetime', label: t('admin.plan.lifetime'), value: d.pro.byPlan.lifetime, color: theme.chart.lifetime },
            ]}
          />
          <AppText variant="bodyS" color="textSecondary">
            {t('admin.home.byPlan.foot', {
              lifetime: formatNumber(d.store.lifetime30d),
              codes: formatNumber(d.promo.redemptions30d),
            })}
          </AppText>
        </Card>

        <Card
          title={t('admin.home.store.title')}
          headerTrailing={
            <Badge
              label={d.webhooks.configured ? t('admin.home.store.connected') : t('admin.home.store.notConfigured')}
              tone={d.webhooks.configured ? (webhookProblems > 0 ? 'warning' : 'success') : 'warning'}
              dot
            />
          }
          actions={
            <ListItem
              title={t('admin.home.store.events')}
              icon="webhook"
              chevron
              trailing={webhookProblems > 0 ? <Badge label={String(webhookProblems)} tone="danger" count /> : undefined}
              onPress={() => navigation.navigate('AdminStoreEvents', webhookProblems > 0 ? { status: d.webhooks.errors24h > 0 ? 'error' : 'unmatched' } : undefined)}
              style={styles.cardRow}
            />
          }>
          <View style={styles.kvList}>
            <Stat label={t('admin.home.store.lastEvent')} value={d.webhooks.lastEventAt ? formatRelative(d.webhooks.lastEventAt, t) : t('admin.time.never')} />
            <Stat label={t('admin.home.store.errors')} value={formatNumber(d.webhooks.errors24h)} warn={d.webhooks.errors24h > 0} />
            <Stat label={t('admin.home.store.unmatched')} value={formatNumber(d.webhooks.unmatched7d)} warn={d.webhooks.unmatched7d > 0} />
            <Stat label={t('admin.home.store.active')} value={t('admin.home.store.activeValue', { active: formatNumber(d.store.active), renewing: formatNumber(d.store.renewing) })} />
            <Stat label={t('admin.home.store.sandbox')} value={formatNumber(d.store.sandboxActive)} />
            <Stat label={t('admin.home.store.codes')} value={formatNumber(d.promo.activeCodes)} />
          </View>
        </Card>

        <Card title={t('admin.home.countries.title')}>
          {d.countries.length === 0 ? (
            <AppText variant="bodyS" color="textTertiary">
              {t('admin.home.countries.none')}
            </AppText>
          ) : (
            d.countries.map((c) => (
              <ListItem
                key={c.country}
                dense
                leading={<FlagBox country={c.country} size={32} />}
                leadingWidth={32}
                title={countryName(c.country)}
                meta={
                  <View style={styles.flex}>
                    <AppText variant="bodyS" color="textTertiary" tabular>
                      {t('admin.home.countries.row', {
                        users: formatNumber(c.users),
                        pro: formatNumber(c.pro),
                        rate: formatPercent(c.users ? c.pro / c.users : 0),
                      })}
                    </AppText>
                    <ShareBar share={c.users / topUsers} />
                  </View>
                }
                chevron
                onPress={() => navigation.navigate('AdminUsers', { filter: `country:${c.country}` })}
                style={styles.cardRow}
              />
            ))
          )}
        </Card>

        <Card title={t('admin.home.versions.title')}>
          {d.appVersions.length === 0 ? (
            <AppText variant="bodyS" color="textTertiary">
              {t('admin.home.versions.none')}
            </AppText>
          ) : (
            d.appVersions.map((v) => {
              const below = minVersion && minVersion !== '0.0.0' && compareVersions(v.version, minVersion) < 0;
              const latest = latestVersion && latestVersion !== '0.0.0' && compareVersions(v.version, latestVersion) === 0;
              return (
                <View key={v.version} style={styles.versionRow} accessible accessibilityLabel={`${v.version}: ${v.devices}`}>
                  <View style={styles.versionHead}>
                    <AppText variant="labelM" tabular style={styles.flex}>
                      {v.version}
                    </AppText>
                    {below ? <Badge label={t('admin.home.versions.belowMin')} tone="warning" size="sm" /> : null}
                    {latest ? <Badge label={t('admin.home.versions.latest')} tone="success" size="sm" /> : null}
                    <AppText variant="bodyS" color="textSecondary" tabular>
                      {t('admin.home.versions.devices', {
                        count: formatNumber(v.devices),
                        share: formatPercent(versionDevices ? v.devices / versionDevices : 0),
                      })}
                    </AppText>
                  </View>
                  <ShareBar share={versionDevices ? v.devices / versionDevices : 0} />
                </View>
              );
            })
          )}
          {minVersion && minVersion !== '0.0.0' ? (
            <AppText variant="bodyS" color="textTertiary">
              {t('admin.home.versions.min', { version: minVersion })}
            </AppText>
          ) : null}
        </Card>
      </View>

      <Section
        title={t('admin.home.recentSignups')}
        action={{ label: t('admin.common.seeAll'), onPress: () => navigation.navigate('AdminUsers', { filter: 'accounts' }) }}
        loading={recent.loading}
        empty={<AppText variant="bodyS" color="textTertiary" style={styles.emptyRow}>{t('admin.home.noSignups')}</AppText>}>
        {(recent.data?.items ?? []).map((u) => (
          <UserRow key={u.id} user={u} onPress={() => navigation.navigate('AdminUser', { userId: u.id })} />
        ))}
      </Section>

      <Section
        title={t('admin.home.recentActions')}
        action={{ label: t('admin.common.seeAll'), onPress: () => navigation.navigate('AdminAudit') }}
        empty={<AppText variant="bodyS" color="textTertiary" style={styles.emptyRow}>{t('admin.audit.empty')}</AppText>}>
        {d.recentAudit.slice(0, 5).map((e) => (
          <AuditRow key={e.id} entry={e} showDate onPress={() => navigation.navigate('AdminAuditEntry', { entryId: String(e.id) })} />
        ))}
      </Section>

      <Section title={t('admin.home.manage')}>
        <ListItem icon="account-multiple-outline" title={t('admin.home.manage.users')} numeric={formatNumber(d.users.total)} chevron onPress={() => navigation.navigate('AdminUsers')} />
        <ListItem
          icon="ticket-percent-outline"
          title={t('admin.home.manage.codes')}
          value={t('admin.home.manage.codesValue', { count: formatNumber(d.promo.activeCodes) })}
          chevron
          onPress={() => navigation.navigate('AdminPromoCodes')}
        />
        <ListItem icon="cash-multiple" title={t('admin.home.manage.prices')} chevron onPress={() => navigation.navigate('AdminPrices')} />
        <ListItem icon="application-cog-outline" title={t('admin.home.manage.settings')} chevron onPress={() => navigation.navigate('AdminSettings')} />
        <ListItem icon="clipboard-text-clock-outline" title={t('admin.home.manage.audit')} chevron onPress={() => navigation.navigate('AdminAudit')} />
        <ListItem
          icon="webhook"
          title={t('admin.home.manage.store')}
          trailing={webhookProblems > 0 ? <Badge label={String(webhookProblems)} tone="danger" count /> : undefined}
          chevron
          onPress={() => navigation.navigate('AdminStoreEvents')}
        />
      </Section>

      <AppText variant="bodyS" color="textTertiary" align="center" style={styles.footer}>
        {[
          t('admin.common.updated', { time: formatTime(d.generatedAt) }),
          ADMIN_SERVER_URL ? t('admin.home.server', { host: ADMIN_SERVER_URL.replace(/^https?:\/\//, '') }) : null,
          health.data ? t('admin.home.version', { version: health.data.version, commit: health.data.commit ? ` (${health.data.commit.slice(0, 7)})` : '' }) : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </AppText>
    </AdminScreen>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${label}: ${value}`}>
      <AppText variant="bodyM" color="textSecondary" style={styles.flex}>
        {label}
      </AppText>
      <AppText variant="labelM" tabular color={warn ? 'danger' : 'text'}>
        {value}
      </AppText>
    </View>
  );
}

export const AdminHomeScreen = withAdmin(AdminHome);

const styles = StyleSheet.create({
  flex: { flex: 1 },
  search: { paddingHorizontal: 16, paddingTop: 8, gap: 12 },
  chipsFlush: { marginHorizontal: -16 },
  pad: { paddingHorizontal: 16, paddingTop: 16, gap: 12 },
  grid: { flexDirection: 'row', gap: 12 },
  tile: { flex: 1 },
  skeletonChart: { height: 200 },
  kvList: { gap: 4 },
  stat: { flexDirection: 'row', alignItems: 'center', minHeight: 32, gap: 12 },
  cardRow: { marginHorizontal: -16 },
  versionRow: { paddingVertical: 6 },
  versionHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  emptyRow: { padding: 16 },
  footer: { paddingHorizontal: 32, paddingTop: 24 },
});
