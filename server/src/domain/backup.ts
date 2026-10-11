/**
 * Backups (spec 4.11): VACUUM INTO '${BACKUP_DIR}/stopwake-YYYY-MM-DDTHHmmZ.db', daily at
 * BACKUP_HOUR_UTC and whenever the newest backup is older than 26 h (so also at start). Rotation
 * keeps the 14 newest files and the 8 newest Sunday files. Pre-migration copies are not rotated.
 */
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { DAY, HOUR, iso } from '../clock.ts';
import type { Db } from '../db/database.ts';

const BACKUP_RE = /^stopwake-(\d{4})-(\d{2})-(\d{2})T(\d{2})(\d{2})Z(?:-\d+)?\.db$/;

/** 2026-10-10T0300Z */
export const backupStamp = (ms: number): string => iso(ms).slice(0, 16).replace(':', '') + 'Z';

export type BackupFile = { name: string; path: string; at: number };

export function listBackups(dir: string): BackupFile[] {
  if (!existsSync(dir)) return [];
  const out: BackupFile[] = [];
  for (const name of readdirSync(dir)) {
    const m = BACKUP_RE.exec(name);
    if (!m) continue;
    const at = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
    if (Number.isFinite(at)) out.push({ name, path: join(dir, name), at });
  }
  return out.sort((a, b) => b.at - a.at || (a.name < b.name ? 1 : -1));
}

/** Writes a consistent copy with VACUUM INTO (atomically renamed into place). Returns its path. */
export function writeBackup(db: Db, target: string): string {
  const tmp = `${target}.tmp`;
  rmSync(tmp, { force: true });
  db.prepare('VACUUM INTO ?').run(tmp);
  renameSync(tmp, target);
  return target;
}

export function runBackup(db: Db, opts: { dir: string; now: number; keepDaily: number; keepWeekly: number }): { file: string; removed: string[] } {
  mkdirSync(opts.dir, { recursive: true });
  let target = join(opts.dir, `stopwake-${backupStamp(opts.now)}.db`);
  for (let i = 2; existsSync(target); i++) target = join(opts.dir, `stopwake-${backupStamp(opts.now)}-${i}.db`);
  writeBackup(db, target);
  return { file: target, removed: rotateBackups(opts.dir, opts.keepDaily, opts.keepWeekly) };
}

/** Keeps the keepDaily newest files and the keepWeekly newest Sunday (UTC) files; deletes the rest. */
export function rotateBackups(dir: string, keepDaily: number, keepWeekly: number): string[] {
  const files = listBackups(dir);
  const keep = new Set(files.slice(0, keepDaily).map((f) => f.name));
  const sundays = files.filter((f) => new Date(f.at).getUTCDay() === 0);
  // One file per Sunday counts as that week's backup.
  const seenDays = new Set<string>();
  let weekly = 0;
  for (const f of sundays) {
    const day = iso(f.at).slice(0, 10);
    if (seenDays.has(day)) continue;
    if (weekly >= keepWeekly) break;
    seenDays.add(day);
    keep.add(f.name);
    weekly++;
  }
  const removed: string[] = [];
  for (const f of files) {
    if (keep.has(f.name)) continue;
    rmSync(f.path, { force: true });
    removed.push(f.name);
  }
  return removed;
}

/** Due when there is none, the newest is older than 26 h, or it is BACKUP_HOUR_UTC and none was made since that hour began. */
export function backupDue(dir: string, now: number, hourUtc: number): boolean {
  const newest = listBackups(dir)[0];
  if (!newest) return true;
  // The file name has minute precision; the file time is exact.
  let newestAt = newest.at;
  try {
    newestAt = Math.max(newestAt, statSync(newest.path).mtimeMs);
  } catch {
    // keep the name's time
  }
  if (now - newestAt > 26 * HOUR) return true;
  const slot = Math.floor(now / DAY) * DAY + hourUtc * HOUR;
  return now >= slot && now < slot + HOUR && newestAt < slot;
}
