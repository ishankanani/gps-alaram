import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import type { StopKind } from '../../lib/stations/text';
import { KIND_COLOR, KIND_ICON } from '../colors';
import { useTheme } from '../theme';
import { Icon } from './Icon';

const PIN_PATH = 'M22 0C9.85 0 0 9.85 0 22c0 15.6 22 34 22 34s22-18.4 22-34C44 9.85 34.15 0 22 0z';

/**
 * StopPin (3.29): a 44 x 56 teardrop in the kind colour with a white edge, holding the kind glyph
 * in a white circle. Use it in a map Marker with anchor "bottom"; it grows from 0.6 to 1 around
 * its tip.
 */
export function StopPin({ kind, animate = true }: { kind: StopKind | 'place'; animate?: boolean }) {
  const t = useTheme();
  const still = !animate || t.reduceMotion;
  const [scale] = useState(() => new Animated.Value(still ? 1 : 0.6));
  const { damping, stiffness, mass } = t.motion.spring.sheet;

  useEffect(() => {
    if (still) return;
    const anim = Animated.spring(scale, { toValue: 1, damping, stiffness, mass, useNativeDriver: true });
    anim.start();
    return () => anim.stop();
  }, [still, scale, damping, stiffness, mass]);

  const color = KIND_COLOR[kind];
  return (
    <Animated.View style={[styles.pin, { transformOrigin: 'bottom', transform: [{ scale }] }]} accessibilityElementsHidden>
      <Svg width={44} height={56} viewBox="-1.25 -1.25 46.5 58.5">
        <Path d={PIN_PATH} fill={color} stroke={t.color.onColor} strokeWidth={2.5} />
        <Circle cx={22} cy={22} r={13} fill={t.color.onColor} />
      </Svg>
      <View style={styles.glyph}>
        <Icon name={KIND_ICON[kind]} size={18} tint={color} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pin: { width: 44, height: 56 },
  glyph: { position: 'absolute', top: 13, left: 13, width: 18, height: 18 },
});
