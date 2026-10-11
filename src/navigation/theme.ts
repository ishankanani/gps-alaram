import { DarkTheme, DefaultTheme, type Theme as NavigationTheme } from '@react-navigation/native';
import { Platform } from 'react-native';

import { interFace, WEIGHT_VALUE, type FontWeightName } from '../ui/fonts';
import type { Theme } from '../ui/theme';

function font(weight: FontWeightName) {
  const face = interFace(weight, Platform.OS);
  return { fontFamily: face.fontFamily, fontWeight: WEIGHT_VALUE[weight] };
}

/**
 * The navigation theme from the tokens (4.1): background bg, card surface2, text, border,
 * primary and notification danger, with Inter as the font. Native screens use bg behind them, so
 * transitions never flash white.
 */
export function navigationTheme(theme: Theme): NavigationTheme {
  const base = theme.dark ? DarkTheme : DefaultTheme;
  return {
    ...base,
    dark: theme.dark,
    colors: {
      primary: theme.color.primary,
      background: theme.color.bg,
      card: theme.color.surface2,
      text: theme.color.text,
      border: theme.color.border,
      notification: theme.color.danger,
    },
    fonts: {
      regular: font('regular'),
      medium: font('medium'),
      bold: font('semibold'),
      heavy: font('bold'),
    },
  };
}
