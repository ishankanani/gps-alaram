import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '../theme';
import type { ColorToken } from '../tokens';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { Touchable } from './Touchable';

type Props = {
  label: string;
  /** "184" */
  value: string;
  /** "km", inline after the value in bodyL textSecondary. */
  unit?: string;
  caption?: string;
  /** success for "+12 %", danger for "−3 %", otherwise textTertiary. */
  captionTone?: 'neutral' | 'success' | 'danger';
  icon?: IconName;
  /** numM in the admin area and on Arrived (3 compact tiles). */
  compact?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

const CAPTION: Record<NonNullable<Props['captionTone']>, ColorToken> = {
  neutral: 'textTertiary',
  success: 'success',
  danger: 'danger',
};

/** StatTile (3.23): a label (up to 2 lines), a tabular value and a caption. Grids use 2 columns, gap 12. */
export function StatTile({ label, value, unit, caption, captionTone = 'neutral', icon, compact, onPress, accessibilityLabel, style }: Props) {
  const t = useTheme();
  const content: ReactNode = (
    <>
      <View style={styles.top}>
        <AppText variant="labelS" color="textSecondary" numberOfLines={2} style={styles.label}>
          {label}
        </AppText>
        {icon ? <Icon name={icon} size={20} color="textTertiary" /> : null}
      </View>
      <View style={styles.valueRow}>
        <AppText variant={compact ? 'numM' : 'numL'} shrink={false} style={styles.value}>
          {value}
          {unit ? (
            <AppText variant="bodyL" color="textSecondary">
              {` ${unit}`}
            </AppText>
          ) : null}
        </AppText>
      </View>
      {caption ? (
        <AppText variant="bodyS" color={CAPTION[captionTone]}>
          {caption}
        </AppText>
      ) : null}
    </>
  );
  const box = [styles.tile, { backgroundColor: t.color.surface1, borderRadius: t.radius.lg }, style];
  const a11yLabel = accessibilityLabel ?? [label, unit ? `${value} ${unit}` : value, caption].filter(Boolean).join(', ');
  if (!onPress) {
    return (
      <View style={box} accessible accessibilityLabel={a11yLabel}>
        {content}
      </View>
    );
  }
  return (
    <Touchable onPress={onPress} style={[box, styles.pressable]} accessibilityRole="button" accessibilityLabel={a11yLabel}>
      {content}
    </Touchable>
  );
}

const styles = StyleSheet.create({
  tile: { padding: 16, minHeight: 96, gap: 4, flex: 1 },
  pressable: { overflow: 'hidden' },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  label: { flex: 1 },
  valueRow: { flexDirection: 'row', alignItems: 'baseline' },
  value: { flexShrink: 1 },
});
