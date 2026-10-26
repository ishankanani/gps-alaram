// Checks the Play listing texts in store/listing/<lang>.md against Google Play's limits.
// Each file has four "## " sections in this order: title, short description, full description,
// release notes. Usage: node store/tools/check-listing.mjs
import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../listing');
const LIMITS = [
  ['title', 30],
  ['short description', 80],
  ['full description', 4000],
  ['release notes', 500],
];
let failed = false;
for (const file of fs.readdirSync(dir).filter((f) => /^[a-z]{2}\.md$/.test(f)).sort()) {
  const sections = fs.readFileSync(path.join(dir, file), 'utf8').split(/^## .*$/m).slice(1).map((s) => s.trim());
  const report = LIMITS.map(([name, max], i) => {
    const length = [...(sections[i] ?? '')].length;
    const ok = length > 0 && length <= max;
    if (!ok) failed = true;
    return `${name} ${length}/${max}${ok ? '' : ' ✗'}`;
  });
  console.log(`${file.padEnd(6)} ${report.join(' · ')}`);
}
process.exit(failed ? 1 : 0);
