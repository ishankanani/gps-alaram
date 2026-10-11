/**
 * Backups (spec 4.11, 6.2): VACUUM INTO copies are readable with equal counts; rotation keeps the
 * 14 newest daily files and 8 Sunday files; the daily schedule and the 26-hour catch-up.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, before, describe, it } from 'node:test';

import { DAY, HOUR, MINUTE } from '../src/clock.ts';
import { loadConfig } from '../src/config.ts';
import { backupDue, backupStamp, listBackups, rotateBackups, runBackup, writeBackup } from '../src/domain/backup.ts';
import { startTestServer, T0, type TestServer } from './helpers.ts';

const TABLES = [
  'users', 'devices', 'sessions', 'promo_codes', 'grants', 'promo_redemptions', 'store_subscriptions', 'webhook_events', 'notes',
  'audit_log', 'settings', 'country_prices',
];

let dir: string;
let s: TestServer;
before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'stopwake-backup-'));
  s = await startTestServer();
  await s.seed(25);
});
after(async () => {
  await s.close();
  rmSync(dir, { recursive: true, force: true });
});

const counts = (db: DatabaseSync) =>
  Object.fromEntries(TABLES.map((t) => [t, Number((db.prepare(`SELECT count(*) AS n FROM ${t}`).get() as { n: number }).n)]));

/** An empty file named like a backup, with its mtime set to the name's time. */
function fakeBackup(folder: string, at: number, suffix = ''): string {
  const file = join(folder, `stopwake-${backupStamp(at)}${suffix}.db`);
  writeFileSync(file, '');
  utimesSync(file, new Date(at), new Date(at));
  return file;
}

describe('runBackup', () => {
  it('writes stopwake-YYYY-MM-DDTHHmmZ.db, readable with equal counts', () => {
    const folder = join(dir, 'run');
    const r = runBackup(s.db, { dir: folder, now: T0, keepDaily: 14, keepWeekly: 8 });
    assert.equal(r.file, join(folder, 'stopwake-2026-10-10T0800Z.db'));
    assert.deepEqual(r.removed, []);
    const copy = new DatabaseSync(r.file, { readOnly: true });
    try {
      assert.equal((copy.prepare('PRAGMA integrity_check').get() as { integrity_check: string }).integrity_check, 'ok');
      assert.equal((copy.prepare('PRAGMA user_version').get() as { user_version: number }).user_version, 1);
      const source = counts(s.db as unknown as DatabaseSync);
      assert.equal(source.users, 65);
      assert.deepEqual(counts(copy), source);
    } finally {
      copy.close();
    }
    assert.deepEqual(readdirSync(folder), ['stopwake-2026-10-10T0800Z.db'], 'no temp file is left');
    // A second backup in the same minute does not overwrite the first.
    const again = runBackup(s.db, { dir: folder, now: T0 + 10_000, keepDaily: 14, keepWeekly: 8 });
    assert.equal(again.file, join(folder, 'stopwake-2026-10-10T0800Z-2.db'));
    assert.equal(listBackups(folder).length, 2);
  });

  it('writeBackup (cli backup --out) writes a consistent copy of a file database', () => {
    const t = new DatabaseSync(join(dir, 'source.db'));
    t.exec('CREATE TABLE x (v INTEGER) STRICT; INSERT INTO x VALUES (1), (2), (3);');
    const out = writeBackup(t, join(dir, 'manual.db'));
    t.close();
    const copy = new DatabaseSync(out, { readOnly: true });
    assert.equal((copy.prepare('SELECT count(*) AS n FROM x').get() as { n: number }).n, 3);
    copy.close();
    assert.ok(!existsSync(`${out}.tmp`));
  });
});

describe('rotation', () => {
  it('keeps the 14 newest files and the 8 newest Sunday files', () => {
    const folder = join(dir, 'rotation');
    mkdirSync(folder, { recursive: true });
    const days = 120;
    const all: number[] = [];
    for (let i = 0; i < days; i++) {
      const at = Date.UTC(2026, 9, 10, 3, 0) - i * DAY;
      all.push(at);
      fakeBackup(folder, at);
    }
    // A second file on the newest Sunday counts once for the weekly set; other files are never touched.
    const extraSunday = Date.UTC(2026, 9, 4, 15, 30);
    fakeBackup(folder, extraSunday);
    writeFileSync(join(folder, 'pre-migration-0002-2026-10-01T030000Z.db'), '');
    writeFileSync(join(folder, 'notes.txt'), '');

    const removed = rotateBackups(folder, 14, 8);
    const kept = listBackups(folder).map((f) => f.at).sort((a, b) => b - a);

    const sorted = [...all, extraSunday].sort((a, b) => b - a);
    const expected = new Set(sorted.slice(0, 14));
    const sundays = new Map<string, number>();
    for (const at of sorted) {
      const day = new Date(at).toISOString().slice(0, 10);
      if (new Date(at).getUTCDay() === 0 && !sundays.has(day)) sundays.set(day, at);
    }
    for (const at of [...sundays.values()].slice(0, 8)) expected.add(at);
    assert.deepEqual(kept, [...expected].sort((a, b) => b - a));
    assert.equal(kept.filter((at) => new Date(at).getUTCDay() === 0).length >= 8, true);
    assert.equal(removed.length, days + 1 - kept.length);
    assert.ok(existsSync(join(folder, 'pre-migration-0002-2026-10-01T030000Z.db')));
    assert.ok(existsSync(join(folder, 'notes.txt')));
    // The oldest kept Sunday is 8 Sundays back from the newest.
    const oldest = kept.at(-1)!;
    assert.equal(new Date(oldest).getUTCDay(), 0);
    assert.equal(new Date(oldest).toISOString().slice(0, 10), '2026-08-16');
    assert.deepEqual(rotateBackups(folder, 14, 8), [], 'rotation is idempotent');
  });

  it('defaults: BACKUP_KEEP_DAILY 14, BACKUP_KEEP_WEEKLY 8, BACKUP_HOUR_UTC 3; on in production only', () => {
    const dev = loadConfig({ DATA_DIR: '/srv/stopwake' });
    assert.equal(dev.backups, false);
    assert.equal(dev.backupKeepDaily, 14);
    assert.equal(dev.backupKeepWeekly, 8);
    assert.equal(dev.backupHourUtc, 3);
    assert.equal(dev.backupDir, '/srv/stopwake/backups');
    const prod = loadConfig({ NODE_ENV: 'production', PUBLIC_URL: 'https://api.example.com', DATA_DIR: '/data' });
    assert.equal(prod.backups, true);
    assert.equal(loadConfig({ NODE_ENV: 'production', PUBLIC_URL: 'https://api.example.com', BACKUPS: 'false' }).backups, false);
  });
});

describe('backupDue', () => {
  it('when there is none, at BACKUP_HOUR_UTC once, and whenever the newest is older than 26 h', () => {
    const folder = join(dir, 'due');
    mkdirSync(folder, { recursive: true });
    const day = Date.UTC(2026, 9, 10);
    assert.equal(backupDue(folder, day + 10 * HOUR, 3), true, 'no backup yet');
    fakeBackup(folder, day - 4 * HOUR); // 20:00 the evening before
    assert.equal(backupDue(folder, day + 2 * HOUR, 3), false, 'before the backup hour');
    assert.equal(backupDue(folder, day + 3 * HOUR + 5 * MINUTE, 3), true, 'in the backup hour');
    assert.equal(backupDue(folder, day + 4 * HOUR + 5 * MINUTE, 3), false, 'the hour has passed');
    fakeBackup(folder, day + 3 * HOUR + 5 * MINUTE);
    assert.equal(backupDue(folder, day + 3 * HOUR + 15 * MINUTE, 3), false, 'already done this hour');
    assert.equal(backupDue(folder, day + 3 * HOUR + 5 * MINUTE + 26 * HOUR + MINUTE, 3), true, 'older than 26 h');
    assert.equal(backupDue(folder, day + 3 * HOUR + 5 * MINUTE + 25 * HOUR, 3), false);
  });
});
