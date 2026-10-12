import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { adminApi, invalidateAdmin, useAdminQuery } from '../../api/admin';
import type { PlanId } from '../../api/types';
import { useI18n } from '../../i18n';
import type { RootScreenProps } from '../../navigation/types';
import { AppText, Banner, Button, ListItem, Section, SkeletonCard, StickyFooter } from '../../ui';
import { AdminScreen, useAdminContext, withAdmin } from './components/AdminFrame';
import { USER_CHANGED, useAdminAction, useNow } from './components/actions';
import { DurationPicker, formStyles, UserHeader } from './components/forms';
import { ErrorState, PreviewCard, ReasonField } from './components/parts';
import { checkCustomEnd, END_ERROR_TEXT, endOfLocalDay, PLAN_PRESETS, PRESET_LABEL, presetDays, presetEnd, type DurationPreset } from './lib/durations';
import { formatDate } from './lib/format';
import { grantCounts, hasActiveStoreSubscription, previewChangePlan } from './lib/plan';
import { PLAN_LABEL, planName } from './lib/users';

const CHOICES: PlanId[] = ['free', 'monthly', 'yearly', 'lifetime'];

/**
 * Route `AdminChangePlan` (backend-spec 2.10 POST /plan, 3.3): every active gift and code is
 * revoked, then (unless Free) one new gift starts. Store subscriptions are never touched.
 */
function AdminChangePlanForm({ navigation, route }: RootScreenProps<'AdminChangePlan'>) {
  const { t } = useI18n();
  const act = useAdminAction();
  const { offline } = useAdminContext();
  const nowMs = useNow();
  const ref = route.params.userId;
  const query = useAdminQuery(`user:${ref}`, () => adminApi.user(ref));
  const [choice, setChoice] = useState<PlanId>('monthly');
  const [preset, setPreset] = useState<DurationPreset>('1m');
  const [custom, setCustom] = useState<Date | null>(null);
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  const detail = query.data;

  if (!detail) {
    return (
      <AdminScreen title={t('admin.changePlan.title')} presentation="modal" testID="screen-AdminChangePlan">
        {query.error ? (
          <ErrorState error={query.error} title={t('admin.user.loadFailed')} onRetry={query.reload} onBack={() => navigation.goBack()} />
        ) : (
          <View style={formStyles.body}>
            <SkeletonCard />
            <SkeletonCard />
          </View>
        )}
      </AdminScreen>
    );
  }

  const now = new Date(nowMs);
  const who = detail.user.email ?? detail.user.displayName ?? detail.user.publicId;
  const timed = choice === 'monthly' || choice === 'yearly';
  const end = timed ? (preset === 'custom' ? (custom ? endOfLocalDay(custom) : null) : presetEnd(preset, now)) : null;
  const endError = timed ? checkCustomEnd(end, now) : null;
  const reasonOk = reason.trim().length >= 3;
  const valid = !endError && reasonOk && detail.user.status !== 'merged';
  const activeGifts = detail.grants.filter((g) => grantCounts(g, nowMs)).length;
  const store = hasActiveStoreSubscription(detail, nowMs);
  const preview = previewChangePlan(
    detail,
    choice === 'free' ? null : { plan: choice, end: choice === 'lifetime' ? Infinity : (end?.getTime() ?? nowMs) },
    t,
    nowMs,
  );

  const pick = (p: PlanId) => {
    setChoice(p);
    if (p === 'monthly') setPreset('1m');
    if (p === 'yearly') setPreset('1y');
  };

  const submit = () => {
    setTried(true);
    if (!valid) return;
    void act({
      title: t('admin.changePlan.confirmTitle', { who, plan: planName(choice, t) }),
      message: [activeGifts ? t('admin.changePlan.revokes', { count: activeGifts }) : null, t('admin.grant.confirmBody', { after: preview.after })]
        .filter(Boolean)
        .join(' '),
      confirmLabel: t('admin.changePlan.confirm'),
      tone: choice === 'free' ? 'danger' : 'default',
      icon: 'swap-horizontal',
      run: () => {
        const r = reason.trim();
        if (!timed) return adminApi.changePlan(detail.user.id, { plan: choice, reason: r });
        if (preset === 'custom' && end) return adminApi.changePlan(detail.user.id, { plan: choice, endsAt: end.toISOString(), reason: r });
        return adminApi.changePlan(detail.user.id, { plan: choice, durationDays: presetDays(preset, now) ?? 30, reason: r });
      },
      success: (result) =>
        `${result.warnings.includes('store_subscription_active') ? t('admin.changePlan.doneStore', { who }) : t('admin.changePlan.done', { who, plan: planName(choice, t) })} ${t('admin.common.appPicksUp')}`,
      after: () => {
        invalidateAdmin(...USER_CHANGED);
        navigation.goBack();
      },
    });
  };

  return (
    <AdminScreen
      title={t('admin.changePlan.title')}
      presentation="modal"
      keyboard
      footer={
        <StickyFooter>
          <Button label={t('admin.changePlan.confirm')} icon="swap-horizontal" size="L" block onPress={submit} disabled={offline || (tried && !valid)} testID="admin-change-plan-submit" />
        </StickyFooter>
      }
      testID="screen-AdminChangePlan">
      <View style={formStyles.body}>
        <UserHeader detail={detail} />
        {store ? <Banner tone="warning" body={t('admin.changePlan.storeBanner')} /> : null}

        <View style={formStyles.block}>
          <AppText variant="labelM" color="textSecondary">
            {t('admin.changePlan.newPlan')}
          </AppText>
          <Section style={styles.flush}>
            {CHOICES.map((p) => (
              <ListItem
                key={p}
                title={p === 'free' ? t('admin.plan.free') : planName(p, t)}
                subtitle={t(`admin.changePlan.hint.${p}`)}
                subtitleLines={2}
                selected={choice === p}
                onPress={() => pick(p)}
                testID={`admin-change-plan-${p}`}
              />
            ))}
          </Section>
          {activeGifts ? (
            <AppText variant="bodyS" color="textSecondary">
              {t('admin.changePlan.revokes', { count: activeGifts })}
            </AppText>
          ) : null}
        </View>

        {timed ? (
          <DurationPicker
            label={t('admin.form.duration')}
            presets={PLAN_PRESETS}
            labels={PRESET_LABEL}
            value={preset}
            onChange={setPreset}
            customDate={custom}
            onCustomDate={setCustom}
            error={tried && endError ? t(END_ERROR_TEXT[endError]) : null}
            endPreview={end ? t('admin.grant.endUntil', { date: formatDate(end, { weekday: true }) }) : null}
          />
        ) : null}

        <PreviewCard preview={preview} extra={choice !== 'free' ? t('admin.changePlan.manual', { plan: t(PLAN_LABEL[choice]) }) : null} />

        <ReasonField value={reason} onChange={setReason} error={tried && !reasonOk ? t('admin.form.reasonShort') : null} />
      </View>
    </AdminScreen>
  );
}

export const AdminChangePlanScreen = withAdmin(AdminChangePlanForm);

const styles = StyleSheet.create({
  flush: { marginHorizontal: -16 },
});
