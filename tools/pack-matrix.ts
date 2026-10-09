/// <reference types="node" />
/**
 * Prints the stop packs to build as a JSON array for the stop-packs workflow matrix.
 *
 *   node tools/pack-matrix.ts [ids or country codes, comma separated; empty = all]
 */
import { PACKS } from '../src/lib/stations/countries.ts';

const wanted = (process.argv[2] ?? '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);
const packs = PACKS.filter((p) => p.source && (wanted.length === 0 || wanted.includes(p.id) || wanted.includes(p.country)));
if (packs.length === 0) {
  console.error(`No stop packs match "${process.argv[2]}"`);
  process.exit(1);
}
console.log(JSON.stringify(packs.map((p) => ({ id: p.id, source: p.source }))));
