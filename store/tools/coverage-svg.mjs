// Draws the app's coverage dots (src/map/coverage/data.json, built by tools/build-coverage.ts)
// as SVG circles, and formats the coverage numbers (store/src/coverage-stats.json) for the store
// graphics. Shared by render-assets.mjs (feature graphic) and compose-screenshots.mjs (infographic).
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
// Node 22 strips the types of the app's own module, so the store draws exactly what the app does.
const { decodeChunk, latToY, lonToX } = await import(path.join(root, 'src/map/coverage.ts'));

export const coverage = JSON.parse(fs.readFileSync(path.join(root, 'src/map/coverage/data.json'), 'utf8'));
export const stats = JSON.parse(fs.readFileSync(path.join(root, 'store/src/coverage-stats.json'), 'utf8'));

/**
 * Circles for every coverage cell of a grid level inside `box` ([west, south, east, north]),
 * projected (Web Mercator) onto the rectangle x, y, width (height follows the projection).
 * Returns { svg, height, project } where project(lat, lon) gives the [x, y] of a place.
 */
export function coverageDots({ box, x = 0, y = 0, width, grid = 11, color = '#FFFFFF', radius = [1.1, 1.5, 2, 2.6], opacity = [0.3, 0.45, 0.62, 0.85] }) {
  const level = coverage.levels.find((l) => l.grid === grid);
  if (!level) throw new Error(`no coverage level with grid ${grid}`);
  const [west, south, east, north] = box;
  const x0 = lonToX(west);
  const x1 = lonToX(east);
  const y0 = latToY(north);
  const y1 = latToY(south);
  const scale = width / (x1 - x0);
  const height = (y1 - y0) * scale;
  const project = (lat, lon) => [x + (lonToX(lon) - x0) * scale, y + (latToY(lat) - y0) * scale];
  const out = [];
  for (const [key] of level.chunks) {
    for (const cell of decodeChunk(level, key)) {
      if (cell.longitude < west || cell.longitude > east || cell.latitude < south || cell.latitude > north) continue;
      const [cx, cy] = project(cell.latitude, cell.longitude);
      out.push(`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${radius[cell.cls]}" fill-opacity="${opacity[cell.cls]}"/>`);
    }
  }
  return { svg: `<g fill="${color}">${out.join('')}</g>`, height, project, count: out.length };
}

/** "1.4M" / "1,4 Mio." for the stop count, rounded down so it is always true. */
export function millions(n, lang) {
  const m = Math.floor(n / 100_000) / 10;
  return lang === 'de' ? `${String(m).replace('.', ',')} Mio.` : `${m}M`;
}

/** A count with the language's thousands separator. */
export function count(n, lang) {
  return new Intl.NumberFormat(lang === 'de' ? 'de-DE' : 'en-GB').format(n);
}
