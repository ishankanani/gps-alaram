import { StyleSheet, View } from 'react-native';

import type { AdminUserDetail } from '../../../api/types';
import { useI18n } from '../../../i18n';
import { AppText, Avatar, Chip, ChipWrap, DateField, PlanBadge } from '../../../ui';
import { formatDate } from '../lib/format';
import { type DurationPreset } from '../lib/durations';
import type { AdminKey } from '../lib/text';
import { planName } from '../lib/users';

/** Who a form acts on: avatar, email or name, the SW- ID and the current plan. */
export function UserHeader({ detail }: { detail: AdminUserDetail }) {
  const { t } = useI18n();
  const u = detail.user;
  return (
    <View style={styles.user} accessible accessibilityLabel={[u.email ?? u.displayName ?? t('admin.user.guest'), u.publicId, planName(detail.plan.plan, t)].join(', ')}>
      <Avatar size={40} name={u.displayName} email={u.email} pro={detail.plan.isPro} surface="bg" />
      <View style={styles.flex}>
        <AppText variant="bodyL" weight="medium" numberOfLines={1}>
          {u.email ?? u.displayName ?? t('admin.user.guest')}
        </AppText>
        <AppText variant="bodyS" color="textSecondary" tabular>
          {u.publicId}
        </AppText>
      </View>
      <PlanBadge variant={detail.plan.isPro ? 'pro' : 'free'} size="sm" />
    </View>
  );
}

/**
 * Duration chips (single choice) and, for "Custom date", a DateField with the chosen end shown
 * under it.
 */
export function DurationPicker({
  label,
  presets,
  labels,
  value,
  onChange,
  customDate,
  onCustomDate,
  customLabel,
  error,
  endPreview,
  disabled,
}: {
  label: string;
  presets: readonly DurationPreset[];
  labels: Record<DurationPreset, AdminKey>;
  value: DurationPreset;
  onChange: (preset: DurationPreset) => void;
  customDate: Date | null;
  onCustomDate: (date: Date | null) => void;
  customLabel?: string;
  error?: string | null;
  /** "Pro until Tue, 10 Nov 2026" under the chips. */
  endPreview?: string | null;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  return (
    <View style={styles.block}>
      <AppText variant="labelM" color="textSecondary">
        {label}
      </AppText>
      <ChipWrap radio accessibilityLabel={label}>
        {presets.map((p) => (
          <Chip key={p} label={t(labels[p])} selected={value === p} onPress={() => onChange(p)} disabled={disabled} testID={`admin-duration-${p}`} />
        ))}
      </ChipWrap>
      {value === 'custom' ? (
        <DateField
          label={customLabel ?? t('admin.form.endDate')}
          value={customDate}
          onChange={onCustomDate}
          error={error}
          helper={customDate ? formatDate(customDate, { weekday: true }) : t('admin.form.dateHint')}
          disabled={disabled}
          testID="admin-custom-date"
        />
      ) : error ? (
        <AppText variant="bodyS" color="danger">
          {error}
        </AppText>
      ) : null}
      {endPreview ? (
        <AppText variant="bodyM" weight="medium" tabular>
          {endPreview}
        </AppText>
      ) : null}
    </View>
  );
}

export const formStyles = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingTop: 8, gap: 24 },
  block: { gap: 12 },
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  user: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  block: { gap: 12 },
});
