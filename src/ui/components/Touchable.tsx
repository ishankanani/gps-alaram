import type { ReactNode } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
  type PressableStateCallbackType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useTheme } from '../theme';

export type TouchableProps = Omit<PressableProps, 'style' | 'children'> & {
  /** Android ripple: clipped to the view (default), a borderless circle, or none. */
  ripple?: 'bounded' | 'borderless' | 'none';
  rippleRadius?: number;
  rippleColor?: string;
  /** iOS: the background while pressed (primaryPressed and so on). Without it, the pressed overlay is drawn. */
  pressedColor?: string;
  /** iOS: draw the translucent pressed overlay on transparent controls. Defaults to true. */
  overlay?: boolean;
  style?: StyleProp<ViewStyle> | ((state: PressableStateCallbackType) => StyleProp<ViewStyle>);
  children?: ReactNode | ((state: PressableStateCallbackType) => ReactNode);
};

/**
 * The pressed feedback every control shares (3, shared rules): a ripple on Android, and on iOS the
 * pressed colour or a translucent overlay. No scale on press, and no ripple while disabled.
 */
export function Touchable({
  ripple = 'bounded',
  rippleRadius,
  rippleColor,
  pressedColor,
  overlay = true,
  style,
  children,
  disabled,
  ...rest
}: TouchableProps) {
  const t = useTheme();
  const android = Platform.OS === 'android';
  const off = !!disabled || ripple === 'none';
  return (
    <Pressable
      disabled={disabled}
      android_ripple={
        android && !off
          ? {
              color: rippleColor ?? t.color.ripple,
              borderless: ripple === 'borderless',
              radius: rippleRadius,
              foreground: ripple === 'bounded',
            }
          : undefined
      }
      style={(state) => [
        typeof style === 'function' ? style(state) : style,
        !android && state.pressed && pressedColor ? { backgroundColor: pressedColor } : null,
      ]}
      {...rest}>
      {(state) => (
        <>
          {typeof children === 'function' ? children(state) : children}
          {!android && overlay && state.pressed && !pressedColor && !disabled ? (
            <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: t.color.pressed }]} />
          ) : null}
        </>
      )}
    </Pressable>
  );
}
