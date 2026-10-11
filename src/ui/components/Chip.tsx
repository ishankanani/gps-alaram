import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { haptics } from '../haptics';
import { useTheme } from '../theme';
import type { ColorToken } from '../tokens';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { Touchable } from './Touchable';

export type ChipVariant = 'choice' | 'filter' | 'assist';

export type ChipProps = {
  label: string;
  onPress?: () => void;
  /** choice: single-select (radio); filter: multi-select (checkbox); assist: an action. */
  variant?: ChipVariant;
  selected?: boolean;
  /** A 16 dp icon before the label. */
  icon?: IconName;
  /** A 20 dp KindIcon (or anything else) before the label. */
  leading?: ReactNode;
  disabled?: boolean;
  /** Pro-only: a trailing lock; tapping should open the Paywall. */
  locked?: boolean;
  /** Assist chips over the map: surface2 with elevation 1 instead of fill. */
  onMap?: boolean;
  /** At most this wide (favourite chips with long stop names). */
  maxWidth?: number;
  accessibilityLabel?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * Chip (3.11): 36 dp tall with a 48 dp touch area (hitSlop 6 vertically; ChipRow and ChipWrap
 * reserve that room). Choice chips are radios, filter chips are checkboxes.
 */
export function Chip({
  label,
  onPress,
  variant = 'choice',
  selected = false,
  icon,
  leading,
  disabled,
  locked,
  onMap,
  maxWidth,
  accessibilityLabel,
  testID,
  style,
}: ChipProps) {
  const t = useTheme();
  let bg = 'transparent';
  let fg: ColorToken = 'text';
  let border: string | null = null;
  if (variant === 'choice') {
    bg = selected ? t.color.primary : t.color.fill;
    fg = selected ? 'onPrimary' : 'text';
  } else if (variant === 'filter') {
    bg = selected ? t.color.primarySoft : 'transparent';
    fg = selected ? 'onPrimarySoft' : 'text';
    border = selected ? null : t.color.borderStrong;
  } else {
    bg = onMap ? t.color.surface2 : t.color.fill;
  }
  if (disabled) fg = 'textDisabled';
  const hasLeading = !!icon || !!leading || (variant === 'filter' && selected);
  const role = variant === 'choice' ? 'radio' : variant === 'filter' ? 'checkbox' : 'button';

  return (
    <Touchable
      testID={testID}
      onPress={() => {
        if (variant !== 'assist' && !locked) haptics.selection();
        onPress?.();
      }}
      disabled={disabled}
      hitSlop={{ top: 6, bottom: 6 }}
      accessibilityRole={role}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={variant === 'assist' ? { disabled: !!disabled } : { disabled: !!disabled, checked: selected, selected }}
      style={[
        styles.chip,
        {
          backgroundColor: bg,
          borderRadius: t.radius.pill,
          paddingLeft: hasLeading ? 12 : 14,
          maxWidth,
        },
        border ? { borderWidth: 1, borderColor: border } : null,
        onMap && variant === 'assist' ? t.elevation(1) : null,
        style,
      ]}>
      {variant === 'filter' && selected ? <Icon name="check" size={16} color={fg} /> : null}
      {icon ? <Icon name={icon} size={16} color={fg} /> : null}
      {leading}
      <AppText variant="labelM" color={fg} numberOfLines={1} style={styles.label}>
        {label}
      </AppText>
      {locked ? <Icon name="lock-outline" size={14} color="textTertiary" /> : null}
    </Touchable>
  );
}

/**
 * A horizontal row of chips: 16 content padding, gap 8, the first chip on the gutter. The row is
 * 48 dp tall for the chips' touch areas but takes 36 dp in the layout.
 */
export function ChipRow({
  children,
  radio,
  accessibilityLabel,
  style,
}: {
  children: ReactNode;
  /** A single-select row: announced as a radio group. */
  radio?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      accessibilityRole={radio ? 'radiogroup' : undefined}
      accessibilityLabel={accessibilityLabel}
      style={[styles.row, style]}
      contentContainerStyle={styles.rowContent}>
      {children}
    </ScrollView>
  );
}

/** Chips that wrap onto more lines (feedback answers, admin presets), with room for their touch areas. */
export function ChipWrap({
  children,
  radio,
  accessibilityLabel,
  style,
}: {
  children: ReactNode;
  radio?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View accessibilityRole={radio ? 'radiogroup' : undefined} accessibilityLabel={accessibilityLabel} style={[styles.wrap, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingRight: 14,
    overflow: 'hidden',
  },
  label: { flexShrink: 1 },
  row: { flexGrow: 0, marginVertical: -6 },
  rowContent: { paddingHorizontal: 16, paddingVertical: 6, gap: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 8, rowGap: 12, paddingVertical: 6, marginVertical: -6 },
});
