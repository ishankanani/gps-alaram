/**
 * Design tokens of StopWake 1.0 (docs/design/ui-direction-a.md section 2, with the fixes from
 * docs/design/ui-critiques.md). Pure TypeScript with no react-native import, so Vitest checks
 * completeness and contrast. Hex literals live only here and in colors.ts.
 */

export type Scheme = 'light' | 'dark';

/** Colour roles, identical keys in both schemes. */
export type ColorTokens = {
  /** Screen background behind grouped lists. */
  bg: string;
  /** Sections, cards, stat tiles. */
  surface1: string;
  /** MapSheet, TabBar, scrolled TopBar, map controls, destination card. */
  surface2: string;
  /** Dialogs and modal sheets. */
  surface3: string;
  /** Inputs, segmented track, unselected choice chips, skeletons, icon circles. */
  fill: string;
  fillPressed: string;
  segmentThumb: string;
  inverseSurface: string;
  onInverse: string;
  inversePrimary: string;
  scrim: string;
  text: string;
  /** Subtitles, values, placeholders, inactive tabs. */
  textSecondary: string;
  /** Meta, timestamps, footnotes, chevrons (never on fill). */
  textTertiary: string;
  textDisabled: string;
  /** Text and icons on transport colours and KindIcons. */
  onColor: string;
  border: string;
  borderStrong: string;
  /** Resting TextField border, switch track when off, segment thumb outline (3:1 non-text contrast). */
  fieldBorder: string;
  focus: string;
  primary: string;
  primaryPressed: string;
  onPrimary: string;
  primarySoft: string;
  primarySoftPressed: string;
  onPrimarySoft: string;
  /** Amber: ringing, Pro badge, wake zone. */
  accent: string;
  onAccent: string;
  accentSoft: string;
  accentInk: string;
  success: string;
  successSoft: string;
  onSuccessSoft: string;
  warning: string;
  warningSoft: string;
  onWarningSoft: string;
  danger: string;
  dangerPressed: string;
  onDanger: string;
  dangerSoft: string;
  onDangerSoft: string;
  ripple: string;
  pressed: string;
  shadow: string;
  /** 1 px border on elevated items over the map (dark mode only). */
  overlayBorder: string;
  /** A filled favourite star: amber in dark, accentInk in light (amber alone is 1.8:1 on white). */
  starOn: string;
  /** The ring around the wake-point dot and the Pro avatar ring in light mode (amber needs an edge). */
  accentEdge: string;
  /** The dark button on amber surfaces (AlarmCard, ringing TripBar), the same in both schemes. */
  inkOnAccent: string;
  onInk: string;
  /** Android Switch thumb. */
  switchThumb: string;
};

export type ColorToken = keyof ColorTokens;

export const palettes: Record<Scheme, ColorTokens> = {
  light: {
    bg: '#F4F6F9',
    surface1: '#FFFFFF',
    surface2: '#FFFFFF',
    surface3: '#FFFFFF',
    fill: '#EDF0F4',
    fillPressed: '#E2E6EC',
    segmentThumb: '#FFFFFF',
    inverseSurface: '#1B2433',
    onInverse: '#F1F4F8',
    inversePrimary: '#A9AEFF',
    scrim: 'rgba(11,15,22,0.48)',
    text: '#0E1726',
    textSecondary: '#4D5B70',
    textTertiary: '#646F82',
    textDisabled: '#A3ADBB',
    onColor: '#FFFFFF',
    border: '#E3E7ED',
    borderStrong: '#C5CCD6',
    fieldBorder: '#7A8597',
    focus: '#4146D8',
    primary: '#4146D8',
    primaryPressed: '#3539C2',
    onPrimary: '#FFFFFF',
    primarySoft: '#E9EAFE',
    primarySoftPressed: '#DCDEFD',
    onPrimarySoft: '#2F33B8',
    accent: '#FFB020',
    onAccent: '#2A1B00',
    accentSoft: '#FFF3D6',
    accentInk: '#8A5300',
    success: '#16803C',
    successSoft: '#E7F5EC',
    onSuccessSoft: '#0F5F2C',
    warning: '#C2410C',
    warningSoft: '#FFEFE5',
    onWarningSoft: '#8F2F08',
    danger: '#C8261A',
    dangerPressed: '#AE2117',
    onDanger: '#FFFFFF',
    dangerSoft: '#FDECEA',
    onDangerSoft: '#A3231A',
    ripple: 'rgba(14,23,38,0.12)',
    pressed: 'rgba(14,23,38,0.06)',
    shadow: '#0E1726',
    overlayBorder: 'transparent',
    starOn: '#8A5300',
    accentEdge: '#8A5300',
    inkOnAccent: '#0E1726',
    onInk: '#FFFFFF',
    switchThumb: '#FFFFFF',
  },
  dark: {
    bg: '#0B0F16',
    surface1: '#131924',
    surface2: '#1A2130',
    surface3: '#222A3A',
    fill: '#222A39',
    fillPressed: '#2B3445',
    segmentThumb: '#313B4D',
    inverseSurface: '#E6EAF0',
    onInverse: '#121826',
    inversePrimary: '#4146D8',
    scrim: 'rgba(0,0,0,0.60)',
    text: '#EDF1F7',
    textSecondary: '#A8B3C3',
    textTertiary: '#8C97A9',
    textDisabled: '#566274',
    onColor: '#FFFFFF',
    border: '#283141',
    borderStrong: '#3A4558',
    fieldBorder: '#6B778A',
    focus: '#8E94FF',
    primary: '#8E94FF',
    primaryPressed: '#7C83F5',
    onPrimary: '#0B0F16',
    primarySoft: '#262C5C',
    primarySoftPressed: '#30376E',
    onPrimarySoft: '#C9CCFF',
    accent: '#FFB547',
    onAccent: '#2A1B00',
    accentSoft: '#3A2C0C',
    accentInk: '#FFC56B',
    success: '#5BD38A',
    successSoft: '#12301F',
    onSuccessSoft: '#8FE5B0',
    warning: '#FF9A57',
    warningSoft: '#3D2112',
    onWarningSoft: '#FFC9A3',
    danger: '#FF6B5E',
    dangerPressed: '#F2584B',
    onDanger: '#0B0F16',
    dangerSoft: '#3B1614',
    onDangerSoft: '#FFB4AB',
    ripple: 'rgba(237,241,247,0.16)',
    pressed: 'rgba(237,241,247,0.08)',
    shadow: '#000000',
    overlayBorder: 'rgba(255,255,255,0.08)',
    starOn: '#FFB547',
    accentEdge: '#FFB547',
    inkOnAccent: '#0E1726',
    onInk: '#FFFFFF',
    switchThumb: '#FFFFFF',
  },
};

// ---- Typography ----

export type TypeVariant =
  | 'display'
  | 'titleL'
  | 'titleM'
  | 'titleS'
  | 'bodyL'
  | 'bodyM'
  | 'bodyS'
  | 'labelL'
  | 'labelM'
  | 'labelS'
  | 'numXL'
  | 'numL'
  | 'numM';

export type FontWeightValue = 400 | 500 | 600 | 700;

export type TypeToken = {
  size: number;
  lineHeight: number;
  weight: FontWeightValue;
  /** Letter spacing in dp (Inter's dynamic metrics). */
  tracking: number;
  maxFontSizeMultiplier: number;
};

/** Inter type scale (2.2). */
export const typeScale: Record<TypeVariant, TypeToken> = {
  display: { size: 32, lineHeight: 38, weight: 700, tracking: -0.7, maxFontSizeMultiplier: 1.5 },
  titleL: { size: 26, lineHeight: 32, weight: 700, tracking: -0.5, maxFontSizeMultiplier: 1.6 },
  titleM: { size: 20, lineHeight: 26, weight: 600, tracking: -0.3, maxFontSizeMultiplier: 1.8 },
  titleS: { size: 17, lineHeight: 22, weight: 600, tracking: -0.2, maxFontSizeMultiplier: 2.0 },
  bodyL: { size: 16, lineHeight: 22, weight: 400, tracking: -0.2, maxFontSizeMultiplier: 2.0 },
  bodyM: { size: 15, lineHeight: 20, weight: 400, tracking: -0.1, maxFontSizeMultiplier: 2.0 },
  bodyS: { size: 13, lineHeight: 18, weight: 400, tracking: 0, maxFontSizeMultiplier: 2.0 },
  labelL: { size: 16, lineHeight: 20, weight: 600, tracking: -0.2, maxFontSizeMultiplier: 1.6 },
  labelM: { size: 14, lineHeight: 18, weight: 600, tracking: -0.1, maxFontSizeMultiplier: 1.4 },
  labelS: { size: 12, lineHeight: 16, weight: 600, tracking: 0, maxFontSizeMultiplier: 1.3 },
  numXL: { size: 44, lineHeight: 48, weight: 700, tracking: -1.0, maxFontSizeMultiplier: 1.2 },
  numL: { size: 30, lineHeight: 36, weight: 700, tracking: -0.6, maxFontSizeMultiplier: 1.3 },
  numM: { size: 20, lineHeight: 24, weight: 600, tracking: -0.3, maxFontSizeMultiplier: 1.4 },
};

/** Variants that always use tabular figures. */
export const NUMERIC_VARIANTS: readonly TypeVariant[] = ['numXL', 'numL', 'numM'];
/** Variants read by screen readers as headers. */
export const HEADER_VARIANTS: readonly TypeVariant[] = ['display', 'titleL', 'titleM', 'titleS'];

/** Scripts that need more room: line height factor, and letter spacing forced to 0. */
export const SCRIPT_LINE_HEIGHT: Readonly<Record<string, number>> = { hi: 1.25, ja: 1.15 };

// ---- Spacing, radius, layout ----

/** 4-point scale with Tailwind-style keys; no other spacing values are allowed in screens. */
export const space = {
  0: 0,
  0.5: 2,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

export type SpaceKey = keyof typeof space;

export const radius = {
  /** ModeBadge rectangles, progress track, skeleton text lines. */
  xs: 4,
  /** Button S, ID chip, inner segment shapes, skeleton blocks. */
  sm: 8,
  /** Buttons L and M, TextField, SearchField, Banner, Toast, rule pill. */
  md: 12,
  /** Cards, Sections, PlanCards, StatTiles, TripBar, destination card. */
  lg: 16,
  /** MapSheet top corners, Dialog, modal sheets, onboarding panels. */
  xl: 24,
  /** Chips, Badges, PlanBadge, avatars, map controls, tab indicator. */
  pill: 999,
} as const;

export type RadiusKey = keyof typeof radius;

export const layout = {
  gutter: 16,
  sectionGap: 24,
  cardPadding: 16,
  rowPaddingVertical: 12,
  rowPaddingHorizontal: 16,
  gapLeading: 16,
  gapTrailing: 12,
  gapIcon: 8,
  topBarHeight: 56,
  tabBarHeight: 64,
  tripBarHeight: 56,
  /** Space between the TripBar and the tab items. */
  tripBarGap: 8,
  tripBarMargin: 12,
  sheetGrabberZone: 24,
  sheetPeek: 160,
  /** expanded = available - this. */
  sheetExpandedGap: 72,
  sheetHalfRatio: 0.45,
  sheetStopMaxRatio: 0.8,
  buttonL: 56,
  buttonM: 48,
  buttonS: 36,
  textField: 52,
  textFieldMultiline: 104,
  searchField: 48,
  searchFieldInline: 44,
  chip: 36,
  segmented: 44,
  iconButton: 40,
  /** Minimum touch target. */
  hitTarget: 48,
  mapControl: 48,
  contentMaxWidth: 600,
  dialogMaxWidth: 400,
  emptyStateMaxWidth: 320,
} as const;

export const iconSize = { xs: 16, sm: 20, md: 24, lg: 32, xl: 48 } as const;

/** ModeBadge sizes (3.12). */
export const modeBadgeSize = {
  sm: { height: 16, paddingHorizontal: 4, fontSize: 10, lineHeight: 12, radius: 3 },
  md: { height: 18, paddingHorizontal: 5, fontSize: 12, lineHeight: 16, radius: 4 },
  lg: { height: 22, paddingHorizontal: 6, fontSize: 14, lineHeight: 18, radius: 5 },
} as const;

// ---- Elevation ----

export type ElevationLevel = 0 | 1 | 2 | 3;

export type ElevationToken = {
  android: number;
  ios: { opacity: number; radius: number; offsetY: number } | null;
  /** What dark mode adds, where Android shadows barely show. */
  dark: 'none' | 'border' | 'topHairline';
};

export const elevation: Record<ElevationLevel, ElevationToken> = {
  0: { android: 0, ios: null, dark: 'none' },
  1: { android: 2, ios: { opacity: 0.08, radius: 4, offsetY: 1 }, dark: 'border' },
  2: { android: 6, ios: { opacity: 0.14, radius: 10, offsetY: 3 }, dark: 'border' },
  3: { android: 16, ios: { opacity: 0.18, radius: 24, offsetY: 8 }, dark: 'topHairline' },
};

// ---- Motion ----

export const motion = {
  duration: {
    /** Pressed states, toggles, colour changes. */
    fast: 120,
    /** Fades, segment thumb, chip selection, toast in, tab bar hide and show. */
    base: 200,
    /** Sheet mode changes, banner slide-in, onboarding page change. */
    slow: 280,
    /** Things leaving. */
    exit: 150,
    /** Map flyTo. */
    camera: 600,
    /** Trip camera refit. */
    cameraRefit: 800,
    /** TopBar background and compact header fade. */
    headerFade: 150,
    progress: 300,
    indeterminate: 1200,
    skeletonPulse: 1100,
  },
  /** Cubic bezier control points. */
  easing: {
    standard: [0.2, 0, 0, 1],
    enter: [0, 0, 0, 1],
    exit: [0.3, 0, 1, 1],
    inOut: [0.42, 0, 0.58, 1],
  },
  spring: {
    sheet: { damping: 26, stiffness: 300, mass: 1 },
  },
} as const;

export type DurationName = keyof typeof motion.duration;
export type EasingName = keyof typeof motion.easing;

/** Toast timing (3.19), before the accessibility recommendation stretches it. */
export const toastTiming = { plain: 4000, withAction: 6000, errorWithRetry: 10000 } as const;

/** Show a skeleton only after this much loading, and keep it at least this long (3.21). */
export const skeletonTiming = { delay: 150, minVisible: 300 } as const;
