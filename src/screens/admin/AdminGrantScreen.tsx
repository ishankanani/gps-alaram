import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { adminApi, invalidateAdmin, useAdminQuery } from '../../api/admin';
import type { AdminGrant, PaidPlan } from '../../api/types';
import { useI18n } from '../../i18n';
import type { RootScreenProps } from '../../navigation/types';
import { AppText, Banner, Button, ListItem, Section, SegmentedControl, SkeletonCard, StickyFooter } from '../../ui';
import { AdminScreen, useAdminContext, withAdmin } from './components/AdminFrame';
import { USER_CHANGED, useAdminAction, useNow } from './components/actions';
import { DurationPicker, formStyles, UserHeader } from './components/forms';
import { ErrorState, PreviewCard, ReasonField } from './components/parts';
import {
  checkCustomEnd,
  END_ERROR_TEXT,
  endOfLocalDay,
  GRANT_PRESETS,
  planForPreset,
  PRESET_LABEL,
  presetDays,
  presetEnd,
  type DurationPreset,
} from './lib/durations';
import { formatDate } from './lib/format';
import { grantEnd, hasActiveStoreSubscription, latestExtendableGrant, previewExtend, previewGrant } from './lib/plan';
import { PLAN_LABEL } from './lib/users';

const PLANS: PaidPlan[] = ['monthly', 'yearly', 'lifetime'];

/**
 * Route `AdminGrant`, "Give Pro" (backend-spec 7.7, ui-critiques "Give Pro, Change plan, Add
 * time"): a plan, a duration (1 month, 3 months, 6 months, 1 year, Lifetime or a date), and with a
 * gift already running the choice to add to it (extend) or start a separate one (grants). Shows
 * the plan before and after, and asks for a reason.
 */
function AdminGrantForm({ navigation, route }: RootScreenProps<'AdminGrant'>) {
  const { t } = useI18n();
  const act = useAdminAction();
  const { offline } = useAdminContext();
  const nowMs = useNow();
  const ref = route.params.userId;
  const query = useAdminQuery(`user:${ref}`, () => adminApi.user(ref));
  const [preset, setPreset] = useState<DurationPreset>('1m');
  const [plan, setPlan] = useState<PaidPlan>('monthly');
  const [custom, setCustom] = useState<Date | null>(null);
  const [mode, setMode] = useState<'add' | 'separate'>('add');
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  const detail = query.data;

  if (!detail) {
    return (
      <AdminScreen title={t('admin.grant.title')} presentation="modal" testID="screen-AdminGrant">
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
  const running: AdminGrant | null = latestExtendableGrant(detail.grants, nowMs);
  const adding = !!running && mode === 'add' && preset !== 'lifetime' && plan !== 'lifetime';
  const runningBase = running ? new Date(Math.max(grantEnd(running), nowMs)) : now;
  const base = adding ? runningBase : now;

  const end: Date | null =
    preset === 'lifetime' || plan === 'lifetime' ? null : preset === 'custom' ? (custom ? endOfLocalDay(custom) : null) : presetEnd(preset, base);
  const lifetime = plan === 'lifetime' || preset === 'lifetime';
  const addEnd = running && !lifetime ? (preset === 'custom' ? (custom ? endOfLocalDay(custom) : null) : presetEnd(preset, runningBase)) : null;
  const endError = lifetime ? null : checkCustomEnd(end, now);
  const reasonOk = reason.trim().length >= 3;
  const valid = !endError && reasonOk && detail.user.status !== 'merged';

  const preview =
    adding && running && end
      ? previewExtend(detail, running, end.getTime(), running.plan, t, nowMs)
      : previewGrant(detail, { plan: lifetime ? 'lifetime' : plan, end: end ? end.getTime() : Infinity }, t, nowMs);

  const choosePreset = (p: DurationPreset) => {
    setPreset(p);
    setPlan(planForPreset(p));
  };
  const choosePlan = (p: PaidPlan) => {
    setPlan(p);
    if (p === 'lifetime') setPreset('lifetime');
    else if (preset === 'lifetime') setPreset(p === 'yearly' ? '1y' : '1m');
  };

  const submit = () => {
    setTried(true);
    if (!valid) return;
    void act({
      title: adding ? t('admin.grant.confirmAddTitle', { who }) : t('admin.grant.confirmTitle', { who }),
      message: t('admin.grant.confirmBody', { after: preview.after }),
      confirmLabel: adding ? t('admin.grant.add') : t('admin.grant.give'),
      icon: 'gift-outline',
      run: () => {
        const r = reason.trim();
        if (adding && running) {
          return adminApi.extend(detail.user.id, {
            grantId: running.id,
            reason: r,
            ...(preset === 'custom' && end ? { endsAt: end.toISOString() } : { days: presetDays(preset, base) ?? 30 }),
          });
        }
        if (lifetime) return adminApi.grant(detail.user.id, { plan: 'lifetime', reason: r });
        if (preset === 'custom' && end) return adminApi.grant(detail.user.id, { plan, endsAt: end.toISOString(), reason: r });
        return adminApi.grant(detail.user.id, { plan, durationDays: presetDays(preset, now) ?? 30, reason: r });
      },
      success: (result) =>
        `${result.grant.endsAt ? t('admin.grant.done', { who, until: formatDate(result.grant.endsAt) }) : t('admin.grant.doneForever', { who })} ${t('admin.common.appPicksUp')}`,
      after: () => {
        invalidateAdmin(...USER_CHANGED);
        navigation.goBack();
      },
    });
  };

  return (
    <AdminScreen
      title={t('admin.grant.title')}
      presentation="modal"
      keyboard
      footer={
        <StickyFooter>
          <Button
            label={adding ? t('admin.grant.add') : t('admin.grant.give')}
            icon="gift-outline"
            size="L"
            block
            onPress={submit}
            disabled={offline || (tried && !valid)}
            testID="admin-grant-submit"
          />
        </StickyFooter>
      }
      testID="screen-AdminGrant">
      <View style={formStyles.body}>
        <UserHeader detail={detail} />

        {hasActiveStoreSubscription(detail, nowMs) ? <Banner tone="info" body={t('admin.grant.paysBanner')} /> : null}
        {detail.user.status === 'disabled' ? <Banner tone="warning" body={t('admin.grant.disabledBanner')} /> : null}

        {running && !lifetime ? (
          <View style={formStyles.block}>
            <AppText variant="labelM" color="textSecondary">
              {t('admin.grant.howTitle')}
            </AppText>
            <Section style={styles.flush}>
              <ListItem
                title={t('admin.grant.addTo', { from: formatDate(running.endsAt), to: addEnd ? formatDate(addEnd) : '—' })}
                subtitle={t('admin.grant.addToBody', { plan: t(PLAN_LABEL[running.plan]) })}
                selected={mode === 'add'}
                onPress={() => setMode('add')}
                testID="admin-grant-mode-add"
              />
              <ListItem
                title={t('admin.grant.separate')}
                subtitle={t('admin.grant.separateBody')}
                selected={mode === 'separate'}
                onPress={() => setMode('separate')}
                testID="admin-grant-mode-separate"
              />
            </Section>
          </View>
        ) : null}

        {!adding ? (
          <View style={formStyles.block}>
            <AppText variant="labelM" color="textSecondary">
              {t('admin.form.plan')}
            </AppText>
            <SegmentedControl
              options={PLANS.map((p) => ({ value: p, label: t(PLAN_LABEL[p]) }))}
              value={plan}
              onChange={choosePlan}
              accessibilityLabel={t('admin.form.plan')}
              testID="admin-grant-plan"
            />
          </View>
        ) : null}

        <DurationPicker
          label={adding ? t('admin.grant.addHowMuch') : t('admin.form.duration')}
          presets={adding ? GRANT_PRESETS.filter((p) => p !== 'lifetime') : GRANT_PRESETS}
          labels={PRESET_LABEL}
          value={preset}
          onChange={choosePreset}
          customDate={custom}
          onCustomDate={setCustom}
          customLabel={adding ? t('admin.form.newEnd') : t('admin.form.endDate')}
          error={tried && endError ? t(END_ERROR_TEXT[endError]) : null}
          endPreview={lifetime ? t('admin.grant.endForever') : end ? t('admin.grant.endUntil', { date: formatDate(end, { weekday: true }) }) : null}
        />

        <PreviewCard preview={preview} />

        <ReasonField value={reason} onChange={setReason} error={tried && !reasonOk ? t('admin.form.reasonShort') : null} />
      </View>
    </AdminScreen>
  );
}

export const AdminGrantScreen = withAdmin(AdminGrantForm);

const styles = StyleSheet.create({
  flush: { marginHorizontal: -16 },
});
