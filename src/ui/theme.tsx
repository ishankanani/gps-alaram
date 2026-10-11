import * as SystemUI from 'expo-system-ui';
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, type ReactNode } from 'react';
import { Appearance, Platform, StyleSheet, useColorScheme, type ViewStyle } from 'react-native';

import { CHART_COLORS, MAP_COLORS, type ChartPalette, type MapPalette } from './colors';
import { durations, easing, useReducedMotion, type Durations } from './motion';
import {
  elevation as elevationTokens,
  iconSize,
  layout,
  motion as motionTokens,
  palettes,
  radius,
  space,
  typeScale,
  type ColorTokens,
  type ElevationLevel,
  type Scheme,
} from './tokens';

/** The user's choice in Settings › Appearance. */
export type AppearancePreference = 'system' | 'light' | 'dark';

export type ElevationOptions = {
  /** MapSheet: the shadow falls upward. */
  upward?: boolean;
};

export type Theme = {
  scheme: Scheme;
  dark: boolean;
  color: ColorTokens;
  map: MapPalette;
  chart: ChartPalette;
  type: typeof typeScale;
  space: typeof space;
  radius: typeof radius;
  layout: typeof layout;
  icon: typeof iconSize;
  /** Android elevation or iOS shadow props, plus the dark-mode border. Needs an opaque background. */
  elevation: (level: ElevationLevel, options?: ElevationOptions) => ViewStyle;
  motion: {
    /** Every duration is 0 with reduced motion. */
    duration: Durations;
    easing: typeof easing;
    spring: typeof motionTokens.spring;
  };
  reduceMotion: boolean;
};

function makeElevation(scheme: Scheme, color: ColorTokens) {
  return (level: ElevationLevel, options: ElevationOptions = {}): ViewStyle => {
    const token = elevationTokens[level];
    if (level === 0) return {};
    const style: ViewStyle = {};
    if (Platform.OS === 'android') {
      style.elevation = token.android;
    } else if (token.ios) {
      style.shadowColor = color.shadow;
      style.shadowOpacity = token.ios.opacity;
      style.shadowRadius = token.ios.radius;
      style.shadowOffset = { width: 0, height: options.upward ? -4 : token.ios.offsetY };
    }
    if (scheme === 'dark') {
      if (token.dark === 'border') {
        style.borderWidth = 1;
        style.borderColor = color.overlayBorder;
      } else if (token.dark === 'topHairline') {
        style.borderTopWidth = StyleSheet.hairlineWidth;
        style.borderTopColor = color.border;
      }
    }
    return style;
  };
}

function buildTheme(scheme: Scheme, reduceMotion: boolean): Theme {
  const color = palettes[scheme];
  return {
    scheme,
    dark: scheme === 'dark',
    color,
    map: MAP_COLORS[scheme],
    chart: CHART_COLORS[scheme],
    type: typeScale,
    space,
    radius,
    layout,
    icon: iconSize,
    elevation: makeElevation(scheme, color),
    motion: { duration: durations(reduceMotion), easing, spring: motionTokens.spring },
    reduceMotion,
  };
}

const ThemeContext = createContext<Theme>(buildTheme('light', false));

let appliedAppearance: AppearancePreference = 'system';

/**
 * Applies the in-app appearance to the native side too (status bar, keyboard, switches, sheets).
 * Call it once before the first render with the saved preference; ThemeProvider repeats it on
 * every change.
 */
export function applyAppearance(preference: AppearancePreference) {
  if (preference === appliedAppearance) return;
  appliedAppearance = preference;
  try {
    Appearance.setColorScheme(preference === 'system' ? 'unspecified' : preference);
  } catch {
    // Older Android: the app still follows its own theme.
  }
}

/**
 * The colour scheme follows the phone, unless Settings › Appearance overrides it. On every change
 * the root view background follows, so screen transitions never flash white.
 */
export function ThemeProvider({ appearance = 'system', children }: { appearance?: AppearancePreference; children: ReactNode }) {
  useLayoutEffect(() => {
    applyAppearance(appearance);
  }, [appearance]);
  const system = useColorScheme();
  const scheme: Scheme = appearance === 'system' ? (system === 'dark' ? 'dark' : 'light') : appearance;
  const reduceMotion = useReducedMotion();
  const theme = useMemo(() => buildTheme(scheme, reduceMotion), [scheme, reduceMotion]);

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(theme.color.bg).catch(() => {});
  }, [theme.color.bg]);

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
