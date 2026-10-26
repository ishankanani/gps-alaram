// Renders the SVG sources in store/src to the Play Store graphics and the launcher icons.
// Usage: node store/tools/render-assets.mjs   (needs Playwright with Chromium, see playwright.mjs)
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { loadChromium } from './playwright.mjs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const src = (f) => path.join(root, 'store/src', f);
const glyph = fs.readFileSync(src('glyph.svg.part'), 'utf8');
const font = (w, f) =>
  `@font-face{font-family:Inter;font-weight:${w};src:url(${pathToFileURL(path.join(root, 'node_modules/@expo-google-fonts/inter', f))})}`;
const fonts = font(500, '500Medium/Inter_500Medium.ttf') + font(600, '600SemiBold/Inter_600SemiBold.ttf') + font(700, '700Bold/Inter_700Bold.ttf');

// [svg source, output, width, height, transparent background]
const jobs = [
  ['icon.svg', 'store/graphics/icon-512.png', 512, 512, false],
  ['feature-graphic.svg', 'store/graphics/feature-graphic-1024x500.png', 1024, 500, false],
  ['icon.svg', 'assets/icon.png', 1024, 1024, false],
  ['adaptive-background.svg', 'assets/android-icon-background.png', 512, 512, false],
  ['adaptive-foreground.svg', 'assets/android-icon-foreground.png', 512, 512, true],
  ['adaptive-monochrome.svg', 'assets/android-icon-monochrome.png', 432, 432, true],
  ['icon.svg', 'assets/splash-icon.png', 1024, 1024, false],
  ['icon.svg', 'assets/favicon.png', 48, 48, false],
];

const chromium = await loadChromium();
const browser = await chromium.launch();
try {
  for (const [file, out, w, h, transparent] of jobs) {
    const svg = fs.readFileSync(src(file), 'utf8').replaceAll('@GLYPH@', glyph);
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    await page.setContent(
      `<!doctype html><html><head><style>${fonts}html,body{margin:0;background:transparent}svg{display:block;width:${w}px;height:${h}px}</style></head><body>${svg}</body></html>`,
    );
    await page.evaluate(() => document.fonts.ready);
    fs.mkdirSync(path.dirname(path.join(root, out)), { recursive: true });
    await page.screenshot({ path: path.join(root, out), omitBackground: transparent });
    await page.close();
    console.log(`${out} (${w}x${h})`);
  }
} finally {
  await browser.close();
}

// Play asks for a 32-bit PNG icon: add an (all opaque) alpha channel when ImageMagick is there.
try {
  const icon = path.join(root, 'store/graphics/icon-512.png');
  execFileSync('convert', [icon, '-alpha', 'on', `PNG32:${icon}`]);
} catch {
  console.warn('ImageMagick not found: store/graphics/icon-512.png stays 24-bit (Play accepts it too).');
}
