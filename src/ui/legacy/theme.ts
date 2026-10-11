import { useTheme as useNewTheme } from '../theme';
import { radius as tokenRadius } from '../tokens';

export { BADGE_COLOR, KIND_COLOR, KIND_ICON } from '../colors';

/**
 * The theme shape of the screens from before 1.0 (Home, Tracking, Done, Setup, Settings, Countries,
 * Pro), mapped onto the 1.0 tokens so they pick up the new colours until their packages rebuild
 * them. New code uses useTheme() from src/ui/theme.
 */
export type Theme = {
  dark: boolean;
  background: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  muted: string;
  primary: string;
  onPrimary: string;
  primarySoft: string;
  accent: string;
  onAccent: string;
  good: string;
  warn: string;
  bad: string;
  shadow: string;
};

export function useTheme(): Theme {
  const { color, dark } = useNewTheme();
  return {
    dark,
    background: color.bg,
    surface: color.surface1,
    surfaceAlt: color.fill,
    border: color.border,
    text: color.text,
    muted: color.textSecondary,
    primary: color.primary,
    onPrimary: color.onPrimary,
    primarySoft: color.primarySoft,
    accent: color.accent,
    onAccent: color.onAccent,
    good: color.success,
    warn: color.warning,
    bad: color.danger,
    shadow: color.shadow,
  };
}

/** The old radius names on the 1.0 scale. */
export const radius = { sm: tokenRadius.sm, md: tokenRadius.md, lg: tokenRadius.lg, xl: tokenRadius.xl, pill: tokenRadius.pill };
