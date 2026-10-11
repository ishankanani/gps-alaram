import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { dateFromParts, datePartOrder, daysBetween, partsFromDate } from '../dateParts';
import { INTER_FILES, interFace } from '../fonts';
import { settleSnap, sheetGeometry, shouldDismiss, stepSnap } from '../sheetGeometry';
import { initialsOf, textStyle, usesLatinCase } from '../typography';

const ROOT = join(__dirname, '..', '..', '..');

describe('typography', () => {
  it('uses one Inter file per weight on Android and the PostScript name on iOS', () => {
    expect(interFace('semibold', 'android')).toEqual({ fontFamily: 'Inter_600SemiBold' });
    expect(interFace('bold', 'ios')).toEqual({ fontFamily: 'Inter-Bold' });
    expect(interFace('medium', 'web')).toEqual({ fontFamily: 'Inter', fontWeight: '500' });
  });

  it('applies the token, tabular figures for numbers, and the Hindi and Japanese rules', () => {
    expect(textStyle('bodyL', { os: 'android' })).toEqual({ fontFamily: 'Inter_400Regular', fontSize: 16, lineHeight: 22, letterSpacing: -0.2 });
    expect(textStyle('numXL', { os: 'android' }).fontVariant).toEqual(['tabular-nums']);
    expect(textStyle('bodyM', { os: 'android', tabular: true }).fontVariant).toEqual(['tabular-nums']);
    expect(textStyle('titleL', { os: 'android', lang: 'hi' })).toMatchObject({ lineHeight: 40, letterSpacing: 0 });
    expect(textStyle('titleL', { os: 'android', lang: 'ja' })).toMatchObject({ lineHeight: 37, letterSpacing: 0 });
    expect(textStyle('labelM', { os: 'android', weight: 'bold' }).fontFamily).toBe('Inter_700Bold');
  });

  it('writes PlanBadge in capitals only in Latin scripts, and makes initials', () => {
    expect(usesLatinCase('de')).toBe(true);
    expect(usesLatinCase('hi')).toBe(false);
    expect(usesLatinCase('ja')).toBe(false);
    expect(initialsOf('Anna Keller')).toBe('AK');
    expect(initialsOf(null, 'anna.keller@example.com')).toBe('AK');
    expect(initialsOf('', '')).toBe('');
  });

  it('embeds exactly the four Inter files in app.json, which resolve from the project', () => {
    const app = JSON.parse(readFileSync(join(ROOT, 'app.json'), 'utf8')) as {
      expo: { scheme: string; plugins: (string | [string, { android: { fonts: string[] }; ios: { fonts: string[] } }])[] };
    };
    expect(app.expo.scheme).toBe('stopwake');
    const font = app.expo.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-font');
    expect(Array.isArray(font)).toBe(true);
    const options = (font as [string, { android: { fonts: string[] }; ios: { fonts: string[] } }])[1];
    const files = Object.values(INTER_FILES);
    expect(options.android.fonts).toEqual(files);
    expect(options.ios.fonts).toEqual(files);
    const require = createRequire(join(ROOT, 'package.json'));
    for (const file of files) expect(() => require.resolve(file)).not.toThrow();
  });
});

describe('MapSheet geometry', () => {
  // A 411 x 914 dp phone, 24 dp status bar, tab bar 64 + 24 inset.
  const geo = sheetGeometry(914, 24, 88);

  it('measures snaps above the tab bar and reaches the screen bottom', () => {
    expect(geo.available).toBe(802);
    expect(geo.heights).toEqual({ peek: 160, half: 361, expanded: 730 });
    expect(geo.layoutHeight).toBe(818);
    expect(geo.translate).toEqual({ peek: 570, half: 369, expanded: 0 });
    expect(geo.fitMaxHeight).toBe(731);
    // Hiding the tab bar keeps the sheet's layout height: only translateY moves.
    expect(sheetGeometry(914, 24, 0).layoutHeight).toBe(geo.layoutHeight);
  });

  it('settles on the nearest snap, or the next one after a fling', () => {
    expect(settleSnap(geo, 400, 0)).toBe('half');
    expect(settleSnap(geo, 500, 0)).toBe('peek');
    expect(settleSnap(geo, 369, -1)).toBe('expanded');
    expect(settleSnap(geo, 369, 1)).toBe('peek');
    expect(stepSnap('peek', 'up')).toBe('half');
    expect(stepSnap('expanded', 'up')).toBe('expanded');
    expect(shouldDismiss(400, 120, 0)).toBe(true);
    expect(shouldDismiss(400, 80, 0)).toBe(false);
  });
});

describe('DateField parts', () => {
  it('orders the parts by language and accepts only real dates', () => {
    expect(datePartOrder('de')).toEqual(['day', 'month', 'year']);
    expect(datePartOrder('ja')).toEqual(['year', 'month', 'day']);
    expect(dateFromParts('31', '12', '2026')?.getDate()).toBe(31);
    expect(dateFromParts('31', '2', '2026')).toBeNull();
    expect(dateFromParts('1', '1', '26')).toBeNull();
    expect(partsFromDate(new Date(2026, 9, 1))).toEqual({ day: '1', month: '10', year: '2026' });
    expect(daysBetween(new Date(2026, 9, 10), new Date(2026, 11, 31))).toBe(82);
  });
});
