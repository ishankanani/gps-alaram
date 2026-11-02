// Frames raw app screenshots for Google Play and the App Store: a caption on the brand gradient
// above the screen in a phone outline, PNG without alpha, plus the coverage infographic drawn from
// the real stop numbers (store/src/coverage-stats.json and the app's coverage dots).
//
// Usage: node store/tools/compose-screenshots.mjs <raw dir> [out dir = store/screenshots]
//          [--langs en,de] [--targets play,ios-6.9,ios-6.5] [--variant a|b] [--no-fallback]
//
// Raw files are named <lang>-<nn>-<screen>.png (e2e/screenshots.sh writes them, e.g. en-03-stop.png).
// Captions and the store order are in store/listing/screenshots.json. Writes
// <out>/<target>/<lang>/<nn>-<id>.png (variant b: <out>/b/<target>/<lang>/...):
//   play     1080 x 1920  Google Play phone (9:16); upload 01 to 08
//   ios-6.9  1320 x 2868  App Store iPhone 6.9"; upload 01 to 10
//   ios-6.5  1284 x 2778  App Store iPhone 6.5"; upload 01 to 10
// A language without its own raw shot of a screen falls back to the English one (with a warning)
// unless --no-fallback. The iOS frames replace the Android status bar with an iOS one; once the
// iOS app runs, take real iPhone screenshots instead.
// Needs Playwright with Chromium (store/tools/playwright.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadChromium } from './playwright.mjs';
import { count, coverageDots, millions, stats } from './coverage-svg.mjs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  if (i < 0) return null;
  const [value] = args.splice(i, 2).slice(1);
  return value;
};
const langsArg = flag('--langs');
const targetsArg = flag('--targets');
const variant = flag('--variant') ?? 'a';
const fallback = !args.includes('--no-fallback');
const [rawArg, outArg] = args.filter((a) => !a.startsWith('--'));
if (!rawArg || !['a', 'b'].includes(variant)) {
  console.error('Usage: node store/tools/compose-screenshots.mjs <raw dir> [out dir] [--langs en,de] [--targets play,ios-6.9,ios-6.5] [--variant a|b] [--no-fallback]');
  process.exit(2);
}
const rawDir = path.resolve(rawArg);
const outRoot = path.resolve(outArg ?? path.join(root, 'store/screenshots'));
const outDir = variant === 'a' ? outRoot : path.join(outRoot, variant);

const { order: ORDER, captions: CAPTIONS } = JSON.parse(fs.readFileSync(path.join(root, 'store/listing/screenshots.json'), 'utf8'));

const TARGETS = {
  play: { width: 1080, height: 1920, ios: false },
  'ios-6.9': { width: 1320, height: 2868, ios: true },
  'ios-6.5': { width: 1284, height: 2778, ios: true },
};
const langs = langsArg ? langsArg.split(',') : Object.keys(CAPTIONS);
const targets = targetsArg ? targetsArg.split(',') : Object.keys(TARGETS);
for (const t of targets) if (!TARGETS[t]) throw new Error(`Unknown target ${t}`);

/** e2e/screenshots.sh runs the emulator at density 420: the status bar is 24 dp = 63 px. */
const ANDROID_STATUS_BAR_PX = 63;

const font = (w, f) =>
  `@font-face{font-family:Inter;font-weight:${w};src:url(${pathToFileURL(path.join(root, 'node_modules/@expo-google-fonts/inter', f))})}`;
const FONTS = font(500, '500Medium/Inter_500Medium.ttf') + font(600, '600SemiBold/Inter_600SemiBold.ttf') + font(700, '700Bold/Inter_700Bold.ttf');

const escape = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** The page around a body (bodyHeight null: its own height): the caption is centred above it. */
function page({ width, height }, title, subtitle, body, bodyHeight) {
  const u = width / 1080;
  return `<!doctype html><html><head><style>${FONTS}
  html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden}
  body{background:linear-gradient(160deg,#5459EA 0%,#4146D8 45%,#2B2FA3 100%);font-family:Inter,sans-serif;
    display:flex;flex-direction:column;align-items:center}
  .text{flex:1;display:flex;flex-direction:column;justify-content:center;padding:0 ${70 * u}px;text-align:center;min-height:${300 * u}px}
  h1{margin:0;color:#fff;font-weight:700;font-size:${74 * u}px;line-height:1.1;letter-spacing:${-1.5 * u}px;text-wrap:balance}
  p{margin:${26 * u}px 0 0;color:#FFC56B;font-weight:500;font-size:${40 * u}px;line-height:1.3;text-wrap:balance}
  .body{${bodyHeight == null ? '' : `height:${bodyHeight}px;`}margin-bottom:${height * 0.045}px;flex:none}
  </style></head><body>
  <div class="text"><h1>${escape(title)}</h1><p>${escape(subtitle)}</p></div>
  <div class="body">${body}</div>
  </body></html>`;
}

/** The raw screenshot in a phone outline; on iOS targets with an iOS status bar painted over it. */
function phone(target, image) {
  const { width, ios } = target;
  const u = width / 1080;
  // The screen keeps the raw 9:16 shape; the phone takes 70 % (Play) or 76 % (iPhone) of the width.
  const screenW = Math.round(width * (ios ? 0.76 : 0.7));
  const screenH = Math.round((screenW * 1920) / 1080);
  const pad = Math.round(22 * u);
  const radius = Math.round(62 * u);
  const html = `<div style="position:relative;width:${screenW}px;height:${screenH}px;padding:${pad}px;border-radius:${radius + pad}px;
      background:#0E1726;box-shadow:0 ${40 * u}px ${90 * u}px rgba(10,12,50,.45),0 0 0 ${3 * u}px rgba(255,255,255,.18)">
    <canvas id="screen" width="1080" height="1920" style="display:block;width:${screenW}px;height:${screenH}px;border-radius:${radius}px"></canvas>
    ${ios ? `<div style="position:absolute;left:50%;top:${pad + 14 * u}px;transform:translateX(-50%);width:${150 * u}px;height:${42 * u}px;border-radius:${21 * u}px;background:#05070B"></div>` : ''}
  </div>
  <img id="raw" src="data:image/png;base64,${fs.readFileSync(image).toString('base64')}" style="display:none">`;
  return { html, height: screenH + 2 * pad };
}

/** Draws the raw screenshot into the canvas; for iOS, swaps the Android status bar for an iOS one. */
async function paintScreen(pageHandle, ios) {
  await pageHandle.evaluate(
    async ({ ios, bar }) => {
      const img = document.getElementById('raw');
      if (!img) return;
      await img.decode();
      const canvas = document.getElementById('screen');
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, 1080, 1920);
      if (!ios) return;
      // The bar's background: the most common colour of its rows (icons and text are a minority).
      const data = ctx.getImageData(0, 0, 1080, bar).data;
      const counts = new Map();
      for (let i = 0; i < data.length; i += 16) {
        const key = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
      const [r, g, b] = [((top >> 10) & 31) * 8 + 4, ((top >> 5) & 31) * 8 + 4, (top & 31) * 8 + 4];
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(0, 0, 1080, bar);
      const ink = 0.299 * r + 0.587 * g + 0.114 * b > 140 ? '#000000' : '#FFFFFF';
      ctx.fillStyle = ink;
      ctx.strokeStyle = ink;
      ctx.font = '600 40px Inter';
      ctx.textBaseline = 'middle';
      ctx.fillText('9:41', 92, bar / 2 + 4);
      // Signal bars, Wi-Fi and battery on the right.
      const y = bar / 2 + 4;
      for (let i = 0; i < 4; i++) ctx.fillRect(808 + i * 13, y + 10 - (i + 1) * 6, 9, (i + 1) * 6);
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      for (const [rad, a] of [[26, 0.8], [17, 0.8]]) {
        ctx.beginPath();
        ctx.arc(890, y + 14, rad, Math.PI * (1.5 - a / 2), Math.PI * (1.5 + a / 2));
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(890, y + 14, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      ctx.roundRect(930, y - 13, 56, 27, 8);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.roundRect(934, y - 9, 48, 19, 5);
      ctx.fill();
      ctx.fillRect(990, y - 4, 4, 9);
    },
    { ios, bar: ANDROID_STATUS_BAR_PX },
  );
}

// ---- The coverage infographic ----

const COUNTRY = {
  en: { de: 'Germany', gb: 'United Kingdom', fr: 'France', jp: 'Japan', us: 'United States', au: 'Australia', ca: 'Canada', fi: 'Finland', no: 'Norway', at: 'Austria', se: 'Sweden', be: 'Belgium', nl: 'Netherlands', ch: 'Switzerland', dk: 'Denmark', ie: 'Ireland', lu: 'Luxembourg' },
  de: { de: 'Deutschland', gb: 'Großbritannien', fr: 'Frankreich', jp: 'Japan', us: 'USA', au: 'Australien', ca: 'Kanada', fi: 'Finnland', no: 'Norwegen', at: 'Österreich', se: 'Schweden', be: 'Belgien', nl: 'Niederlande', ch: 'Schweiz', dk: 'Dänemark', ie: 'Irland', lu: 'Luxemburg' },
};
const LABELS = {
  en: { countries: 'countries', stops: 'stops', offline: 'offline', offlineBody: 'no signal needed', note: 'Germany built in, every other country one download', bus: 'Bus', tram: 'Tram', metro: 'Metro', train: 'Train', ferry: 'Ferry' },
  de: { countries: 'Länder', stops: 'Haltestellen', offline: 'offline', offlineBody: 'ohne Netz', note: 'Deutschland eingebaut, jedes andere Land ein Download', bus: 'Bus', tram: 'Tram', metro: 'U-Bahn', train: 'Zug', ferry: 'Fähre' },
};

/** "1.3M", "41K" (en) or "1,3 Mio.", "41.387" (de): short, never rounded up. */
function compact(n, lang) {
  if (n >= 1e6) return millions(n, lang);
  if (n >= 1e4 && lang !== 'de') return `${Math.floor(n / 1000)}K`;
  return count(n, lang);
}

function infographic(target, lang) {
  const { width, ios } = target;
  const u = width / 1080;
  const cardW = Math.round(width * (ios ? 0.9 : 0.84));
  const l = LABELS[lang];
  const mapW = cardW - 2 * 40 * u;
  const europe = coverageDots({ box: [-11, 41.5, 32, 66], width: mapW * 0.62, grid: 11, color: '#4146D8', opacity: [0.35, 0.5, 0.7, 0.9], radius: [1.2 * u, 1.6 * u, 2.1 * u, 2.7 * u] });
  const inset = (box, grid, w) => coverageDots({ box, width: w, grid, color: '#4146D8', opacity: [0.35, 0.5, 0.7, 0.9], radius: [1.1 * u, 1.4 * u, 1.8 * u, 2.3 * u] });
  const america = inset([-128, 24, -60, 55], 10, mapW * 0.36);
  const japan = inset([129, 30, 146, 45.5], 11, mapW * 0.17);
  const australia = inset([113, -44, 154, -10], 9, mapW * 0.17);
  const svg = (d, w) => `<svg width="${w}" height="${d.height}" viewBox="0 0 ${w} ${d.height}">${d.svg}</svg>`;
  const kinds = ['bus', 'train', 'tram', 'ferry', 'metro']
    .map((k) => `<span class="chip"><b>${escape(l[k])}</b> ${escape(compact(stats.servedBy[k], lang))}</span>`)
    .join('');
  const rows = stats.byCountry
    .map(
      (c) =>
        `<div class="row"><span class="flag">${c.flag}</span><span class="name">${escape(COUNTRY[lang][c.country] ?? c.country.toUpperCase())}</span><span class="n">${escape(count(c.stops, lang))}</span></div>`,
    )
    .join('');
  const html = `<style>
    .card{width:${cardW}px;box-sizing:border-box;padding:${40 * u}px;border-radius:${56 * u}px;background:#fff;color:#0E1726;
      box-shadow:0 ${40 * u}px ${90 * u}px rgba(10,12,50,.45)}
    .maps{display:flex;gap:${12 * u}px;align-items:flex-start;justify-content:space-between}
    .side{display:flex;flex-direction:column;gap:${16 * u}px;align-items:flex-end}
    .pair{display:flex;gap:${12 * u}px}
    .big{display:flex;justify-content:space-between;margin:${26 * u}px 0 ${18 * u}px;padding:${22 * u}px 0;border-top:${2 * u}px solid #E3E7ED;border-bottom:${2 * u}px solid #E3E7ED}
    .big div{text-align:center;flex:1}
    .big b{display:block;font-size:${64 * u}px;font-weight:700;letter-spacing:${-1.5 * u}px;color:#4146D8;line-height:1.05}
    .big span{font-size:${27 * u}px;font-weight:600;color:#4D5B70}
    .chips{display:flex;flex-wrap:wrap;gap:${10 * u}px;margin-bottom:${22 * u}px}
    .chip{font-size:${25 * u}px;padding:${8 * u}px ${16 * u}px;border-radius:${30 * u}px;background:#E9EAFE;color:#2F33B8;font-weight:500}
    .chip b{font-weight:700}
    .list{columns:2;column-gap:${28 * u}px}
    .row{display:flex;align-items:center;gap:${10 * u}px;font-size:${24 * u}px;line-height:1.25;padding:${5 * u}px 0;break-inside:avoid}
    .flag{font-size:${28 * u}px}
    .name{flex:1;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .note{margin-top:${14 * u}px;font-size:${21 * u}px;color:#8A5300;font-weight:500}
    .n{color:#4D5B70;font-variant-numeric:tabular-nums;font-weight:500}
  </style>
  <div class="card">
    <div class="maps">${svg(europe, mapW * 0.62)}<div class="side">${svg(america, mapW * 0.36)}<div class="pair">${svg(japan, mapW * 0.17)}${svg(australia, mapW * 0.17)}</div></div></div>
    <div class="big">
      <div><b>${stats.countries}</b><span>${escape(l.countries)}</span></div>
      <div><b>${escape(millions(stats.stops, lang))}+</b><span>${escape(l.stops)}</span></div>
      <div><b>${escape(l.offline)}</b><span>${escape(l.offlineBody)}</span></div>
    </div>
    <div class="chips">${kinds}</div>
    <div class="list">${rows}</div>
    <div class="note">${escape(l.note)}</div>
  </div>`;
  return { html };
}

// ---- Main ----

const raws = fs.existsSync(rawDir) ? fs.readdirSync(rawDir) : [];
const find = (lang, raw) => raws.find((f) => f.startsWith(`${lang}-${raw}`) && f.endsWith('.png'));

const chromium = await loadChromium();
const browser = await chromium.launch();
let written = 0;
try {
  for (const targetName of targets) {
    const target = TARGETS[targetName];
    const tab = await browser.newPage({ viewport: { width: target.width, height: target.height }, deviceScaleFactor: 1 });
    for (const lang of langs) {
      const captions = CAPTIONS[lang];
      if (!captions) throw new Error(`No captions for ${lang} in store/listing/screenshots.json`);
      for (const [index, shot] of ORDER.entries()) {
        const [title, subtitle] = captions[shot.id]?.[variant] ?? captions[shot.id]?.a ?? [];
        if (!title) throw new Error(`${lang}/${shot.id}: no caption`);
        let html;
        if (shot.raw) {
          let file = find(lang, shot.raw);
          if (!file && lang !== 'en' && fallback) {
            file = find('en', shot.raw);
            if (file) console.warn(`${targetName}/${lang}/${shot.id}: no ${lang} screenshot, using the English one`);
          }
          if (!file) {
            console.warn(`${targetName}/${lang}/${shot.id}: no screenshot (${lang}-${shot.raw}.png), skipped`);
            continue;
          }
          const p = phone(target, path.join(rawDir, file));
          html = page(target, title, subtitle, p.html, p.height);
        } else {
          const info = infographic(target, lang);
          html = page(target, title, subtitle, info.html, null);
        }
        await tab.setContent(html, { waitUntil: 'load' });
        await tab.evaluate(() => document.fonts.ready);
        if (shot.raw) await paintScreen(tab, target.ios);
        // Numbered by the store order, also when a shot is missing, so 01 to 08 is always the Play set.
        const out = path.join(outDir, targetName, lang, `${String(index + 1).padStart(2, '0')}-${shot.id}.png`);
        fs.mkdirSync(path.dirname(out), { recursive: true });
        await tab.screenshot({ path: out, type: 'png', omitBackground: false });
        written++;
        console.log(path.relative(process.cwd(), out));
      }
    }
    await tab.close();
  }
} finally {
  await browser.close();
}
if (!written) {
  console.error(`No screenshots written from ${rawDir} (expected files like en-03-stop.png).`);
  process.exit(1);
}
