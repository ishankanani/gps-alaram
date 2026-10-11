import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '../theme';

type Props = {
  /** 0 to 1; leave out for an indeterminate bar. */
  progress?: number;
  /** complete: success colour; failed: danger. */
  status?: 'active' | 'complete' | 'failed';
  /** The trip bar: 6 dp tall with an amber dot at 100 % marking the wake point. */
  variant?: 'default' | 'trip';
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * ProgressBar (3.22). The indicator scales on the native driver (scaleX from the left), and the
 * indeterminate one slides a 32 % segment across. Reduced motion: no animation.
 */
export function ProgressBar({ progress, status = 'active', variant = 'default', accessibilityLabel, style }: Props) {
  const t = useTheme();
  const [width, setWidth] = useState(0);
  const determinate = progress != null;
  const value = Math.max(0, Math.min(1, progress ?? 0));
  const [scale] = useState(() => new Animated.Value(value));
  const [slide] = useState(() => new Animated.Value(0));
  const height = variant === 'trip' ? 6 : 4;
  const fill = status === 'complete' ? t.color.success : status === 'failed' ? t.color.danger : t.color.primary;
  const duration = t.motion.duration.progress;
  const indeterminateDuration = t.motion.duration.indeterminate;

  useEffect(() => {
    if (!determinate) return;
    const anim = Animated.timing(scale, { toValue: value, duration, easing: t.motion.easing.standard, useNativeDriver: true });
    anim.start();
    return () => anim.stop();
  }, [determinate, value, duration, scale, t.motion.easing.standard]);

  useEffect(() => {
    if (determinate || !indeterminateDuration) return;
    slide.setValue(0);
    const loop = Animated.loop(Animated.timing(slide, { toValue: 1, duration: indeterminateDuration, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [determinate, indeterminateDuration, slide]);

  const segment = width * 0.32;
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={determinate ? { min: 0, max: 100, now: Math.round(value * 100) } : undefined}
      style={[styles.wrap, variant === 'trip' ? styles.tripWrap : null, style]}>
      <View
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={[styles.track, { height, borderRadius: t.radius.pill, backgroundColor: t.color.fill }]}>
        {determinate ? (
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: fill, borderRadius: t.radius.pill, transformOrigin: 'left', transform: [{ scaleX: scale }] },
            ]}
          />
        ) : width > 0 ? (
          <Animated.View
            style={[
              styles.segment,
              {
                width: segment,
                backgroundColor: fill,
                borderRadius: t.radius.pill,
                transform: [{ translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [-segment, width] }) }],
              },
            ]}
          />
        ) : null}
      </View>
      {variant === 'trip' ? (
        <View
          style={[
            styles.wakeDot,
            {
              backgroundColor: t.color.accent,
              borderColor: t.color.surface2,
              // In light mode amber needs an edge to be seen on white.
              outlineColor: t.dark ? undefined : t.color.accentEdge,
              outlineWidth: t.dark ? undefined : 1.5,
              outlineStyle: t.dark ? undefined : 'solid',
            },
          ]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { justifyContent: 'center' },
  tripWrap: { paddingRight: 7, minHeight: 14 },
  track: { overflow: 'hidden', alignSelf: 'stretch' },
  segment: { position: 'absolute', top: 0, bottom: 0, left: 0 },
  wakeDot: { position: 'absolute', right: 0, width: 14, height: 14, borderRadius: 7, borderWidth: 2 },
});
