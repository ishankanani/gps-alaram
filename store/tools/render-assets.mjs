// Renders the SVG sources in store/src to the store graphics and the launcher icons:
//   store/graphics/icon-512.png               Play icon (32-bit PNG)
//   store/graphics/feature-graphic-1024x500.png, feature-graphic-de-1024x500.png
//   store/graphics/variants/*.png             the logo variants and a comparison sheet (48 px too)
//   assets/icon.png                           1024 app icon; also the iOS icon, so no alpha
//   assets/android-icon-{background,foreground,monochrome}.png, assets/splash-icon.png, favicon
// Usage: node store/tools/render-assets.mjs   (needs Playwright with Chromium, see playwright.mjs)
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { loadChromium } from './playwright.mjs';
import { coverageDots, millions, stats } from './coverage-svg.mjs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const src = (f) => path.join(root, 'store/src', f);
const glyph = fs.readFileSync(src('glyph.svg.part'), 'utf8');
const font = (w, f) =>
  `@font-face{font-family:Inter;font-weight:${w};src:url(${pathToFileURL(path.join(root, 'node_modules/@expo-google-fonts/inter', f))})}`;
const fonts = font(500, '500Medium/Inter_500Medium.ttf') + font(600, '600SemiBold/Inter_600SemiBold.ttf') + font(700, '700Bold/Inter_700Bold.ttf');

// The feature graphic: Europe's coverage dots, Munich ringing, and the texts per language.
const europe = coverageDots({ box: [-11, 35.5, 31, 62], x: 380, y: -70, width: 660, grid: 11 });
const [pinX, pinY] = europe.project(48.14, 11.56);
const FEATURE_TEXT = {
  en: {
    tagline: 'Never miss your stop.',
    line1: `${millions(stats.stops, 'en')} stops · ${stats.countries} countries · offline`,
    line2: 'GPS alarm for bus, tram, metro and train',
  },
  de: {
    tagline: 'Nie mehr verschlafen.',
    line1: `${millions(stats.stops, 'de')} Haltestellen · ${stats.countries} Länder · offline`,
    line2: 'GPS-Wecker für Bus, Tram, U-Bahn und Zug',
  },
};
function feature(lang) {
  const t = FEATURE_TEXT[lang];
  return (svg) =>
    svg
      .replace('@COVERAGE@', europe.svg)
      .replaceAll('@PIN_X@', pinX.toFixed(1))
      .replaceAll('@PIN_Y@', pinY.toFixed(1))
      .replace('@TAGLINE@', t.tagline)
      .replace('@LINE1@', t.line1)
      .replace('@LINE2@', t.line2);
}

// [svg source, output, width, height, transparent background, transform]
const jobs = [
  ['icon.svg', 'store/graphics/icon-512.png', 512, 512, false],
  ['feature-graphic.svg', 'store/graphics/feature-graphic-1024x500.png', 1024, 500, false, feature('en')],
  ['feature-graphic.svg', 'store/graphics/feature-graphic-de-1024x500.png', 1024, 500, false, feature('de')],
  ['icon.svg', 'assets/icon.png', 1024, 1024, false],
  ['adaptive-background.svg', 'assets/android-icon-background.png', 512, 512, false],
  ['adaptive-foreground.svg', 'assets/android-icon-foreground.png', 512, 512, true],
  ['adaptive-monochrome.svg', 'assets/android-icon-monochrome.png', 432, 432, true],
  ['splash-icon.svg', 'assets/splash-icon.png', 1024, 1024, true],
  ['icon.svg', 'assets/favicon.png', 48, 48, false],
  // The logo variants (B, the folded map, is the default: icon.svg with glyph.svg.part).
  ['variants/icon-a-city-map.svg', 'store/graphics/variants/icon-a-city-map.png', 512, 512, false],
  ['icon.svg', 'store/graphics/variants/icon-b-folded-map.png', 512, 512, false],
  ['variants/icon-c-round-map.svg', 'store/graphics/variants/icon-c-round-map.png', 512, 512, false],
];

/** The variants side by side: big, as launcher shapes, and at 96, 72 and 48 px on a home screen. */
function comparison(variants) {
  const img = (file) => `data:image/png;base64,${fs.readFileSync(path.join(root, file)).toString('base64')}`;
  const rows = variants
    .map(
      ([label, file, chosen]) => `<div class="row${chosen ? ' chosen' : ''}">
        <div class="label">${label}${chosen ? '<b>default</b>' : ''}</div>
        <img class="big" src="${img(file)}">
        <img class="squircle" src="${img(file)}">
        <img class="circle" src="${img(file)}">
        <div class="home light"><img style="width:96px" src="${img(file)}"><img style="width:72px" src="${img(file)}"><img style="width:48px" src="${img(file)}"></div>
        <div class="home dark"><img style="width:96px" src="${img(file)}"><img style="width:72px" src="${img(file)}"><img style="width:48px" src="${img(file)}"></div>
      </div>`,
    )
    .join('');
  return `<!doctype html><html><head><style>${fonts}
    body{margin:0;padding:40px;background:#F4F6F9;font-family:Inter;width:1520px}
    h1{margin:0 0 24px;font-size:32px;color:#0E1726}
    .row{display:flex;align-items:center;gap:28px;padding:20px;border-radius:24px;margin-bottom:16px;background:#fff}
    .row.chosen{outline:4px solid #FFB020}
    .label{width:150px;font-size:20px;font-weight:600;color:#0E1726}
    .label b{display:block;margin-top:8px;color:#8A5300;font-size:16px}
    .big{width:240px;border-radius:54px}
    .squircle{width:160px;border-radius:36%}
    .circle{width:160px;border-radius:50%}
    .home{display:flex;align-items:center;gap:18px;padding:18px;border-radius:18px}
    .home img{border-radius:50%}
    .home.light{background:linear-gradient(135deg,#d9e7f7,#f6e7da)}
    .home.dark{background:linear-gradient(135deg,#1b2433,#0b0f16)}
  </style></head><body><h1>StopWake icon variants (512, launcher masks, 96 / 72 / 48 px)</h1>${rows}</body></html>`;
}

const chromium = await loadChromium();
const browser = await chromium.launch();
try {
  for (const [file, out, w, h, transparent, transform] of jobs) {
    let svg = fs.readFileSync(src(file), 'utf8').replaceAll('@GLYPH@', glyph);
    if (transform) svg = transform(svg);
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

  const page = await browser.newPage({ viewport: { width: 1600, height: 400 }, deviceScaleFactor: 1 });
  await page.setContent(
    comparison([
      ['A · city map', 'store/graphics/variants/icon-a-city-map.png'],
      ['B · folded map', 'store/graphics/variants/icon-b-folded-map.png', true],
      ['C · round map', 'store/graphics/variants/icon-c-round-map.png'],
    ]),
  );
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(root, 'store/graphics/variants/compare.png'), fullPage: true });
  await page.close();
  console.log('store/graphics/variants/compare.png');
} finally {
  await browser.close();
}

// Play asks for a 32-bit PNG icon; the App Store refuses an icon with an alpha channel.
try {
  const icon = path.join(root, 'store/graphics/icon-512.png');
  execFileSync('convert', [icon, '-alpha', 'on', `PNG32:${icon}`]);
  for (const file of ['assets/icon.png', 'store/graphics/feature-graphic-1024x500.png', 'store/graphics/feature-graphic-de-1024x500.png']) {
    const out = path.join(root, file);
    execFileSync('convert', [out, '-background', '#4146D8', '-alpha', 'remove', '-alpha', 'off', `PNG24:${out}`]);
  }
} catch {
  console.warn('ImageMagick not found: icon-512.png stays as rendered and assets/icon.png may keep an alpha channel (strip it before an iOS build).');
}
