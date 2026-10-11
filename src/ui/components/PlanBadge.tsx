import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useI18n } from '../../i18n';
import { useTheme } from '../theme';
import { usesLatinCase } from '../typography';
import { AppText } from './AppText';
import { Icon } from './Icon';

export type PlanBadgeVariant = 'free' | 'pro' | 'lifetime';

const SIZES = {
  sm: { height: 18, padding: 6, label: 'labelS', icon: 0 },
  md: { height: 22, padding: 8, label: 'labelS', icon: 12 },
  lg: { height: 28, padding: 10, label: 'labelM', icon: 12 },
} as const;

/**
 * FREE / PRO / PRO · LIFETIME (3.28). The only uppercase text in the app, and only in Latin
 * scripts. The crown appears at md and lg; lifetime shows the infinity sign and only at lg.
 */
export function PlanBadge({
  variant,
  size = 'md',
  style,
}: {
  variant: PlanBadgeVariant;
  size?: 'sm' | 'md' | 'lg';
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const { t: tr, lang } = useI18n();
  const s = SIZES[variant === 'lifetime' ? 'lg' : size];
  const free = variant === 'free';
  const label = tr(free ? 'ui.plan.free' : variant === 'lifetime' ? 'ui.plan.lifetime' : 'ui.plan.pro');
  const icon = free || !s.icon ? null : variant === 'lifetime' ? 'infinity' : 'crown';
  return (
    <View
      accessible
      accessibilityLabel={label}
      style={[
        styles.badge,
        {
          minHeight: s.height,
          paddingHorizontal: s.padding,
          borderRadius: t.radius.pill,
          backgroundColor: free ? t.color.fill : t.color.accent,
        },
        style,
      ]}>
      {icon ? <Icon name={icon} size={s.icon} color={free ? 'textSecondary' : 'onAccent'} /> : null}
      <AppText
        variant={s.label}
        weight="bold"
        color={free ? 'textSecondary' : 'onAccent'}
        numberOfLines={1}
        style={[styles.label, usesLatinCase(lang) ? styles.upper : null]}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 4, paddingVertical: 1 },
  label: { letterSpacing: 0.6 },
  upper: { textTransform: 'uppercase' },
});
