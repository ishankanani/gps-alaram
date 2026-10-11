// WCAG 2.x contrast maths for the token tests and for anything that has to pick a readable colour.
// Pure: no imports.

export type Rgba = { r: number; g: number; b: number; a: number };

/** Parses #RGB, #RRGGBB, #RRGGBBAA, rgb() and rgba(); 'transparent' is fully transparent black. */
export function parseColor(input: string): Rgba | null {
  const value = input.trim().toLowerCase();
  if (value === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  let m = /^#([0-9a-f]{3})$/.exec(value);
  if (m) {
    const [r, g, b] = m[1].split('').map((c) => parseInt(c + c, 16));
    return { r, g, b, a: 1 };
  }
  m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/.exec(value);
  if (m) {
    const n = parseInt(m[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: m[2] ? parseInt(m[2], 16) / 255 : 1 };
  }
  m = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*(0|1|0?\.\d+|1\.0+))?\s*\)$/.exec(value);
  if (m) {
    const [r, g, b] = [m[1], m[2], m[3]].map(Number);
    if (r > 255 || g > 255 || b > 255) return null;
    return { r, g, b, a: m[4] != null ? Number(m[4]) : 1 };
  }
  return null;
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** Relative luminance of an opaque colour. */
export function luminance({ r, g, b }: Rgba): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** A colour drawn over an opaque background (alpha compositing). */
export function over(top: Rgba, bottom: Rgba): Rgba {
  const a = top.a;
  return {
    r: Math.round(top.r * a + bottom.r * (1 - a)),
    g: Math.round(top.g * a + bottom.g * (1 - a)),
    b: Math.round(top.b * a + bottom.b * (1 - a)),
    a: 1,
  };
}

/**
 * Contrast ratio (1 to 21) of a foreground on a background. A translucent foreground is first
 * composited over the background.
 */
export function contrastRatio(foreground: string, background: string): number {
  const bg = parseColor(background);
  const fg = parseColor(foreground);
  if (!bg || !fg) throw new Error(`Not a colour: ${!bg ? background : foreground}`);
  if (bg.a < 1) throw new Error(`Background must be opaque: ${background}`);
  const top = fg.a < 1 ? over(fg, bg) : fg;
  const [l1, l2] = [luminance(top), luminance(bg)].sort((a, b) => b - a);
  return (l1 + 0.05) / (l2 + 0.05);
}
