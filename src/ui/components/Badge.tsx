import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '../theme';
import type { ColorToken } from '../tokens';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

export type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'accent';

/** Background, text and strong (dot) colour of each tone. */
export const BADGE_TONES: Record<BadgeTone, { bg: ColorToken; fg: ColorToken; strong: ColorToken }> = {
  neutral: { bg: 'fill', fg: 'textSecondary', strong: 'textSecondary' },
  primary: { bg: 'primarySoft', fg: 'onPrimarySoft', strong: 'primary' },
  success: { bg: 'successSoft', fg: 'onSuccessSoft', strong: 'success' },
  warning: { bg: 'warningSoft', fg: 'onWarningSoft', strong: 'warning' },
  danger: { bg: 'dangerSoft', fg: 'onDangerSoft', strong: 'danger' },
  accent: { bg: 'accentSoft', fg: 'accentInk', strong: 'accentInk' },
};

type Props = {
  label: string;
  tone?: BadgeTone;
  size?: 'sm' | 'md';
  /** A 6 dp dot in the tone's strong colour before the label. */
  dot?: boolean;
  /** A 12 dp icon before the label. */
  icon?: IconName;
  /** A number: tighter padding and a minimum width of 20. */
  count?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * Status pill (3.10). Heights are minimums so the label can grow with the font scale; the label is
 * labelS and never wraps.
 */
export function Badge({ label, tone = 'neutral', size = 'md', dot, icon, count, accessibilityLabel, style }: Props) {
  const t = useTheme();
  const c = BADGE_TONES[tone];
  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel ?? label}
      style={[
        styles.badge,
        {
          minHeight: size === 'sm' ? 18 : 20,
          minWidth: count ? 20 : undefined,
          paddingHorizontal: count ? 6 : 8,
          backgroundColor: t.color[c.bg],
          borderRadius: t.radius.pill,
        },
        style,
      ]}>
      {dot ? <View style={[styles.dot, { backgroundColor: t.color[c.strong] }]} /> : null}
      {icon ? <Icon name={icon} size={12} color={c.fg} /> : null}
      <AppText variant="labelS" color={c.fg} numberOfLines={1} tabular={count}>
        {label}
      </AppText>
    </View>
  );
}

/** The 8 dp danger dot on tab icons and avatars, with a 2 px ring in the surface colour. */
export function DotBadge({ surface = 'surface2', style }: { surface?: ColorToken; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return <View style={[styles.dotBadge, { backgroundColor: t.color.danger, borderColor: t.color[surface] }, style]} />;
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingVertical: 1,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  dotBadge: { width: 12, height: 12, borderRadius: 6, borderWidth: 2 },
});
