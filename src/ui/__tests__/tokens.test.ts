import { describe, expect, it } from 'vitest';

import { BADGE_COLOR, CHART_COLORS, KIND_COLOR, MAP_COLORS } from '../colors';
import { contrastRatio, parseColor } from '../contrast';
import { palettes, radius, space, typeScale, type ColorToken, type Scheme } from '../tokens';

const SCHEMES: Scheme[] = ['light', 'dark'];
const SURFACES: ColorToken[] = ['bg', 'surface1', 'surface2', 'surface3'];
const WHITE = '#FFFFFF';

function ratio(scheme: Scheme, fg: ColorToken, bg: ColorToken) {
  return contrastRatio(palettes[scheme][fg], palettes[scheme][bg]);
}

describe('design tokens', () => {
  it('defines the same colour roles in light and dark, all parseable', () => {
    expect(Object.keys(palettes.dark).sort()).toEqual(Object.keys(palettes.light).sort());
    expect(Object.keys(MAP_COLORS.dark).sort()).toEqual(Object.keys(MAP_COLORS.light).sort());
    expect(Object.keys(CHART_COLORS.dark).sort()).toEqual(Object.keys(CHART_COLORS.light).sort());
    for (const scheme of SCHEMES) {
      for (const [name, value] of Object.entries(palettes[scheme])) {
        expect(parseColor(value), `${scheme}.${name}`).not.toBeNull();
      }
    }
  });

  it('keeps the spacing scale and the six radii', () => {
    expect(Object.values(space).sort((a, b) => a - b)).toEqual([0, 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64]);
    expect(radius).toEqual({ xs: 4, sm: 8, md: 12, lg: 16, xl: 24, pill: 999 });
    expect(typeScale.numXL.size).toBe(44);
    expect(typeScale.bodyM).toMatchObject({ size: 15, lineHeight: 20 });
  });
});

describe('contrast (WCAG AA)', () => {
  it('primary text reads everywhere', () => {
    for (const scheme of SCHEMES) {
      for (const bg of [...SURFACES, 'fill'] as ColorToken[]) {
        expect(ratio(scheme, 'text', bg), `${scheme} text on ${bg}`).toBeGreaterThanOrEqual(12);
        // Placeholders use textSecondary because they sit on fill.
        expect(ratio(scheme, 'textSecondary', bg), `${scheme} textSecondary on ${bg}`).toBeGreaterThanOrEqual(6);
      }
    }
  });

  it('meta text reaches 4.5 on backgrounds and surfaces (never on fill)', () => {
    for (const scheme of SCHEMES) {
      for (const bg of SURFACES) {
        expect(ratio(scheme, 'textTertiary', bg), `${scheme} textTertiary on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('status and accent text reaches 4.5 where it is used', () => {
    for (const scheme of SCHEMES) {
      for (const bg of SURFACES) {
        // Error lines and destructive rows sit on bg too (critique: light danger #C8261A).
        expect(ratio(scheme, 'danger', bg), `${scheme} danger on ${bg}`).toBeGreaterThanOrEqual(4.5);
        expect(ratio(scheme, 'primary', bg), `${scheme} primary on ${bg}`).toBeGreaterThanOrEqual(4.5);
        expect(ratio(scheme, 'accentInk', bg), `${scheme} accentInk on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
      expect(ratio(scheme, 'warning', 'surface1')).toBeGreaterThanOrEqual(4.5);
      expect(ratio(scheme, 'success', 'surface1')).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('labels on filled controls, soft tones and the toast reach 4.5', () => {
    const pairs: [ColorToken, ColorToken][] = [
      ['onPrimary', 'primary'],
      ['onPrimarySoft', 'primarySoft'],
      ['onDanger', 'danger'],
      ['onAccent', 'accent'],
      ['accentInk', 'accentSoft'],
      ['onSuccessSoft', 'successSoft'],
      ['onWarningSoft', 'warningSoft'],
      ['onDangerSoft', 'dangerSoft'],
      ['onInverse', 'inverseSurface'],
      ['inversePrimary', 'inverseSurface'],
      ['onInk', 'inkOnAccent'],
    ];
    for (const scheme of SCHEMES) {
      for (const [fg, bg] of pairs) {
        expect(ratio(scheme, fg, bg), `${scheme} ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('field borders, the off switch track and the segment thumb outline reach 3:1', () => {
    for (const scheme of SCHEMES) {
      for (const bg of [...SURFACES, 'fill'] as ColorToken[]) {
        expect(ratio(scheme, 'fieldBorder', bg), `${scheme} fieldBorder on ${bg}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('the filled favourite star stays visible in light mode', () => {
    expect(ratio('light', 'starOn', 'surface2')).toBeGreaterThanOrEqual(4.5);
    expect(ratio('light', 'accentEdge', 'surface2')).toBeGreaterThanOrEqual(3);
  });

  it('white text and glyphs read on every transport colour', () => {
    for (const [name, color] of Object.entries({ ...KIND_COLOR, ...BADGE_COLOR })) {
      expect(contrastRatio(WHITE, color), name).toBeGreaterThanOrEqual(4.5);
    }
    // An address or pin is a fixed indigo in both schemes, like the transport colours.
    expect(KIND_COLOR.place).toBe('#4146D8');
    expect(MAP_COLORS.dark.puck).toBe('#4146D8');
  });
});
