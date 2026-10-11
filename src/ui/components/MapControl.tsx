import type { StyleProp, ViewStyle } from 'react-native';

import { IconButton } from './IconButton';
import type { IconName } from './Icon';

export type LocateState = 'unknown' | 'located' | 'locating' | 'denied';

const GLYPH: Record<LocateState, IconName> = {
  unknown: 'crosshairs',
  located: 'crosshairs-gps',
  locating: 'crosshairs',
  denied: 'crosshairs-off',
};

type Props = {
  accessibilityLabel: string;
  onPress: () => void;
  /** The locate button's glyph follows the position state; leave out for other controls. */
  state?: LocateState;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * A map control (3.29): a 48 dp surface2 circle with elevation 2. The locate button shows
 * crosshairs, crosshairs-gps once centred, a spinner while locating, crosshairs-off when denied.
 */
export function MapControl({ accessibilityLabel, onPress, state, icon, style, testID }: Props) {
  return (
    <IconButton
      variant="map"
      icon={icon ?? GLYPH[state ?? 'located']}
      color={state === 'located' ? 'primary' : 'text'}
      loading={state === 'locating'}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={style}
      testID={testID}
    />
  );
}
