import { StyleSheet, View } from 'react-native';

import type { AdminUserListItem, AuditEntry, StoreEvent } from '../../../api/types';
import { useI18n } from '../../../i18n';
import { AppText, Avatar, Badge, ListItem, PlanBadge, type BadgeTone, type IconName } from '../../../ui';
import { auditSubtitle, auditTitle, auditVisual } from '../lib/audit';
import { countryName } from '../lib/countries';
import { formatDate, formatDateTime, formatRelative, formatTime } from '../lib/format';
import { PLAN_LABEL, userTitle } from '../lib/users';
import { ToneCircle } from './parts';

type Position = { isFirst?: boolean; isLast?: boolean; grouped?: boolean };

const SOURCE_BADGE = {
  store: 'admin.sourceBadge.store',
  grant: 'admin.sourceBadge.grant',
  promo: 'admin.sourceBadge.promo',
} as const;

/**
 * A user in a list (ui-direction-a "AdminUsers"): avatar with the admin or disabled badge, the
 * email (or "Guest"), "SW-… · Germany · joined 3 Oct", and the plan with its source; Pro rows say
 * when the plan ends.
 */
export function UserRow({ user, onPress, meta = 'joined', ...position }: Position & {
  user: AdminUserListItem;
  onPress: () => void;
  meta?: 'joined' | 'seen';
}) {
  const { t } = useI18n();
  const pro = user.plan !== 'free';
  const country = user.country ? countryName(user.country) : null;
  const when =
    meta === 'seen'
      ? t('admin.users.seen', { when: formatRelative(user.lastSeenAt, t) })
      : t('admin.users.joined', { date: formatDate(user.createdAt, { year: 'auto' }) });
  const line = [user.email ? user.publicId : null, country, when].filter(Boolean).join(' · ');
  const title = user.email ? user.email : `${userTitle(user, t)} · ${user.publicId}`;
  const planLine = pro
    ? user.planExpiresAt
      ? t('admin.users.planUntil', { plan: t(PLAN_LABEL[user.plan]), date: formatDate(user.planExpiresAt, { year: 'always' }) })
      : t(PLAN_LABEL[user.plan])
    : null;
  return (
    <ListItem
      {...position}
      title={title}
      subtitle={line}
      subtitleLines={2}
      leading={
        <Avatar size={40} name={user.displayName} email={user.email} admin={user.role === 'admin'} disabled={user.status !== 'active'} pro={pro} />
      }
      meta={
        planLine || user.trial || user.notesCount > 0 ? (
          <>
            {planLine ? (
              <AppText variant="bodyS" color="textTertiary" tabular>
                {planLine}
              </AppText>
            ) : null}
            {user.trial ? <Badge label={t('admin.users.trialBadge')} tone="primary" size="sm" /> : null}
            {user.notesCount > 0 ? <Badge label={t('admin.users.notes', { count: user.notesCount })} icon="note-text-outline" size="sm" /> : null}
          </>
        ) : undefined
      }
      trailing={
        <View style={styles.planCol}>
          <PlanBadge variant={pro ? 'pro' : 'free'} size="sm" />
          {user.planSource ? <Badge label={t(SOURCE_BADGE[user.planSource])} size="sm" /> : null}
        </View>
      }
      onPress={onPress}
      accessibilityLabel={[title, line, planLine ?? t('admin.plan.free'), user.status === 'disabled' ? t('admin.users.filter.disabled') : null]
        .filter(Boolean)
        .join(', ')}
      testID={`admin-user-${user.publicId}`}
    />
  );
}

/** An audit entry: tone circle, "Alex Admin gave Pro (Yearly) to SW-…", the reason, and the time. */
export function AuditRow({ entry, onPress, showDate, ...position }: Position & { entry: AuditEntry; onPress: () => void; showDate?: boolean }) {
  const { t } = useI18n();
  const visual = auditVisual(entry);
  const subtitle = auditSubtitle(entry, t);
  const when = showDate ? formatDateTime(entry.at) : formatTime(entry.at);
  return (
    <ListItem
      {...position}
      title={auditTitle(entry, t)}
      titleLines={2}
      subtitle={subtitle || undefined}
      subtitleLines={2}
      leading={<ToneCircle icon={visual.icon as IconName} tone={visual.tone} />}
      leadingWidth={32}
      trailing={
        <AppText variant="labelS" color="textTertiary" tabular style={styles.time}>
          {when}
        </AppText>
      }
      onPress={onPress}
      testID={`admin-audit-${entry.id}`}
    />
  );
}

export const STORE_STATUS_TONE: Record<StoreEvent['status'], BadgeTone> = {
  processed: 'success',
  error: 'danger',
  unmatched: 'warning',
  stale: 'neutral',
  ignored: 'neutral',
};

export const STORE_STATUS_LABEL = {
  processed: 'admin.store.status.processed',
  error: 'admin.store.status.error',
  unmatched: 'admin.store.status.unmatched',
  stale: 'admin.store.status.stale',
  ignored: 'admin.store.status.ignored',
} as const;

/** A RevenueCat delivery: "BILLING_ISSUE", the user (or "No matching user"), the time and its status. */
export function StoreEventRow({ event, onPress, ...position }: Position & { event: StoreEvent; onPress: () => void }) {
  const { t } = useI18n();
  const who = event.user
    ? [event.user.displayName, event.user.publicId].filter(Boolean).join(' · ')
    : t('admin.store.noUser');
  const tone = STORE_STATUS_TONE[event.status];
  const icon: IconName = event.status === 'error' ? 'alert-circle-outline' : event.status === 'unmatched' ? 'account-question-outline' : 'webhook';
  return (
    <ListItem
      {...position}
      title={event.type}
      subtitle={`${who} · ${formatDateTime(event.receivedAt)}`}
      subtitleLines={2}
      leading={<ToneCircle icon={icon} tone={tone === 'success' ? 'primary' : tone} />}
      leadingWidth={32}
      trailing={
        <View style={styles.planCol}>
          <Badge label={t(STORE_STATUS_LABEL[event.status])} tone={tone} size="sm" />
          {event.environment === 'sandbox' ? <Badge label={t('admin.common.sandbox')} tone="warning" size="sm" /> : null}
        </View>
      }
      onPress={onPress}
      testID={`admin-store-event-${event.id}`}
    />
  );
}

const styles = StyleSheet.create({
  planCol: { alignItems: 'flex-end', gap: 4 },
  time: { alignSelf: 'flex-start', marginTop: 2 },
});
