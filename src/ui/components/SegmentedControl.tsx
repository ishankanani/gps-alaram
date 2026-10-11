import { useEffect, useRef, useState } from 'react';
import { Animated, PixelRatio, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useI18n } from '../../i18n';
import { haptics } from '../haptics';
import { useTheme } from '../theme';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

export type SegmentOption<T> = {
  value: T;
  label: string;
  icon?: IconName;
  /** Pro-only: a lock after the label; tapping calls onLockedPress and keeps the selection. */
  locked?: boolean;
  accessibilityLabel?: string;
};

type Props<T> = {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  onLockedPress?: (value: T) => void;
  accessibilityLabel?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

const PADDING = 3;

/**
 * SegmentedControl (3.16): 2 to 4 equal segments on a fill track. The thumb (with a fieldBorder
 * outline for 3:1 contrast) slides on the native driver. Icons drop out above font scale 1.15.
 */
export function SegmentedControl<T extends string | number | boolean | null>({
  options,
  value,
  onChange,
  onLockedPress,
  accessibilityLabel,
  testID,
  style,
}: Props<T>) {
  const t = useTheme();
  const { t: tr } = useI18n();
  const [width, setWidth] = useState(0);
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const [x] = useState(() => new Animated.Value(0));
  const segment = width > 0 ? (width - PADDING * 2) / options.length : 0;
  const showIcons = PixelRatio.getFontScale() <= 1.15;
  const duration = t.motion.duration.base;

  const placed = useRef(false);
  useEffect(() => {
    if (!segment) return;
    if (!placed.current) {
      // The first layout puts the thumb in place without sliding it there.
      placed.current = true;
      x.setValue(index * segment);
      return;
    }
    const anim = Animated.timing(x, { toValue: index * segment, duration, easing: t.motion.easing.standard, useNativeDriver: true });
    anim.start();
    return () => anim.stop();
  }, [index, segment, duration, x, t.motion.easing.standard]);

  return (
    <View
      testID={testID}
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[styles.track, { backgroundColor: t.color.fill, borderRadius: t.radius.md }, style]}>
      {segment ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.thumb,
            {
              width: segment,
              borderRadius: t.radius.md - PADDING,
              backgroundColor: t.color.segmentThumb,
              borderColor: t.color.fieldBorder,
              transform: [{ translateX: x }],
            },
            t.dark ? null : t.elevation(1),
          ]}
        />
      ) : null}
      {options.map((o, i) => {
        const selected = i === index;
        return (
          <Pressable
            key={String(o.value)}
            onPress={() => {
              if (o.locked) {
                onLockedPress?.(o.value);
                return;
              }
              if (!selected) {
                haptics.selection();
                onChange(o.value);
              }
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected, checked: selected }}
            accessibilityLabel={o.accessibilityLabel ?? o.label}
            accessibilityHint={o.locked ? tr('ui.partOfPro') : undefined}
            hitSlop={{ top: PADDING, bottom: PADDING }}
            style={styles.segment}>
            {o.icon && showIcons ? <Icon name={o.icon} size={18} color={selected ? 'text' : 'textSecondary'} /> : null}
            <AppText
              variant="labelM"
              weight={selected ? 'semibold' : 'medium'}
              color={selected ? 'text' : 'textSecondary'}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.85}
              style={styles.label}>
              {o.label}
            </AppText>
            {o.locked ? <Icon name="lock-outline" size={14} color="textTertiary" /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', padding: PADDING, minHeight: 44 },
  thumb: { position: 'absolute', top: PADDING, bottom: PADDING, left: PADDING, borderWidth: 1 },
  segment: {
    flex: 1,
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
  },
  label: { flexShrink: 1 },
});
