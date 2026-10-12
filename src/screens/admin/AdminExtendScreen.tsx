import { useState } from 'react';
import { View } from 'react-native';

import { adminApi, invalidateAdmin, useAdminQuery } from '../../api/admin';
import type { AdminGrant } from '../../api/types';
import { useI18n } from '../../i18n';
import type { RootScreenProps } from '../../navigation/types';
import { AppText, Banner, Button, Card, SegmentedControl, SkeletonCard, StickyFooter } from '../../ui';
import { AdminScreen, useAdminContext, withAdmin } from './components/AdminFrame';
import { USER_CHANGED, useAdminAction, useNow } from './components/actions';
import { DurationPicker, formStyles, UserHeader } from './components/forms';
import { ErrorState, PreviewCard, ReasonField } from './components/parts';
import {
  checkCustomEnd,
  END_ERROR_TEXT,
  endOfLocalDay,
  EXTEND_LABEL,
  EXTEND_PRESETS,
  planForPreset,
  presetDays,
  presetEnd,
  wholeDays,
  type DurationPreset,
} from './lib/durations';
import { formatDate } from './lib/format';
import { grantEnd, latestExtendableGrant, previewExtend } from './lib/plan';
import { PLAN_LABEL } from './lib/users';

/**
 * Route `AdminExtend`, "Add time" (backend-spec 2.10 POST /extend): pushes the end of one gift (the
 * one tapped, or the latest running gift); the days stack on it. Without a gift it starts one.
 */
function AdminExtendForm({ navigation, route }: RootScreenProps<'AdminExtend'>) {
  const { t } = useI18n();
  const act = useAdminAction();
  const { offline } = useAdminContext();
  const nowMs = useNow();
  const ref = route.params.userId;
  const query = useAdminQuery(`user:${ref}`, () => adminApi.user(ref));
  const [preset, setPreset] = useState<DurationPreset>('1m');
  const [custom, setCustom] = useState<Date | null>(null);
  const [plan, setPlan] = useState<'monthly' | 'yearly' | null>(null);
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  const detail = query.data;

  if (!detail) {
    return (
      <AdminScreen title={t('admin.extend.title')} presentation="modal" testID="screen-AdminExtend">
        {query.error ? (
          <ErrorState error={query.error} title={t('admin.user.loadFailed')} onRetry={query.reload} onBack={() => navigation.goBack()} />
        ) : (
          <View style={formStyles.body}>
            <SkeletonCard />
          </View>
        )}
      </AdminScreen>
    );
  }

  const now = new Date(nowMs);
  const who = detail.user.email ?? detail.user.displayName ?? detail.user.publicId;
  const wanted = route.params.grantId ? detail.grants.find((g) => String(g.id) === route.params.grantId) : undefined;
  const target: AdminGrant | null = wanted ?? latestExtendableGrant(detail.grants, nowMs);
  const blocked = target?.status === 'revoked' ? 'revoked' : target && target.endsAt === null ? 'lifetime' : null;
  const base = target ? new Date(Math.max(grantEnd(target), nowMs)) : now;
  const end = preset === 'custom' ? (custom ? endOfLocalDay(custom) : null) : presetEnd(preset, base);
  const days = preset === 'custom' ? null : presetDays(preset, base);
  const newPlan = plan ?? (planForPreset(preset, end ? wholeDays(now, end) : null) === 'yearly' ? 'yearly' : 'monthly');
  const endError = checkCustomEnd(end, now, target ? 7300 : 3650);
  const reasonOk = reason.trim().length >= 3;
  const valid = !blocked && !endError && reasonOk && detail.user.status !== 'merged';
  const preview = end ? previewExtend(detail, target, end.getTime(), newPlan, t, nowMs) : null;

  const submit = () => {
    setTried(true);
    if (!valid || !end) return;
    void act({
      title: t('admin.grant.confirmAddTitle', { who }),
      message: t('admin.extend.confirmBody', { date: formatDate(end) }),
      confirmLabel: t('admin.grant.add'),
      icon: 'calendar-clock',
      run: () =>
        adminApi.extend(detail.user.id, {
          reason: reason.trim(),
          ...(target ? { grantId: target.id } : { plan: newPlan }),
          ...(days != null ? { days } : { endsAt: end.toISOString() }),
        }),
      success: (r) => `${t('admin.extend.done', { who, date: r.grant.endsAt ? formatDate(r.grant.endsAt) : t('admin.time.forever') })} ${t('admin.common.appPicksUp')}`,
      after: () => {
        invalidateAdmin(...USER_CHANGED);
        navigation.goBack();
      },
    });
  };

  return (
    <AdminScreen
      title={t('admin.extend.title')}
      presentation="modal"
      keyboard
      footer={
        <StickyFooter>
          <Button label={t('admin.grant.add')} icon="calendar-clock" size="L" block onPress={submit} disabled={offline || !!blocked || (tried && !valid)} testID="admin-extend-submit" />
        </StickyFooter>
      }
      testID="screen-AdminExtend">
      <View style={formStyles.body}>
        <UserHeader detail={detail} />

        <Card title={target ? t('admin.extend.target') : t('admin.extend.noTarget')}>
          {target ? (
            <AppText variant="bodyM" tabular>
              {target.source === 'promo'
                ? t('admin.user.gift.codeTitle', { code: target.promoCode ?? '—', plan: t(PLAN_LABEL[target.plan]) })
                : t('admin.extend.targetLine', { plan: t(PLAN_LABEL[target.plan]), date: target.endsAt ? formatDate(target.endsAt) : t('admin.time.forever') })}
            </AppText>
          ) : (
            <AppText variant="bodyM" color="textSecondary">
              {t('admin.extend.noTargetBody')}
            </AppText>
          )}
          {target && target.status === 'expired' ? (
            <AppText variant="bodyS" color="textSecondary">
              {t('admin.extend.expired')}
            </AppText>
          ) : null}
        </Card>

        {blocked ? <Banner tone="warning" body={blocked === 'lifetime' ? t('admin.extend.lifetime') : t('admin.extend.revoked')} /> : null}

        {!target ? (
          <View style={formStyles.block}>
            <AppText variant="labelM" color="textSecondary">
              {t('admin.form.plan')}
            </AppText>
            <SegmentedControl
              options={[
                { value: 'monthly' as const, label: t('admin.plan.monthly') },
                { value: 'yearly' as const, label: t('admin.plan.yearly') },
              ]}
              value={newPlan}
              onChange={setPlan}
              accessibilityLabel={t('admin.form.plan')}
            />
          </View>
        ) : null}

        <DurationPicker
          label={t('admin.grant.addHowMuch')}
          presets={EXTEND_PRESETS}
          labels={EXTEND_LABEL}
          value={preset}
          onChange={setPreset}
          customDate={custom}
          onCustomDate={setCustom}
          customLabel={t('admin.form.newEnd')}
          disabled={!!blocked}
          error={tried && endError ? t(END_ERROR_TEXT[endError]) : null}
          endPreview={end ? t('admin.extend.newEnd', { date: formatDate(end, { weekday: true }) }) : null}
        />

        {preview ? <PreviewCard preview={preview} /> : null}

        <ReasonField value={reason} onChange={setReason} disabled={!!blocked} error={tried && !reasonOk ? t('admin.form.reasonShort') : null} />
      </View>
    </AdminScreen>
  );
}

export const AdminExtendScreen = withAdmin(AdminExtendForm);
