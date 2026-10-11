import { useEffect, useState, type ReactNode } from 'react';
import { Animated, PixelRatio, Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '../theme';
import { AppText } from './AppText';
import { DotBadge } from './Badge';
import { Icon, type IconName } from './Icon';

export type TabItem = {
  key: string;
  label: string;
  icon: IconName;
  /** The filled glyph shown when active. */
  activeIcon: IconName;
  active: boolean;
  /** A danger dot on the icon (Account: a required setup item or a billing problem). */
  badge?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  testID?: string;
};

type Props = {
  items: TabItem[];
  /** Above the tab items, inside the bar's reported height (the TripBar). */
  top?: ReactNode;
  /** Slides out (map sheet search and stop modes, keyboard open). */
  hidden?: boolean;
  bottomInset: number;
  /** The bar's full height, for content padding and toasts. */
  onHeight?: (height: number) => void;
};

/**
 * TabBar (3.25): 4 equal items with an indicator pill, on surface2 with a top hairline. It positions
 * itself at the bottom (absolute) and reports its height; it hides with translateY over 200 ms.
 */
export function TabBar({ items, top, hidden = false, bottomInset, onHeight }: Props) {
  const t = useTheme();
  const [height, setHeight] = useState(0);
  const [offset] = useState(() => new Animated.Value(0));
  const duration = t.motion.duration.base;

  useEffect(() => {
    const anim = Animated.timing(offset, {
      toValue: hidden ? height + 8 : 0,
      duration,
      easing: t.motion.easing.standard,
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [hidden, height, duration, offset, t.motion.easing.standard]);

  return (
    <Animated.View
      pointerEvents={hidden ? 'none' : 'box-none'}
      importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
      onLayout={(e) => {
        const h = e.nativeEvent.layout.height;
        setHeight(h);
        onHeight?.(h);
      }}
      style={[styles.root, { transform: [{ translateY: offset }] }]}>
      {top ? (
        <View pointerEvents="box-none" style={styles.top}>
          {top}
        </View>
      ) : null}
      <View
        accessibilityRole="tablist"
        style={[
          styles.bar,
          {
            paddingBottom: bottomInset,
            backgroundColor: t.color.surface2,
            borderTopColor: t.color.border,
          },
        ]}>
        {items.map((item) => (
          <TabButton key={item.key} item={item} />
        ))}
      </View>
    </Animated.View>
  );
}

function TabButton({ item }: { item: TabItem }) {
  const t = useTheme();
  const [scale] = useState(() => new Animated.Value(item.active ? 1 : 0));
  const big = PixelRatio.getFontScale() > 1.15;
  const duration = t.motion.duration.headerFade;

  useEffect(() => {
    const anim = Animated.timing(scale, { toValue: item.active ? 1 : 0, duration, useNativeDriver: true });
    anim.start();
    return () => anim.stop();
  }, [item.active, duration, scale]);

  return (
    <Pressable
      testID={item.testID}
      onPress={item.onPress}
      onLongPress={item.onLongPress}
      accessibilityRole="tab"
      accessibilityLabel={item.label}
      accessibilityState={{ selected: item.active }}
      android_ripple={{ color: t.color.ripple, borderless: true, radius: 40 }}
      style={styles.item}>
      <View style={[styles.indicatorBox, { height: big ? 28 : 30 }]}>
        <Animated.View
          style={[
            styles.indicator,
            {
              height: big ? 28 : 30,
              backgroundColor: t.color.primarySoft,
              opacity: scale,
              transform: [{ scale: scale.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }],
            },
          ]}
        />
        <Icon name={item.active ? item.activeIcon : item.icon} size={24} color={item.active ? 'onPrimarySoft' : 'textSecondary'} />
        {item.badge ? <DotBadge style={styles.badge} /> : null}
      </View>
      <AppText
        variant="labelS"
        weight={item.active ? 'semibold' : 'medium'}
        color={item.active ? 'text' : 'textSecondary'}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.85}
        style={styles.label}>
        {item.label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  top: { paddingHorizontal: 12, paddingBottom: 8 },
  bar: { flexDirection: 'row', minHeight: 64, borderTopWidth: StyleSheet.hairlineWidth },
  item: { flex: 1, alignItems: 'center', paddingTop: 8, paddingBottom: 6, minHeight: 64, gap: 4 },
  indicatorBox: { width: 56, alignItems: 'center', justifyContent: 'center' },
  indicator: { position: 'absolute', left: 0, right: 0, borderRadius: 15 },
  badge: { position: 'absolute', top: 0, right: 10 },
  label: { paddingHorizontal: 4, textAlign: 'center' },
});
