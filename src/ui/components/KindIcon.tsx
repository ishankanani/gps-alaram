import { View, type StyleProp, type ViewStyle } from 'react-native';

import type { StopKind } from '../../lib/stations/text';
import { KIND_COLOR, KIND_ICON } from '../colors';
import { useTheme } from '../theme';
import { Icon } from './Icon';

type Props = {
  kind: StopKind | 'place';
  /** 24, 32, 40 (default), 48 or 64. */
  size?: number;
  /** Over the map: a 2 dp ring in surface2. */
  onMap?: boolean;
  /** A ring in another colour, e.g. white on the TripBar. */
  ringColor?: string;
  style?: StyleProp<ViewStyle>;
};

/** A circle in the transport colour with a white glyph at 0.55 of its size (3.13). Decorative. */
export function KindIcon({ kind, size = 40, onMap, ringColor, style }: Props) {
  const t = useTheme();
  const ring = ringColor ?? (onMap ? t.color.surface2 : undefined);
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: KIND_COLOR[kind],
          alignItems: 'center',
          justifyContent: 'center',
        },
        ring ? { borderWidth: 2, borderColor: ring } : null,
        style,
      ]}>
      <Icon name={KIND_ICON[kind]} size={Math.round(size * 0.55)} color="onColor" />
    </View>
  );
}
