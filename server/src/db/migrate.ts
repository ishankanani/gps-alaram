/**
 * Forward-only migrations tracked with PRAGMA user_version (spec 1.4).
 *
 * Files are server/src/db/migrations/NNNN-name.sql. Each pending file runs in BEGIN IMMEDIATE …
 * COMMIT together with `PRAGMA user_version = NNNN` (the header write is part of the transaction).
 * Before migrating a non-empty file database, a VACUUM INTO copy goes to the backup folder.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { iso } from '../clock.ts';
import type { Logger } from '../log.ts';
import { one, type Db } from './database.ts';

export const MIGRATIONS_DIR = fileURLToPath(new URL('./migrations/', import.meta.url));

export type Migration = { version: number; name: string; file: string };

export function listMigrations(dir: string = MIGRATIONS_DIR): Migration[] {
  const found: Migration[] = [];
  for (const name of readdirSync(dir)) {
    const m = /^(\d{4})-[a-z0-9-]+\.sql$/.exec(name);
    if (m?.[1]) found.push({ version: Number(m[1]), name, file: join(dir, name) });
  }
  found.sort((a, b) => a.version - b.version);
  for (let i = 1; i < found.length; i++) {
    if (found[i]!.version === found[i - 1]!.version) throw new Error(`Duplicate migration version ${found[i]!.version}`);
  }
  return found;
}

export function userVersion(db: Db): number {
  return one<{ user_version: number }>(db, 'PRAGMA user_version')?.user_version ?? 0;
}

export type MigrationStatus = { current: number; latest: number; pending: Migration[] };

export function migrationStatus(db: Db, dir?: string): MigrationStatus {
  const all = listMigrations(dir);
  const current = userVersion(db);
  return { current, latest: all.at(-1)?.version ?? 0, pending: all.filter((m) => m.version > current) };
}

function hasTables(db: Db): boolean {
  return (one<{ n: number }>(db, "SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")?.n ?? 0) > 0;
}

/** File-safe ISO stamp: 2026-10-10T081500Z (colons are not allowed on every filesystem). */
export const fileStamp = (ms: number): string => iso(ms).replace(/:/g, '').replace(/\.\d{3}Z$/, 'Z');

export type MigrateResult = { from: number; to: number; applied: number[]; backups: string[] };

export function migrate(
  db: Db,
  opts: { backupDir?: string | null; now?: number; log?: Logger; dir?: string } = {},
): MigrateResult {
  const { current, latest, pending } = migrationStatus(db, opts.dir);
  if (current > latest) {
    throw new Error(`Database schema version ${current} is newer than this server (${latest}); refusing to start`);
  }
  const result: MigrateResult = { from: current, to: current, applied: [], backups: [] };
  const location = db.location();
  for (const m of pending) {
    if (opts.backupDir && location && hasTables(db)) {
      mkdirSync(opts.backupDir, { recursive: true });
      let target = join(opts.backupDir, `pre-migration-${String(m.version).padStart(4, '0')}-${fileStamp(opts.now ?? Date.now())}.db`);
      for (let i = 2; existsSync(target); i++) target = target.replace(/(-\d+)?\.db$/, `-${i}.db`);
      db.prepare('VACUUM INTO ?').run(target);
      result.backups.push(target);
      opts.log?.info('pre-migration backup written', { file: target, version: m.version });
    }
    const sql = readFileSync(m.file, 'utf8');
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(sql);
      db.exec(`PRAGMA user_version = ${m.version}`);
      db.exec('COMMIT');
    } catch (err) {
      if (db.isTransaction) db.exec('ROLLBACK');
      throw new Error(`Migration ${m.name} failed: ${(err as Error).message}`, { cause: err });
    }
    result.applied.push(m.version);
    result.to = m.version;
    opts.log?.info('migration applied', { version: m.version, name: m.name });
  }
  return result;
}
