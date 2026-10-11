import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';

import { easing } from '../motion';
import { useTheme } from '../theme';
import { motion, skeletonTiming } from '../tokens';

// Every skeleton on screen pulses from one shared value (one native animation, in step).
const pulse = new Animated.Value(1);
let users = 0;
let loop: Animated.CompositeAnimation | null = null;

function acquire() {
  users += 1;
  if (users > 1 || loop) return;
  const half = motion.duration.skeletonPulse / 2;
  loop = Animated.loop(
    Animated.sequence([
      Animated.timing(pulse, { toValue: 0.55, duration: half, easing: easing.inOut, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: half, easing: easing.inOut, useNativeDriver: true }),
    ]),
  );
  loop.start();
}

function release() {
  users = Math.max(0, users - 1);
  if (users > 0 || !loop) return;
  loop.stop();
  loop = null;
  pulse.setValue(1);
}

type Props = {
  width?: DimensionValue;
  /** For text lines: the font size of the text it replaces. */
  height?: number;
  /** line: radius 4; block: radius 8; circle: pill. */
  shape?: 'line' | 'block' | 'circle';
  style?: StyleProp<ViewStyle>;
};

/** A loading placeholder in `fill` (3.21). Static at 0.8 opacity with reduced motion. */
export function Skeleton({ width = '100%', height = 15, shape = 'line', style }: Props) {
  const t = useTheme();
  const animate = !t.reduceMotion;
  useEffect(() => {
    if (!animate) return;
    acquire();
    return release;
  }, [animate]);
  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          width: shape === 'circle' ? height : width,
          height,
          borderRadius: shape === 'circle' ? t.radius.pill : shape === 'block' ? t.radius.sm : t.radius.xs,
          backgroundColor: t.color.fill,
          opacity: animate ? pulse : 0.8,
        },
        style,
      ]}
    />
  );
}

/** A row placeholder: a 40 dp circle and two lines (70 % and 45 %). */
export function SkeletonRow() {
  return (
    <View style={styles.row} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Skeleton shape="circle" height={40} />
      <View style={styles.rowText}>
        <Skeleton width="70%" height={16} />
        <Skeleton width="45%" height={15} />
      </View>
    </View>
  );
}

/** A StatTile placeholder. */
export function SkeletonTile({ style }: { style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return (
    <View style={[styles.tile, { backgroundColor: t.color.surface1, borderRadius: t.radius.lg }, style]}>
      <Skeleton width="60%" height={12} />
      <Skeleton width="45%" height={30} shape="block" />
    </View>
  );
}

/** A 72 dp card placeholder. */
export function SkeletonCard({ style }: { style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return <Skeleton shape="block" height={72} style={[{ borderRadius: t.radius.lg }, style]} />;
}

/**
 * Whether to show a skeleton for a loading state: only after 150 ms of loading, and then for at
 * least 300 ms, so fast loads never flash.
 */
export function useSkeletonDelay(loading: boolean): boolean {
  const [visible, setVisible] = useState(false);
  const [shownAt, setShownAt] = useState(0);
  useEffect(() => {
    if (loading && !visible) {
      const timer = setTimeout(() => {
        setVisible(true);
        setShownAt(Date.now());
      }, skeletonTiming.delay);
      return () => clearTimeout(timer);
    }
    if (!loading && visible) {
      const remaining = Math.max(0, skeletonTiming.minVisible - (Date.now() - shownAt));
      const timer = setTimeout(() => setVisible(false), remaining);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [loading, visible, shownAt]);
  return visible;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 16, paddingVertical: 12, minHeight: 64 },
  rowText: { flex: 1, gap: 8 },
  tile: { padding: 16, gap: 12, minHeight: 96 },
});
