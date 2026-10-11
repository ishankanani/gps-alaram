import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '../theme';
import type { ColorToken } from '../tokens';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { Touchable } from './Touchable';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'dangerOutline' | 'onAccent';
export type ButtonSize = 'L' | 'M' | 'S';

export type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  /** Full width: footers, sheets and cards. */
  block?: boolean;
  disabled?: boolean;
  /** A spinner replaces the content; presses are ignored. */
  loading?: boolean;
  /** Label and icon colour for transparent variants (a Banner's tone, a Toast's inversePrimary). */
  color?: ColorToken;
  /** Border colour for the outline variants. */
  borderColor?: ColorToken;
  borderWidth?: number;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

const SIZES = {
  L: { height: 56, padding: 24, radius: 'md', label: 'labelL', icon: 22, gap: 8 },
  M: { height: 48, padding: 20, radius: 'md', label: 'labelL', icon: 20, gap: 8 },
  S: { height: 36, padding: 14, radius: 'sm', label: 'labelM', icon: 18, gap: 6 },
} as const;

type Look = { bg: ColorToken | null; fg: ColorToken; border: ColorToken | null; pressed: ColorToken | null };

const LOOKS: Record<ButtonVariant, Look> = {
  primary: { bg: 'primary', fg: 'onPrimary', border: null, pressed: 'primaryPressed' },
  secondary: { bg: 'primarySoft', fg: 'onPrimarySoft', border: null, pressed: 'primarySoftPressed' },
  outline: { bg: null, fg: 'text', border: 'borderStrong', pressed: null },
  ghost: { bg: null, fg: 'primary', border: null, pressed: null },
  danger: { bg: 'danger', fg: 'onDanger', border: null, pressed: 'dangerPressed' },
  dangerOutline: { bg: null, fg: 'danger', border: 'borderStrong', pressed: null },
  onAccent: { bg: 'inkOnAccent', fg: 'onInk', border: null, pressed: null },
};

/**
 * Buttons (3.2). Labels start with a verb, wrap to 2 lines and grow the button (minHeight, never a
 * fixed height). Disabled never uses opacity. Button S draws 36 dp but its touch area is 48 dp,
 * reserved by its own wrapper.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'L',
  icon,
  block,
  disabled,
  loading,
  color,
  borderColor,
  borderWidth,
  accessibilityLabel,
  accessibilityHint,
  testID,
  style,
}: ButtonProps) {
  const t = useTheme();
  const [width, setWidth] = useState<number | null>(null);
  const s = SIZES[size];
  const look = LOOKS[variant];
  const transparent = look.bg == null;
  const fg: ColorToken = disabled ? 'textDisabled' : (color ?? look.fg);
  const bg = disabled ? (transparent ? 'transparent' : t.color.fill) : look.bg ? t.color[look.bg] : 'transparent';
  const border = look.border || borderColor ? (disabled ? 'border' : (borderColor ?? look.border)) : null;

  const button = (
    <Touchable
      testID={testID}
      onPress={loading ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      pressedColor={look.pressed ? t.color[look.pressed] : undefined}
      hitSlop={size === 'S' ? { top: 6, bottom: 6 } : undefined}
      onLayout={loading ? undefined : (e) => setWidth(e.nativeEvent.layout.width)}
      style={[
        styles.button,
        {
          minHeight: s.height,
          paddingHorizontal: s.padding,
          borderRadius: t.radius[s.radius],
          backgroundColor: bg,
          gap: s.gap,
        },
        border ? { borderWidth: borderWidth ?? 1, borderColor: t.color[border] } : null,
        block ? styles.block : null,
        loading && width ? { minWidth: width } : null,
        size === 'S' ? null : style,
      ]}>
      {loading ? (
        <ActivityIndicator size={20} color={t.color[fg]} />
      ) : (
        <>
          {icon ? <Icon name={icon} size={s.icon} color={fg} /> : null}
          <AppText variant={s.label} color={fg} numberOfLines={2} align="center" style={styles.label}>
            {label}
          </AppText>
        </>
      )}
    </Touchable>
  );

  if (size !== 'S') return button;
  // The 48 dp touch area of Button S lies inside its own bounds, so hitSlop always reaches it.
  return <View style={[styles.slop, block ? styles.block : styles.inline, style]}>{button}</View>;
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  block: { alignSelf: 'stretch' },
  inline: { alignSelf: 'flex-start' },
  label: { flexShrink: 1 },
  slop: { paddingVertical: 6, minWidth: 48 },
});
