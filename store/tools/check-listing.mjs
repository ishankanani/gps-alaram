// Checks the store texts against Google Play's and the App Store's limits:
// - store/listing/<lang>.md: every "## Name (max N)" section must be non-empty and at most N
//   characters. The first four are Play's title, short description, full description and release
//   notes; English and German also carry the App Store name, subtitle, promotional text and
//   keywords (comma separated, no spaces after commas).
// - store/listing/screenshots.json: every screenshot of the store order has captions a and b in
//   every language, headline at most 30 characters, subline at most 70.
// Usage: node store/tools/check-listing.mjs
import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../listing');
const PLAY_SECTIONS = 4;
/** Title, short description, full description, release notes. */
const PLAY_LIMITS = [30, 80, 4000, 500];
const HEADLINE_MAX = 30;
const SUBLINE_MAX = 70;
const length = (s) => [...s].length;
let failed = false;

for (const file of fs.readdirSync(dir).filter((f) => /^[a-z]{2}\.md$/.test(f)).sort()) {
  const text = fs.readFileSync(path.join(dir, file), 'utf8');
  const sections = [...text.matchAll(/^## (.*)$\n([\s\S]*?)(?=^## |(?![\s\S]))/gm)].map((m) => ({ heading: m[1], body: m[2].trim() }));
  const report = [];
  if (sections.length < PLAY_SECTIONS) {
    failed = true;
    report.push(`only ${sections.length} sections ✗`);
  }
  for (const [i, { heading, body }] of sections.entries()) {
    // The limit from the heading ("(max 80)", "(maks. 80)", "(最大 80 文字)"), else Play's by position.
    const max = Number(/\(\D*(\d+)\D*\)\s*$/.exec(heading)?.[1]) || PLAY_LIMITS[i];
    const name = heading.replace(/\s*\([^)]*\)\s*$/, '');
    const n = length(body);
    let ok = n > 0 && (!max || n <= max);
    if (/keyword|schlüsselw/i.test(name) && /,\s/.test(body)) ok = false;
    if (!ok) failed = true;
    report.push(`${name} ${n}${max ? `/${max}` : ''}${ok ? '' : ' ✗'}`);
  }
  console.log(`${file.padEnd(6)} ${report.join(' · ')}`);
}

const { order, captions } = JSON.parse(fs.readFileSync(path.join(dir, 'screenshots.json'), 'utf8'));
for (const [lang, set] of Object.entries(captions)) {
  const problems = [];
  for (const { id } of order) {
    for (const v of ['a', 'b']) {
      const [headline, subline] = set[id]?.[v] ?? [];
      if (!headline || !subline) problems.push(`${id}.${v} missing`);
      else {
        if (length(headline) > HEADLINE_MAX) problems.push(`${id}.${v} headline ${length(headline)}/${HEADLINE_MAX}: "${headline}"`);
        if (length(subline) > SUBLINE_MAX) problems.push(`${id}.${v} subline ${length(subline)}/${SUBLINE_MAX}: "${subline}"`);
      }
    }
  }
  if (problems.length) failed = true;
  console.log(`screenshots ${lang}: ${problems.length ? problems.join('; ') : `${order.length} screens × 2 variants ok`}`);
}
process.exit(failed ? 1 : 0);
