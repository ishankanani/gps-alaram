import { ActivityIndicator, Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '../theme';
import type { ColorToken } from '../tokens';
import { Icon, type IconName } from './Icon';
import { Touchable } from './Touchable';

export type IconButtonVariant = 'standard' | 'tonal' | 'filled' | 'map';

export type IconButtonProps = {
  icon: IconName;
  /** Required: an icon-only control needs a spoken label. */
  accessibilityLabel: string;
  onPress?: () => void;
  onLongPress?: () => void;
  variant?: IconButtonVariant;
  /** Icon colour for standard buttons; defaults to text. */
  color?: ColorToken;
  /** Toggle state: shows selectedIcon in selectedColor and sets accessibilityState.selected. */
  selected?: boolean;
  selectedIcon?: IconName;
  selectedColor?: ColorToken;
  disabled?: boolean;
  loading?: boolean;
  /** A small danger dot at the top right. */
  badge?: boolean;
  /** The surface the button sits on, for the badge ring; defaults to surface1. */
  surface?: ColorToken;
  accessibilityHint?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * Icon-only buttons (3.3): a 40 dp visual in a 48 dp touch target (map controls draw all 48).
 * Standard buttons get a borderless ripple of radius 24.
 */
export function IconButton({
  icon,
  accessibilityLabel,
  onPress,
  onLongPress,
  variant = 'standard',
  color,
  selected,
  selectedIcon,
  selectedColor,
  disabled,
  loading,
  badge,
  surface = 'surface1',
  accessibilityHint,
  testID,
  style,
}: IconButtonProps) {
  const t = useTheme();
  const visual = variant === 'map' ? 48 : 40;
  const bg: ColorToken | null =
    variant === 'tonal' ? 'fill' : variant === 'filled' ? 'primary' : variant === 'map' ? 'surface2' : null;
  const iconColor: ColorToken = disabled
    ? 'textDisabled'
    : selected && selectedColor
      ? selectedColor
      : variant === 'filled'
        ? 'onPrimary'
        : (color ?? 'text');

  return (
    <Touchable
      testID={testID}
      onPress={loading ? undefined : onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      ripple="borderless"
      rippleRadius={variant === 'standard' ? 24 : visual / 2}
      overlay={false}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled, busy: !!loading, selected: selected ?? undefined }}
      style={[styles.target, style]}>
      {({ pressed }) => (
        <View
          style={[
            styles.visual,
            { width: visual, height: visual, borderRadius: visual / 2 },
            bg ? { backgroundColor: t.color[bg] } : null,
            Platform.OS === 'ios' && pressed && !disabled
              ? {
                  backgroundColor:
                    variant === 'tonal'
                      ? t.color.fillPressed
                      : variant === 'filled'
                        ? t.color.primaryPressed
                        : variant === 'map'
                          ? t.color.fill
                          : t.color.pressed,
                }
              : null,
            variant === 'map' ? t.elevation(2) : null,
          ]}>
          {loading ? (
            <ActivityIndicator size={20} color={t.color.primary} />
          ) : (
            <Icon name={selected && selectedIcon ? selectedIcon : icon} size={24} color={iconColor} />
          )}
          {badge ? (
            <View style={[styles.badge, { backgroundColor: t.color.danger, borderColor: t.color[bg ?? surface] }]} />
          ) : null}
        </View>
      )}
    </Touchable>
  );
}

const styles = StyleSheet.create({
  target: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  visual: { alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 6, right: 6, width: 12, height: 12, borderRadius: 6, borderWidth: 2 },
});
