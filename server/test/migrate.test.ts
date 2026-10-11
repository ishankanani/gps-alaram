/**
 * Schema and migrations (spec 1.2, 1.4): migrating an empty database sets user_version; STRICT and
 * CHECK constraints reject bad rows; the audit trigger blocks updates except the GDPR scrub; the
 * pre-migration backup, rollback of a failed migration and the refusal of a newer schema.
 */
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, before, describe, it } from 'node:test';

import { openDatabase, type Db } from '../src/db/database.ts';
import { listMigrations, migrate, migrationStatus, MIGRATIONS_DIR, userVersion } from '../src/db/migrate.ts';
import { scrubAuditForUsers, writeAudit } from '../src/domain/audit.ts';
import { T0 } from './helpers.ts';

const TABLES = [
  'audit_log', 'country_prices', 'devices', 'grants', 'notes', 'password_reset_tokens', 'promo_codes', 'promo_redemptions', 'sessions',
  'settings', 'store_subscriptions', 'users', 'webhook_events',
];

let dir: string;
before(() => {
  dir = mkdtempSync(join(tmpdir(), 'stopwake-migrate-'));
});
after(() => rmSync(dir, { recursive: true, force: true }));

const fresh = (): Db => {
  const db = openDatabase(':memory:');
  migrate(db);
  return db;
};

describe('migrate', () => {
  it('migrates an empty database and sets user_version; a second run does nothing', () => {
    const db = openDatabase(':memory:');
    assert.deepEqual(migrationStatus(db), { current: 0, latest: 1, pending: listMigrations() });
    const r = migrate(db);
    assert.deepEqual(r, { from: 0, to: 1, applied: [1], backups: [] });
    assert.equal(userVersion(db), 1);
    const tables = db.prepare("SELECT name, strict FROM pragma_table_list WHERE schema = 'main' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string; strict: number }[];
    assert.deepEqual(tables.map((t) => t.name), TABLES);
    assert.ok(tables.every((t) => t.strict === 1), 'every table is STRICT');
    assert.deepEqual(migrate(db), { from: 1, to: 1, applied: [], backups: [] });
    db.close();
  });

  it('opens files with the pragmas of 1.4', () => {
    const db = openDatabase(join(dir, 'pragmas', 'stopwake.db'));
    const pragma = (name: string) => Object.values(db.prepare(`PRAGMA ${name}`).get() as Record<string, unknown>)[0];
    assert.equal(pragma('journal_mode'), 'wal');
    assert.equal(pragma('foreign_keys'), 1);
    assert.equal(pragma('synchronous'), 1);
    assert.equal(pragma('temp_store'), 2);
    assert.equal(pragma('trusted_schema'), 0);
    db.close();
  });

  it('backs up a non-empty database before each pending migration; a failure rolls back', () => {
    const migrations = join(dir, 'migrations');
    mkdirSync(migrations, { recursive: true });
    copyFileSync(join(MIGRATIONS_DIR, '0001-init.sql'), join(migrations, '0001-init.sql'));
    const backups = join(dir, 'backups');
    const file = join(dir, 'data', 'stopwake.db');
    const db = openDatabase(file);
    assert.deepEqual(migrate(db, { dir: migrations, backupDir: backups, now: T0 }).backups, [], 'an empty database is not backed up');
    db.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('limits.freeFavourites', '5', 1)").run();

    writeFileSync(join(migrations, '0002-extra.sql'), 'CREATE TABLE extra (id INTEGER PRIMARY KEY) STRICT;\n');
    const r = migrate(db, { dir: migrations, backupDir: backups, now: T0 });
    assert.deepEqual(r.applied, [2]);
    assert.equal(r.backups.length, 1);
    assert.equal(r.backups[0], join(backups, 'pre-migration-0002-2026-10-10T080000Z.db'));
    assert.equal(userVersion(db), 2);
    const copy = new DatabaseSync(r.backups[0]!, { readOnly: true });
    assert.equal((copy.prepare('PRAGMA user_version').get() as { user_version: number }).user_version, 1);
    assert.equal(copy.prepare("SELECT name FROM sqlite_master WHERE name = 'extra'").get(), undefined);
    assert.equal((copy.prepare('SELECT value FROM settings').get() as { value: string }).value, '5');
    copy.close();

    writeFileSync(join(migrations, '0003-broken.sql'), 'CREATE TABLE partial (x INTEGER) STRICT;\nINSERT INTO no_such_table VALUES (1);\n');
    assert.throws(() => migrate(db, { dir: migrations, backupDir: backups, now: T0 }), /Migration 0003-broken\.sql failed/);
    assert.equal(userVersion(db), 2);
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name = 'partial'").get(), undefined);
    assert.equal(readdirSync(backups).length, 2, 'the failed attempt still left its backup');
    db.close();
  });

  it('refuses a schema newer than the server and duplicate versions', () => {
    const db = openDatabase(':memory:');
    db.exec('PRAGMA user_version = 99');
    assert.throws(() => migrate(db), /newer than this server/);
    db.close();
    const dup = join(dir, 'dup');
    mkdirSync(dup, { recursive: true });
    writeFileSync(join(dup, '0001-a.sql'), '');
    writeFileSync(join(dup, '0001-b.sql'), '');
    writeFileSync(join(dup, 'README.md'), 'ignored');
    assert.throws(() => listMigrations(dup), /Duplicate migration version 1/);
  });
});

describe('STRICT tables and CHECK constraints', () => {
  const UUID = '11111111-1111-4111-8111-111111111111';
  const ADMIN = '22222222-2222-4222-8222-222222222222';
  let db: Db;
  before(() => {
    db = fresh();
    db.prepare(`INSERT INTO users (id, public_id, email, password_hash, role, created_at, updated_at) VALUES (?, 'SW-ADM1-0000', 'a@example.com', 'x', 'admin', 1, 1)`).run(ADMIN);
    db.prepare(`INSERT INTO users (id, public_id, created_at, updated_at) VALUES (?, 'SW-GST1-0000', 1, 1)`).run(UUID);
    db.prepare(`INSERT INTO promo_codes (id, code, plan, duration_days, created_at, updated_at) VALUES (1, 'GOOD-CODE', 'monthly', 30, 1, 1)`).run();
  });
  after(() => db.close());

  const rejects = (sql: string, params: (string | number | null)[], pattern: RegExp) =>
    assert.throws(() => db.prepare(sql).run(...params), pattern, sql);

  it('STRICT rejects values of the wrong type', () => {
    rejects('INSERT INTO users (id, public_id, created_at, updated_at) VALUES (?, ?, ?, ?)', [
      '33333333-3333-4333-8333-333333333333', 'SW-AAAA-BBBB', 'yesterday', 1,
    ], /cannot store TEXT value in INTEGER column/);
    rejects('INSERT INTO notes (user_id, body, created_at, updated_at) VALUES (?, ?, ?, ?)', [UUID, 'Body', 1.5, 1], /cannot store REAL value in INTEGER column/);
  });

  it('CHECK rejects bad rows in every table', () => {
    const user = (cols: string, values: (string | number | null)[], n: number) =>
      rejects(`INSERT INTO users (id, public_id, created_at, updated_at, ${cols}) VALUES (?, ?, 1, 1, ${values.map(() => '?').join(', ')})`,
        [`44444444-4444-4444-8444-44444444444${n}`, `SW-CHK${n}-0000`, ...values], /CHECK constraint failed/);
    // users
    rejects("INSERT INTO users (id, public_id, created_at, updated_at) VALUES ('x1', 'SW-ILOU-0000', 1, 1)", [], /CHECK constraint failed/);
    rejects("INSERT INTO users (id, public_id, created_at, updated_at) VALUES ('x2', 'sw-abcd-0000', 1, 1)", [], /CHECK constraint failed/);
    user('email, password_hash', ['Upper@Example.com', 'x'], 1);
    user('email', ['nopass@example.com'], 2);
    user('role', ['admin'], 3);
    user('status, disabled_at', ['disabled', null], 4);
    user('status', ['merged'], 5);
    user('plan, plan_until, plan_ref', ['monthly', 5, 'grant:1'], 6);
    user('plan_source', ['store'], 7);
    user('language', ['xx'], 8);
    user('country', ['de'], 9);
    // grants
    const grant = (cols: string, values: (string | number | null)[]) =>
      rejects(`INSERT INTO grants (user_id, starts_at, reason, created_at, updated_at, ${cols}) VALUES (?, 10, 'Reason', 1, 1, ${values.map(() => '?').join(', ')})`,
        [UUID, ...values], /CHECK constraint failed/);
    grant('plan, source, ends_at', ['lifetime', 'admin', 100]);
    grant('plan, source, ends_at', ['monthly', 'admin', null]);
    grant('plan, source, ends_at', ['monthly', 'admin', 10]);
    grant('plan, source, ends_at, promo_code_id', ['monthly', 'admin', 100, 1]);
    grant('plan, source, ends_at, revoked_at', ['monthly', 'admin', 100, 50]);
    grant('plan, source, ends_at', ['weekly', 'admin', 100]);
    rejects("INSERT INTO grants (user_id, plan, source, starts_at, ends_at, reason, created_at, updated_at) VALUES (?, 'monthly', 'admin', 1, 9, '', 1, 1)", [UUID], /CHECK constraint failed/);
    // promo codes
    const promo = (code: string, plan: string, days: number | null, max: number | null = null, n = 0) =>
      rejects('INSERT INTO promo_codes (code, plan, duration_days, max_redemptions, redemption_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, 1)',
        [code, plan, days, max, n], /CHECK constraint failed/);
    promo('lower-case', 'monthly', 30);
    promo('ABC', 'monthly', 30);
    promo('LIFETIME-DAYS', 'lifetime', 30);
    promo('MONTHLY-NO-DAYS', 'monthly', null);
    promo('OVER-MAX', 'monthly', 30, 1, 2);
    promo('TOO-LONG-DAYS', 'monthly', 3651);
    // sessions, reset tokens
    rejects("INSERT INTO sessions (user_id, token_hash, method, created_at, last_used_at, expires_at) VALUES (?, 'short', 'guest', 1, 1, 2)", [UUID], /CHECK constraint failed/);
    rejects('INSERT INTO sessions (user_id, token_hash, method, created_at, last_used_at, expires_at) VALUES (?, ?, ?, 5, 5, 5)', [UUID, 'a'.repeat(64), 'guest'], /CHECK constraint failed/);
    rejects('INSERT INTO sessions (user_id, token_hash, method, created_at, last_used_at, expires_at) VALUES (?, ?, ?, 1, 1, 2)', [UUID, 'b'.repeat(64), 'magic'], /CHECK constraint failed/);
    rejects("INSERT INTO password_reset_tokens (user_id, code_hash, via, attempts, created_at, expires_at) VALUES (?, ?, 'email', 6, 1, 2)", [ADMIN, 'c'.repeat(64)], /CHECK constraint failed/);
    // store subscriptions
    const sub = (plan: string, status: string, willRenew: number) =>
      rejects(`INSERT INTO store_subscriptions (user_id, store, environment, product_id, plan, original_transaction_id, rc_app_user_id, status, will_renew,
         purchased_at, last_event_at, created_at, updated_at) VALUES (?, 'play_store', 'production', 'p', ?, ?, ?, ?, ?, 1, 1, 1, 1)`,
        [UUID, plan, `GPA.${plan}.${status}`, UUID, status, willRenew], /CHECK constraint failed/);
    sub('lifetime', 'active', 1);
    sub('monthly', 'cancelled', 1);
    // json columns and enums
    rejects("INSERT INTO settings (key, value, updated_at) VALUES ('x', 'not json', 1)", [], /CHECK constraint failed/);
    rejects("INSERT INTO country_prices (country, currency, monthly_minor, yearly_minor, lifetime_minor, updated_at) VALUES ('eu', 'EUR', 1, 1, 1, 1)", [], /CHECK constraint failed/);
    rejects("INSERT INTO country_prices (country, currency, monthly_minor, yearly_minor, lifetime_minor, trial_days, updated_at) VALUES ('PL', 'PLN', 1, 1, 1, 31, 1)", [], /CHECK constraint failed/);
    rejects("INSERT INTO country_prices (country, currency, monthly_minor, yearly_minor, lifetime_minor, updated_at) VALUES ('PL', 'PLN', 0, 1, 1, 1)", [], /CHECK constraint failed/);
    rejects("INSERT INTO webhook_events (id, type, received_at, status, payload) VALUES ('e1', 'TEST', 1, 'processed', '{oops')", [], /CHECK constraint failed/);
    rejects("INSERT INTO webhook_events (id, type, received_at, status, payload) VALUES ('e2', 'TEST', 1, 'done', '{}')", [], /CHECK constraint failed/);
    rejects("INSERT INTO audit_log (at, actor_label, action, target_type) VALUES (1, 'cli', 'x', 'robot')", [], /CHECK constraint failed/);
    rejects("INSERT INTO audit_log (at, actor_label, action, details) VALUES (1, 'cli', 'x', 'nope')", [], /CHECK constraint failed/);
    rejects('INSERT INTO notes (user_id, body, created_at, updated_at) VALUES (?, ?, 1, 1)', [UUID, ''], /CHECK constraint failed/);
  });

  it('foreign keys are enforced', () => {
    rejects("INSERT INTO notes (user_id, body, created_at, updated_at) VALUES ('99999999-9999-4999-8999-999999999999', 'Body', 1, 1)", [], /FOREIGN KEY constraint failed/);
  });
});

describe('the audit_log trigger', () => {
  it('blocks every update except replacing details with {"scrubbed":true}', () => {
    const db = fresh();
    const userId = '55555555-5555-4555-8555-555555555555';
    const id = writeAudit(db, {
      at: 1, actor: { id: null, label: 'cli' }, action: 'grant.create', target: { type: 'grant', id: 7, userId, label: 'SW-AAAA-BBBB' },
      details: { grantId: 7, reason: 'Mail me at lena@example.com' }, ip: '203.0.113.1', requestId: 'req-1',
    });
    const row = () => db.prepare('SELECT * FROM audit_log WHERE id = ?').get(id) as Record<string, unknown>;
    assert.match(String(row().details), /l\*\*\*@example\.com/, 'emails in details are masked');
    for (const sql of [
      "UPDATE audit_log SET action = 'grant.revoke' WHERE id = ?",
      "UPDATE audit_log SET details = '{}' WHERE id = ?",
      "UPDATE audit_log SET ip = NULL WHERE id = ?",
      "UPDATE audit_log SET details = '{\"scrubbed\":true}', ip = NULL WHERE id = ?",
      "UPDATE audit_log SET details = '{\"scrubbed\":true}', target_label = 'x' WHERE id = ?",
      'UPDATE audit_log SET at = at + 1 WHERE id = ?',
    ]) {
      assert.throws(() => db.prepare(sql).run(id), /audit_log is append-only/, sql);
    }
    assert.equal(scrubAuditForUsers(db, [userId]), 1);
    assert.equal(row().details, '{"scrubbed":true}');
    assert.equal(row().ip, '203.0.113.1');
    assert.equal(scrubAuditForUsers(db, [userId]), 0, 'already scrubbed');
    // Retention may delete old rows.
    db.prepare('DELETE FROM audit_log WHERE id = ?').run(id);
    assert.equal(db.prepare('SELECT count(*) AS n FROM audit_log').get()!.n, 0);
    db.close();
  });
});
