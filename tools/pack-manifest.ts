/// <reference types="node" />
/**
 * Writes packs.json, the list of stop packs the app offers for download.
 *
 *   node tools/pack-manifest.ts <dir with new *.db.gz and *.json> <old packs.json or -> <out packs.json>
 *
 * Packs that were not rebuilt keep their entry from the old manifest.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { PACKS } from '../src/lib/stations/countries.ts';
import type { PackInfo } from './build-osm-pack.ts';

export type ManifestEntry = PackInfo & { file: string; bytes: number; sha256: string };

const [dir, oldPath, out] = process.argv.slice(2);
if (!dir || !oldPath || !out) {
  console.error('Usage: node tools/pack-manifest.ts <dir> <old packs.json or -> <out packs.json>');
  process.exit(1);
}

const entries = new Map<string, ManifestEntry>();
if (oldPath !== '-' && existsSync(oldPath)) {
  const old = JSON.parse(readFileSync(oldPath, 'utf8')) as { packs?: ManifestEntry[] };
  for (const p of old.packs ?? []) entries.set(p.id, p);
}
for (const name of readdirSync(dir)) {
  if (!name.endsWith('.db.gz')) continue;
  const id = name.slice(0, -'.db.gz'.length);
  const info = JSON.parse(readFileSync(join(dir, `${id}.json`), 'utf8')) as PackInfo;
  const data = readFileSync(join(dir, name));
  entries.set(id, {
    ...info,
    file: name,
    bytes: statSync(join(dir, name)).size,
    sha256: createHash('sha256').update(data).digest('hex'),
  });
}

const order = PACKS.map((p) => p.id);
const packs = [...entries.values()].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
writeFileSync(out, `${JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), packs }, null, 2)}\n`);
console.log(packs.map((p) => `${p.id}: ${p.count} stops, ${(p.bytes / 1e6).toFixed(1)} MB`).join('\n'));
