import { Platform, StyleSheet, Text, type TextProps } from 'react-native';

import { useI18n } from '../../i18n';
import type { FontWeightName } from '../fonts';
import { useTheme } from '../theme';
import { HEADER_VARIANTS, NUMERIC_VARIANTS, typeScale, type ColorToken, type TypeVariant } from '../tokens';
import { textStyle } from '../typography';

export type AppTextProps = TextProps & {
  /** Type token; defaults to bodyM. */
  variant?: TypeVariant;
  /** Colour token; defaults to text. */
  color?: ColorToken;
  weight?: FontWeightName;
  align?: 'auto' | 'left' | 'right' | 'center' | 'justify';
  /** Tabular figures; on by default for num* variants. */
  tabular?: boolean;
  /** numXL and numL may shrink to fit (never truncate). */
  shrink?: boolean;
};

/**
 * All text in the app: Inter at a type-scale token, includeFontPadding off, a per-token font-scale
 * cap, and the Hindi and Japanese line-height rules. display and title* are screen-reader headers.
 */
export function AppText({
  variant = 'bodyM',
  color = 'text',
  weight,
  align,
  tabular,
  shrink,
  style,
  accessibilityRole,
  maxFontSizeMultiplier,
  ...rest
}: AppTextProps) {
  const t = useTheme();
  const { lang } = useI18n();
  const spec = textStyle(variant, { weight, lang, os: Platform.OS, tabular });
  const numeric = NUMERIC_VARIANTS.includes(variant);
  const canShrink = shrink ?? (variant === 'numXL' || variant === 'numL');
  return (
    <Text
      accessibilityRole={accessibilityRole ?? (HEADER_VARIANTS.includes(variant) ? 'header' : undefined)}
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? typeScale[variant].maxFontSizeMultiplier}
      adjustsFontSizeToFit={numeric && canShrink ? true : undefined}
      minimumFontScale={numeric && canShrink ? 0.8 : undefined}
      numberOfLines={numeric && canShrink && rest.numberOfLines == null ? 1 : undefined}
      style={[spec, styles.base, { color: t.color[color] }, align ? { textAlign: align } : null, style]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  base: { includeFontPadding: false },
});
