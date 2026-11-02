import { interFace, WEIGHT_NAME, type FontFace, type FontWeightName } from './fonts';
import { NUMERIC_VARIANTS, SCRIPT_LINE_HEIGHT, typeScale, type TypeVariant } from './tokens';

// Text styles from the type scale, with the per-script rules applied in one place (2.2): Hindi
// gets 1.25x line height, Japanese, Korean and Chinese 1.15x, Arabic 1.2x, all with zero letter spacing (they fall back to the
// system Noto fonts). Pure, so it is tested; AppText and TextField turn it into RN styles.

export type TextStyleSpec = FontFace & {
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
  fontVariant?: ['tabular-nums'];
};

export type TextStyleOptions = {
  weight?: FontWeightName;
  /** App language: adjusts line height and tracking for Hindi, Japanese, Korean, Chinese and Arabic. */
  lang?: string;
  /** Platform.OS. */
  os: string;
  /** Tabular figures; defaults to true for the num* variants. */
  tabular?: boolean;
};

export function textStyle(variant: TypeVariant, { weight, lang, os, tabular }: TextStyleOptions): TextStyleSpec {
  const token = typeScale[variant];
  const factor = (lang && SCRIPT_LINE_HEIGHT[lang]) || 1;
  const face = interFace(weight ?? WEIGHT_NAME[token.weight], os);
  const style: TextStyleSpec = {
    ...face,
    fontSize: token.size,
    lineHeight: Math.round(token.lineHeight * factor),
    letterSpacing: factor === 1 ? token.tracking : 0,
  };
  if (tabular ?? NUMERIC_VARIANTS.includes(variant)) style.fontVariant = ['tabular-nums'];
  return style;
}

/**
 * Whether a language is written with capitals that a plain uppercase transform gets right:
 * PlanBadge is uppercase only there. Not Turkish (the transform turns "i" into "I", not "İ").
 */
export function usesLatinCase(lang: string | undefined): boolean {
  return lang !== 'hi' && lang !== 'ja' && lang !== 'ko' && lang !== 'zh' && lang !== 'ar' && lang !== 'tr';
}

/** Up to two initials from a display name, or from the local part of an email address. */
export function initialsOf(name: string | null | undefined, email?: string | null): string {
  const source = name?.trim() || email?.split('@')[0]?.trim() || '';
  // "Anna Keller" and "anna.keller" give "AK"; a single word gives one letter.
  const words = source.split(/[\s._\-+]+/u).filter(Boolean);
  if (words.length === 0) return '';
  const picked = words.length > 1 ? [words[0], words[words.length - 1]] : [words[0]];
  return picked
    .map((w) => Array.from(w)[0] ?? '')
    .join('')
    .toLocaleUpperCase();
}
