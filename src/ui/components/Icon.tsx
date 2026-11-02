// The direct path bundles only this icon font instead of all 19 (about 3 MB less).
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ComponentProps } from 'react';
import { I18nManager, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '../theme';
import type { ColorToken } from '../tokens';

export type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

/** Glyphs that point along the reading direction: they are mirrored in right-to-left layouts. */
const DIRECTIONAL: ReadonlySet<string> = new Set([
  'arrow-left',
  'arrow-right',
  'chevron-left',
  'chevron-right',
  'login',
  'logout',
  'send',
  'account-arrow-right-outline',
]);

type Props = {
  name: IconName;
  /** 16, 20, 24 (default), 32 or 48. */
  size?: number;
  /** Colour token; defaults to text. */
  color?: ColorToken;
  /** A colour that is not a theme token, such as a transport colour from colors.ts. */
  tint?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * A MaterialCommunityIcons glyph in a fixed square, so a glyph that appears after the icon font
 * loads never shifts the layout. Decorative: the control around it carries the label. Arrows and
 * chevrons mirror in right-to-left layouts (Arabic).
 */
export function Icon({ name, size = 24, color = 'text', tint, style }: Props) {
  const t = useTheme();
  return (
    <View
      style={[
        { width: size, height: size, alignItems: 'center', justifyContent: 'center' },
        I18nManager.isRTL && DIRECTIONAL.has(name) ? { transform: [{ scaleX: -1 }] } : null,
        style,
      ]}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden>
      <MaterialCommunityIcons name={name} size={size} color={tint ?? t.color[color]} />
    </View>
  );
}
