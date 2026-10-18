import { StyleSheet, View } from 'react-native';

import { adminApi, useAdminQuery } from '../../api/admin';
import type { AuditEntry } from '../../api/types';
import { useI18n } from '../../i18n';
import type { RootScreenProps } from '../../navigation/types';
import { AppText, Button, Card, SkeletonCard, type IconName } from '../../ui';
import { AdminScreen, withAdmin } from './components/AdminFrame';
import { CodeBlock, ErrorState, KeyValueCard, ToneCircle } from './components/parts';
import { actorName, auditDiff, auditSubtitle, auditTitle, auditVisual } from './lib/audit';
import { recallAudit } from './lib/auditMemory';
import { formatFullDateTime } from './lib/format';

/**
 * Route `AdminAuditEntry` (ui-direction-a 4.3 "AdminAudit" step 5): one entry with who, what, when
 * and from where, the before → after rows of its details, the raw details, and links to the user,
 * the admin and the thing it changed. The API has no single-entry read, so the entry comes from
 * the lists seen in this session, else from the audit log itself.
 */
function AdminAuditEntry({ navigation, route }: RootScreenProps<'AdminAuditEntry'>) {
  const { t } = useI18n();
  const id = Number(route.params.entryId);
  const remembered = recallAudit(id);
  const query = useAdminQuery<AuditEntry | null>(remembered ? null : `audit-entry:${id}`, async () => {
    const page = await adminApi.audit({ before: id + 1, limit: 1 });
    return page.items.find((e) => e.id === id) ?? null;
  });
  const entry = remembered ?? query.data ?? null;

  if (!entry) {
    return (
      <AdminScreen title={t('admin.auditEntry.title')} presentation="modal" testID="screen-AdminAuditEntry">
        {query.error ? (
          <ErrorState error={query.error} title={t('admin.auditEntry.loadFailed')} onRetry={query.reload} onBack={() => navigation.goBack()} />
        ) : query.data === null ? (
          <ErrorState error={{ code: 'not_found', message: '' }} title={t('admin.auditEntry.loadFailed')} onRetry={query.reload} onBack={() => navigation.goBack()} />
        ) : (
          <View style={styles.pad}>
            <SkeletonCard />
            <SkeletonCard />
          </View>
        )}
      </AdminScreen>
    );
  }

  const visual = auditVisual(entry);
  const diff = auditDiff(entry, t);
  const changes = diff.filter((r) => r.before !== undefined);
  const facts = diff.filter((r) => r.before === undefined);
  const subtitle = auditSubtitle(entry, t);
  const signIn = entry.action === 'admin.sign_in' || entry.action === 'admin.sign_in_failed';
  const target = entry.target;

  const links: { label: string; icon: IconName; onPress: () => void }[] = [];
  if (entry.userId) links.push({ label: t('admin.auditEntry.openUser'), icon: 'account-outline', onPress: () => navigation.navigate('AdminUser', { userId: entry.userId! }) });
  if (entry.actor.id && entry.actor.id !== entry.userId) {
    links.push({ label: t('admin.auditEntry.openAdmin'), icon: 'shield-account-outline', onPress: () => navigation.navigate('AdminUser', { userId: entry.actor.id! }) });
  }
  if (target.type === 'promo_code' && target.id && entry.action !== 'promo.delete') {
    links.push({ label: t('admin.auditEntry.openCode'), icon: 'ticket-percent-outline', onPress: () => navigation.navigate('AdminPromoCode', { codeId: target.id! }) });
  }
  if (target.type === 'store_event' && target.id) {
    links.push({ label: t('admin.auditEntry.openEvent'), icon: 'webhook', onPress: () => navigation.navigate('AdminStoreEvent', { eventId: target.id! }) });
  }
  if (target.type === 'price') links.push({ label: t('admin.auditEntry.openPrices'), icon: 'cash-multiple', onPress: () => navigation.navigate('AdminPrices') });
  if (target.type === 'settings') links.push({ label: t('admin.auditEntry.openSettings'), icon: 'application-cog-outline', onPress: () => navigation.navigate('AdminSettings') });
  links.push({
    label: t('admin.auditEntry.sameAdmin'),
    icon: 'history',
    onPress: () => navigation.navigate('AdminAudit', { adminId: entry.actor.id ?? entry.actor.label }),
  });

  return (
    <AdminScreen title={t('admin.auditEntry.title')} presentation="modal" testID="screen-AdminAuditEntry">
      <View style={styles.pad}>
        <Card>
          <View style={styles.head}>
            <ToneCircle icon={visual.icon as IconName} tone={visual.tone} size={40} />
            <View style={styles.flex}>
              <AppText variant="titleS">{auditTitle(entry, t)}</AppText>
              {subtitle ? (
                <AppText variant="bodyM" color="textSecondary">
                  {subtitle}
                </AppText>
              ) : null}
            </View>
          </View>
          <AppText variant="bodyS" color="textTertiary" tabular>
            {formatFullDateTime(entry.at)}
          </AppText>
        </Card>
      </View>

      <KeyValueCard
        title={t('admin.auditEntry.what')}
        rows={[
          { label: t('admin.auditEntry.admin'), value: entry.actor.displayName ? `${actorName(entry.actor, t)} (${entry.actor.label})` : actorName(entry.actor, t) },
          { label: t('admin.auditEntry.action'), value: entry.action, numeric: true },
          { label: t('admin.auditEntry.target'), value: [target.type, target.label ?? target.id].filter(Boolean).join(' · ') || '—' },
          { label: t('admin.auditEntry.ip'), value: entry.ip ?? '—', numeric: true, hidden: !entry.ip && !signIn },
          { label: t('admin.auditEntry.entry'), value: `#${entry.id}`, numeric: true },
        ]}
      />

      {changes.length ? (
        <KeyValueCard title={t('admin.auditEntry.changes')} rows={changes.map((r) => ({ label: r.label, value: `${r.before} → ${r.after}` }))} />
      ) : null}
      {facts.length ? <KeyValueCard title={t('admin.auditEntry.details')} rows={facts.map((r) => ({ label: r.label, value: r.value ?? '—' }))} /> : null}

      {Object.keys(entry.details ?? {}).length ? (
        <View style={styles.raw}>
          <CodeBlock label={t('admin.auditEntry.raw')} text={JSON.stringify(entry.details, null, 2)} />
        </View>
      ) : null}

      {entry.action === 'admin.sign_in_failed' ? (
        <AppText variant="bodyS" color="textSecondary" style={styles.note}>
          {t('admin.auditEntry.failedNote')}
        </AppText>
      ) : null}

      <View style={styles.links}>
        {links.map((l) => (
          <Button key={l.label} label={l.label} icon={l.icon} variant="secondary" size="M" onPress={l.onPress} block />
        ))}
      </View>
    </AdminScreen>
  );
}

export const AdminAuditEntryScreen = withAdmin(AdminAuditEntry);

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pad: { paddingHorizontal: 16, paddingTop: 16 },
  head: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  raw: { paddingTop: 24 },
  note: { paddingHorizontal: 32, paddingTop: 12 },
  links: { paddingHorizontal: 16, paddingTop: 24, gap: 8 },
});
