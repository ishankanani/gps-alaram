import type { FontWeightValue } from './tokens';

// Inter, embedded at build time by the expo-font config plugin in app.json (no runtime loading).
// The four upright weights come from @expo-google-fonts/inter (Inter 4, family name "Inter"); the
// package is never imported from JS, which would bundle all 18 files.
//
// On Android each embedded file is its own font family named after the file (assets/fonts/
// Inter_600SemiBold.ttf → "Inter_600SemiBold"), so every weight renders on every API level
// (an XML family only applies 500 and 600 from Android 9). On iOS the files are registered in
// Info.plist and addressed by their PostScript names. Pure: no react-native import.

export type FontWeightName = 'regular' | 'medium' | 'semibold' | 'bold';

/**
 * The files in app.json → expo-font (android.fonts and ios.fonts), as module paths the plugin
 * resolves from the project root. A test keeps app.json in step with this list.
 */
export const INTER_FILES: Record<FontWeightName, string> = {
  regular: '@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf',
  medium: '@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf',
  semibold: '@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf',
  bold: '@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf',
};

/** Android font family names: the file names without extension. */
export const INTER_ANDROID: Record<FontWeightName, string> = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
};

/** iOS PostScript names, as stored in the files' name tables. */
export const INTER_IOS: Record<FontWeightName, string> = {
  regular: 'Inter-Regular',
  medium: 'Inter-Medium',
  semibold: 'Inter-SemiBold',
  bold: 'Inter-Bold',
};

export const WEIGHT_NAME: Record<FontWeightValue, FontWeightName> = {
  400: 'regular',
  500: 'medium',
  600: 'semibold',
  700: 'bold',
};

export const WEIGHT_VALUE: Record<FontWeightName, '400' | '500' | '600' | '700'> = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
};

export type FontFace = {
  fontFamily: string;
  fontWeight?: '400' | '500' | '600' | '700';
};

/**
 * The font family (and weight, where the platform picks the file by weight) for a weight.
 * Android and iOS name one file per weight, so no fontWeight is set there: a weight on top of a
 * single-weight family could make Android synthesise a fake bold.
 */
export function interFace(weight: FontWeightName, os: string): FontFace {
  if (os === 'android') return { fontFamily: INTER_ANDROID[weight] };
  if (os === 'ios') return { fontFamily: INTER_IOS[weight] };
  return { fontFamily: 'Inter', fontWeight: WEIGHT_VALUE[weight] };
}
