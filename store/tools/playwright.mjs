// Loads Playwright without making it a project dependency: a local install
// (npm i --no-save playwright) or the global one (npm i -g playwright).
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

export async function loadChromium() {
  const require = createRequire(import.meta.url);
  const roots = [process.cwd()];
  try {
    roots.push(execSync('npm root -g', { encoding: 'utf8' }).trim());
  } catch {
    // no global npm
  }
  for (const root of roots) {
    try {
      return require(require.resolve('playwright', { paths: [root] })).chromium;
    } catch {
      // try the next place
    }
  }
  throw new Error('Playwright not found: run `npm i --no-save playwright && npx playwright install chromium`.');
}
