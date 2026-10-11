/**
 * The demo seed (spec 6.4, 6.7) through `cli.ts seed`: a temp file passes integrity_check with the
 * specified counts; --reset is idempotent; a non-empty database and production are refused.
 */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createPasswordHasher } from '../src/domain/passwords.ts';
import { DEMO_ADMIN_PASSWORD, DEMO_PASSWORD, DEMO_USERS, demoUserId, seedDemo } from '../src/seed/demo.ts';
import { startTestServer, T0 } from './helpers.ts';

const CLI = fileURLToPath(new URL('../cli.ts', import.meta.url));
const NOW = new Date(T0).toISOString();

let dir: string;
before(() => {
  dir = mkdtempSync(join(tmpdir(), 'stopwake-seed-'));
});
after(() => rmSync(dir, { recursive: true, force: true }));

type CliResult = { code: number; stdout: string; stderr: string };

function cli(args: string[], env: Record<string, string>): Promise<CliResult> {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      ['--disable-warning=ExperimentalWarning', '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', CLI, ...args],
      { env: { PATH: process.env.PATH ?? '', NODE_ENV: 'development', SCRYPT_N: '1024', SCRYPT_P: '1', DATA_DIR: dir, LOG_LEVEL: 'error', ...env } },
      (err, stdout, stderr) => resolve({ code: err ? Number(err.code ?? 1) : 0, stdout, stderr }),
    );
  });
}

const TABLES = [
  'users', 'devices', 'sessions', 'password_reset_tokens', 'promo_codes', 'grants', 'promo_redemptions', 'store_subscriptions',
  'webhook_events', 'notes', 'audit_log', 'settings', 'country_prices',
];

function inspect(file: string) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const counts = Object.fromEntries(TABLES.map((t) => [t, Number((db.prepare(`SELECT count(*) AS n FROM ${t}`).get() as { n: number }).n)]));
    const integrity = (db.prepare('PRAGMA integrity_check').get() as { integrity_check: string }).integrity_check;
    const fk = db.prepare('PRAGMA foreign_key_check').all();
    const version = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
    const users = db.prepare(
      'SELECT id, public_id, email, role, status, country, plan, plan_source, plan_until, plan_trial, created_at, last_seen_at FROM users ORDER BY public_id',
    ).all();
    const pro = Number((db.prepare("SELECT count(*) AS n FROM users WHERE status = 'active' AND plan_until > ?").get(T0) as { n: number }).n);
    const content = Object.fromEntries(
      ['promo_codes', 'grants', 'promo_redemptions', 'store_subscriptions', 'webhook_events', 'notes', 'settings', 'country_prices', 'devices', 'sessions']
        .map((t) => [t, db.prepare(`SELECT * FROM ${t} ORDER BY 1`).all()]),
    );
    const audit = db.prepare('SELECT at, actor_label, action, target_type, target_label, details, ip FROM audit_log ORDER BY id').all();
    const hashes = db.prepare('SELECT email, password_hash FROM users WHERE email IS NOT NULL').all() as { email: string; password_hash: string }[];
    return { counts, integrity, fk, version, users, pro, content, audit, hashes };
  } finally {
    db.close();
  }
}

const EXPECTED_COUNTS = {
  users: 40, devices: 41, sessions: 41, password_reset_tokens: 0, promo_codes: 5, grants: 7, promo_redemptions: 3,
  store_subscriptions: 15, webhook_events: 7, notes: 6, audit_log: 15, settings: 2, country_prices: 1,
};

describe('cli.ts seed --demo', () => {
  it('seeds a temp file: integrity_check ok and the counts of 6.7', async () => {
    const file = join(dir, 'demo.db');
    const r = await cli(['seed', '--demo', `--now=${NOW}`, '--extra-guests=10'], { DATABASE_PATH: file });
    assert.equal(r.code, 0, r.stderr);
    const out = JSON.parse(r.stdout) as { seeded: Record<string, number>; now: string; database: string };
    assert.deepEqual(out.seeded, { users: 50, guests: 18, extraGuests: 10, promoCodes: 5, auditEntries: 15 });
    assert.equal(out.now, NOW);
    assert.equal(out.database, file);

    const db = inspect(file);
    assert.equal(db.integrity, 'ok');
    assert.deepEqual(db.fk, []);
    assert.equal(db.version, 1);
    assert.deepEqual(db.counts, { ...EXPECTED_COUNTS, users: 50, devices: 51, sessions: 51 });
    assert.equal(db.pro, 20);
    const users = db.users as { id: string; public_id: string; email: string | null; role: string; status: string }[];
    for (const u of DEMO_USERS) {
      const row = users.find((x) => x.public_id === u.publicId);
      assert.ok(row, u.publicId);
      assert.equal(row.id, demoUserId(u.publicId));
      assert.equal(row.email, u.email);
    }
    assert.deepEqual(users.filter((u) => u.role === 'admin').map((u) => u.email).sort(), ['admin@example.com', 'support@example.com']);
    assert.equal(users.filter((u) => u.status === 'disabled').length, 1);
    assert.equal(users.filter((u) => u.email === null).length, 18);

    // Demo passwords: the accounts share one hash, the admins use StopWake-admin-2026.
    const hasher = createPasswordHasher({ N: 1024, p: 1 });
    const lena = db.hashes.find((h) => h.email === 'lena.weber@example.com')!;
    const alex = db.hashes.find((h) => h.email === 'admin@example.com')!;
    assert.equal(await hasher.verify(DEMO_PASSWORD, lena.password_hash), true);
    assert.equal(await hasher.verify(DEMO_ADMIN_PASSWORD, alex.password_hash), true);
    assert.equal(new Set(db.hashes.filter((h) => !['admin@example.com', 'support@example.com'].includes(h.email)).map((h) => h.password_hash)).size, 1);
  });

  it('refuses a non-empty database without --reset', async () => {
    const file = join(dir, 'demo.db');
    const before_ = inspect(file);
    const r = await cli(['seed', '--demo', `--now=${NOW}`], { DATABASE_PATH: file });
    assert.equal(r.code, 1);
    assert.match(r.stderr, /not empty.*--reset/);
    assert.deepEqual(inspect(file).counts, before_.counts);
  });

  it('--reset replaces everything with the same data (idempotent)', async () => {
    const file = join(dir, 'demo.db');
    const first = await cli(['seed', '--demo', '--reset', `--now=${NOW}`, '--extra-guests=10'], { DATABASE_PATH: file });
    assert.equal(first.code, 0, first.stderr);
    const a = inspect(file);
    const second = await cli(['seed', '--demo', '--reset', `--now=${NOW}`, '--extra-guests=10'], { DATABASE_PATH: file });
    assert.equal(second.code, 0, second.stderr);
    const b = inspect(file);
    assert.equal(b.integrity, 'ok');
    assert.deepEqual(b.counts, a.counts);
    assert.deepEqual(b.users, a.users);
    assert.deepEqual(b.content, a.content);
    assert.deepEqual(b.audit, a.audit);
    // Without extra guests: exactly the 40 demo users.
    const plain = await cli(['seed', '--demo', '--reset', `--now=${NOW}`], { DATABASE_PATH: file });
    assert.equal(plain.code, 0, plain.stderr);
    assert.deepEqual(inspect(file).counts, EXPECTED_COUNTS);
  });

  it('ADMIN_EMAIL and ADMIN_PASSWORD replace the first admin', async () => {
    const file = join(dir, 'admin-env.db');
    const r = await cli(['seed', '--demo', `--now=${NOW}`], { DATABASE_PATH: file, ADMIN_EMAIL: 'Owner@Example.org', ADMIN_PASSWORD: 'a very long admin pw' });
    assert.equal(r.code, 0, r.stderr);
    const db = inspect(file);
    const owner = db.hashes.find((h) => h.email === 'owner@example.org');
    assert.ok(owner);
    assert.equal(await createPasswordHasher({ N: 1024, p: 1 }).verify('a very long admin pw', owner.password_hash), true);
    assert.ok(!db.hashes.some((h) => h.email === 'admin@example.com'));
  });

  it('refuses NODE_ENV=production without --force, and bad options', async () => {
    const file = join(dir, 'prod.db');
    const env = { DATABASE_PATH: file, NODE_ENV: 'production', PUBLIC_URL: 'https://api.example.com', SCRYPT_N: '16384' };
    const r = await cli(['seed', '--demo', `--now=${NOW}`], env);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /Refusing to seed demo data with NODE_ENV=production/);
    assert.equal(inspect(file).counts.users, 0);

    const other = join(dir, 'options.db');
    for (const args of [['seed'], ['seed', '--demo', '--now=yesterday'], ['seed', '--demo', '--extra-guests=-1']]) {
      const bad = await cli(args, { DATABASE_PATH: other });
      assert.equal(bad.code, 1, args.join(' '));
    }
  });

  it('stats prints the dashboard of the seeded database', async () => {
    const file = join(dir, 'stats.db');
    const seeded = await cli(['seed', '--demo'], { DATABASE_PATH: file });
    assert.equal(seeded.code, 0, seeded.stderr);
    const r = await cli(['stats'], { DATABASE_PATH: file });
    assert.equal(r.code, 0, r.stderr);
    const d = JSON.parse(r.stdout);
    assert.equal(d.users.total, 40);
    assert.deepEqual(d.pro.bySource, { store: 14, grant: 3, promo: 3 });
  });
});

describe('seedDemo', () => {
  it('refuses a database that is not empty', async () => {
    const s = await startTestServer();
    try {
      await s.account('someone@example.com');
      await assert.rejects(() => s.seed(), /not empty/);
      await assert.rejects(() => seedDemo(s.db, { now: T0, hasher: s.app.context.hasher }), /not empty/);
    } finally {
      await s.close();
    }
  });
});
