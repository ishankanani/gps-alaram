// Frames raw app screenshots for Google Play: a caption on the brand gradient above the screen in
// a phone outline, 1080 x 1920 (9:16) PNG without alpha.
//
// Usage: node store/tools/compose-screenshots.mjs <raw dir> [out dir = store/screenshots]
// Raw files are named <lang>-<nn>-<screen>.png (e2e/screenshots.sh writes them, e.g. en-03-stop.png).
// Writes <out>/<lang>/<nn>-<screen>.png for every language in CAPTIONS; a language without its own
// raw shot of a screen falls back to the English one (with a warning).
// Needs Playwright with Chromium (store/tools/playwright.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadChromium } from './playwright.mjs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const [rawArg, outArg] = process.argv.slice(2);
if (!rawArg) {
  console.error('Usage: node store/tools/compose-screenshots.mjs <raw dir> [out dir]');
  process.exit(2);
}
const rawDir = path.resolve(rawArg);
const outDir = path.resolve(outArg ?? path.join(root, 'store/screenshots'));

/** The screens for the listing, in order (Play shows up to 8 phone screenshots). */
const SHOTS = ['03-stop', '04-trip', '05-alarm', '01-map', '06-arrived', '07-saved', '08-activity', '10-settings'];

const CAPTIONS = {
  en: {
    '03-stop': ['Pick your stop', 'Wake 2 minutes or 300 m before you arrive'],
    '04-trip': ['Lock your phone and relax', 'StopWake follows your ride by GPS'],
    '05-alarm': ['Rings even on silent', 'A real alarm, right on time'],
    '01-map': ['Every stop, offline', 'Bus, tram, metro and train in 17 countries'],
    '06-arrived': ['You made it', 'See how far you rode and when it rang'],
    '07-saved': ['Your stops, one tap away', 'Favourites and recent stops'],
    '08-activity': ['Every trip at a glance', 'Your ride history stays on your phone'],
    '10-settings': ['Made for heavy sleepers', 'Alarm strength, sound, units and 11 languages'],
  },
  de: {
    '03-stop': ['Wähle deine Haltestelle', 'Weckt dich 2 Minuten oder 300 m vor dem Ziel'],
    '04-trip': ['Handy sperren, entspannen', 'StopWake verfolgt deine Fahrt per GPS'],
    '05-alarm': ['Klingelt auch im Lautlos-Modus', 'Ein echter Wecker, genau zur richtigen Zeit'],
    '01-map': ['Alle Haltestellen, offline', 'Bus, Tram, U-Bahn und Zug in 17 Ländern'],
    '06-arrived': ['Angekommen', 'Strecke, Fahrzeit und wann es geklingelt hat'],
    '07-saved': ['Deine Haltestellen, ein Tipp entfernt', 'Favoriten und zuletzt genutzte Haltestellen'],
    '08-activity': ['Alle Fahrten im Blick', 'Dein Fahrtverlauf bleibt auf deinem Handy'],
    '10-settings': ['Für Tiefschläfer gemacht', 'Alarmstärke, Ton, Einheiten und 11 Sprachen'],
  },
};

const font = (w, f) =>
  `@font-face{font-family:Inter;font-weight:${w};src:url(${pathToFileURL(path.join(root, 'node_modules/@expo-google-fonts/inter', f))})}`;
const FONTS = font(500, '500Medium/Inter_500Medium.ttf') + font(700, '700Bold/Inter_700Bold.ttf');

const escape = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function html(title, subtitle, image) {
  return `<!doctype html><html><head><style>${FONTS}
  html,body{margin:0;width:1080px;height:1920px;overflow:hidden}
  body{background:linear-gradient(160deg,#5459EA 0%,#4146D8 45%,#2B2FA3 100%);font-family:Inter,sans-serif;position:relative}
  .text{position:absolute;left:80px;right:80px;top:120px;text-align:center}
  h1{margin:0;color:#fff;font-weight:700;font-size:76px;line-height:1.1;letter-spacing:-1.5px}
  p{margin:28px 0 0;color:#FFC56B;font-weight:500;font-size:40px;line-height:1.3}
  .phone{position:absolute;left:50%;top:440px;transform:translateX(-50%);width:756px;height:1344px;padding:22px;
    border-radius:84px;background:#0E1726;box-shadow:0 40px 90px rgba(10,12,50,.45),0 0 0 3px rgba(255,255,255,.18)}
  .phone img{display:block;width:756px;height:1344px;border-radius:62px;object-fit:cover;object-position:top}
  </style></head><body>
  <div class="text"><h1>${escape(title)}</h1><p>${escape(subtitle)}</p></div>
  <div class="phone"><img src="data:image/png;base64,${fs.readFileSync(image).toString('base64')}"></div>
  </body></html>`;
}

const raws = fs.existsSync(rawDir) ? fs.readdirSync(rawDir) : [];
const find = (lang, shot) => raws.find((f) => f.startsWith(`${lang}-${shot}`) && f.endsWith('.png'));

const chromium = await loadChromium();
const browser = await chromium.launch();
let written = 0;
try {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  for (const [lang, captions] of Object.entries(CAPTIONS)) {
    for (const shot of SHOTS) {
      let file = find(lang, shot);
      if (!file && lang !== 'en') {
        file = find('en', shot);
        if (file) console.warn(`${lang}/${shot}: no ${lang} screenshot, using the English one`);
      }
      if (!file) {
        console.warn(`${lang}/${shot}: no screenshot, skipped`);
        continue;
      }
      const [title, subtitle] = captions[shot];
      await page.setContent(html(title, subtitle, path.join(rawDir, file)), { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      const out = path.join(outDir, lang, `${shot}.png`);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      await page.screenshot({ path: out, type: 'png', omitBackground: false });
      written++;
      console.log(path.relative(process.cwd(), out));
    }
  }
} finally {
  await browser.close();
}
if (!written) {
  console.error(`No screenshots found in ${rawDir} (expected files like en-03-stop.png).`);
  process.exit(1);
}
