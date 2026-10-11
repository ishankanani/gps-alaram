/**
 * StopWake Cloud command line (spec 6.4). Every write is audited with actor `cli`.
 *
 *   node --disable-warning=ExperimentalWarning server/cli.ts <command> [options]
 *
 *   migrate [--status]
 *   seed --demo [--reset] [--extra-guests=N] [--now=ISO] [--force]
 *   make-admin <email> [--create --password-env=VAR]
 *   remove-admin <email>
 *   grant <SW-ID|email> <monthly|yearly|lifetime> [--days=N] --reason="…"
 *   backup [--out=FILE]
 *   prune
 *   reapply-deletions --since=ISO --from=<newer db file>
 *   stats
 */
import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';

import { DAY, iso, isoOrNull, systemClock } from './src/clock.ts';
import { ConfigError, loadConfig, type Config } from './src/config.ts';
import { closeDatabase, openDatabase, run, tx, type Db } from './src/db/database.ts';
import { migrate, migrationStatus } from './src/db/migrate.ts';
import { findUserByRef } from './src/domain/admin-users.ts';
import { CLI_ACTOR, writeAudit } from './src/domain/audit.ts';
import { runBackup, writeBackup } from './src/domain/backup.ts';
import { buildDashboard } from './src/domain/dashboard.ts';
import { DEFAULT_GRANT_DAYS, insertGrant, MAX_GRANT_DAYS } from './src/domain/grants.ts';
import { createPasswordHasher, passwordPolicyError } from './src/domain/passwords.ts';
import { recomputePlan } from './src/domain/plans.ts';
import { prune } from './src/domain/prune.ts';
import { countActiveAdmins, createAccount, deleteUser, getUser, getUserByEmail, getUserByPublicId, type UserRow } from './src/domain/users.ts';
import { normalizeEmail, parseIsoDate } from './src/http/validate.ts';
import { createLogger } from './src/log.ts';
import { clearDatabase, isEmptyDatabase, seedDemo } from './src/seed/demo.ts';

class CliError extends Error {}

type Args = { positional: string[]; flags: Map<string, string | true> };

function parseArgs(argv: readonly string[]): Args {
  const positional: string[] = [];
  const flags = new Map<string, string | true>();
  for (const a of argv) {
    const m = /^--([a-z][a-z0-9-]*)(?:=(.*))?$/s.exec(a);
    if (m) flags.set(m[1]!, m[2] ?? true);
    else positional.push(a);
  }
  return { positional, flags };
}

const flag = (args: Args, name: string): string | undefined => {
  const v = args.flags.get(name);
  if (v === true) throw new CliError(`--${name} needs a value (--${name}=…)`);
  return v;
};

const USAGE = `Usage: node server/cli.ts <command>
  migrate [--status]
  seed --demo [--reset] [--extra-guests=N] [--now=ISO] [--force]
  make-admin <email> [--create --password-env=VAR]
  remove-admin <email>
  grant <SW-ID|email> <monthly|yearly|lifetime> [--days=N] --reason="..."
  backup [--out=FILE]
  prune
  reapply-deletions --since=ISO --from=<newer db file>
  stats`;

const print = (value: unknown): void => {
  process.stdout.write(`${typeof value === 'string' ? value : JSON.stringify(value, null, 2)}\n`);
};

function emailArg(args: Args, index: number): string {
  const raw = args.positional[index];
  if (!raw) throw new CliError('An email address is required');
  const r = normalizeEmail(raw);
  if ('error' in r) throw new CliError(`Not a valid email address: ${raw}`);
  return r.email;
}

function userArg(db: Db, raw: string | undefined): UserRow {
  if (!raw) throw new CliError('A user (SW-ID, email or id) is required');
  let user: UserRow | undefined;
  if (raw.includes('@')) {
    const r = normalizeEmail(raw);
    user = 'email' in r ? getUserByEmail(db, r.email) : undefined;
  } else {
    user = findUserByRef(db, raw);
  }
  if (!user) throw new CliError(`No user found for ${raw}`);
  return user;
}

const userTarget = (u: UserRow) => ({ type: 'user' as const, id: u.id, userId: u.id, label: u.public_id });

async function seed(db: Db, config: Config, args: Args): Promise<void> {
  if (!args.flags.has('demo')) throw new CliError('Only the demo data set exists: seed --demo');
  if (config.production && !args.flags.has('force')) throw new CliError('Refusing to seed demo data with NODE_ENV=production (add --force)');
  const nowFlag = flag(args, 'now');
  const now = nowFlag === undefined ? systemClock.now() : parseIsoDate(nowFlag);
  if (now === null) throw new CliError('--now must be an ISO date with Z or an offset, e.g. 2026-10-10T08:00:00Z');
  const extraFlag = flag(args, 'extra-guests');
  const extraGuests = extraFlag === undefined ? 0 : Number(extraFlag);
  if (!Number.isSafeInteger(extraGuests) || extraGuests < 0 || extraGuests > 100_000) throw new CliError('--extra-guests must be 0–100000');
  if (!isEmptyDatabase(db)) {
    if (!args.flags.has('reset')) throw new CliError('The database is not empty; add --reset to replace everything with the demo data');
    clearDatabase(db);
  }
  const hasher = createPasswordHasher({ N: config.scryptN, p: config.scryptP });
  const summary = await seedDemo(db, {
    now, extraGuests, adminEmail: config.adminEmail, adminPassword: config.adminPassword, hasher,
    planOptions: { sandboxGrantsPro: config.storeSandboxGrantsPro },
  });
  print({ seeded: summary, now: iso(now), database: config.databasePath });
}

async function makeAdmin(db: Db, config: Config, args: Args): Promise<void> {
  const email = emailArg(args, 1);
  const now = systemClock.now();
  const existing = getUserByEmail(db, email);
  if (!existing) {
    if (!args.flags.has('create')) throw new CliError(`No account with ${email}; add --create --password-env=VAR to create one`);
    const varName = flag(args, 'password-env') ?? 'ADMIN_PASSWORD';
    const password = process.env[varName];
    if (!password) throw new CliError(`Set the password in the environment variable ${varName}`);
    const policy = passwordPolicyError(password, email, { admin: true });
    if (policy) throw new CliError(`The password is not acceptable for an admin (${policy}); use at least 12 characters`);
    const hash = await createPasswordHasher({ N: config.scryptN, p: config.scryptP }).hash(password);
    const u = tx(db, () => {
      const created = createAccount(db, { email, passwordHash: hash, role: 'admin', now });
      writeAudit(db, { at: now, actor: CLI_ACTOR, action: 'admin.bootstrap', target: userTarget(created), details: { created: true } });
      return created;
    });
    print(`Created admin ${u.public_id}`);
    return;
  }
  if (existing.role === 'admin') {
    print(`${existing.public_id} is already an admin`);
    return;
  }
  tx(db, () => {
    run(db, "UPDATE users SET role = 'admin', updated_at = ? WHERE id = ?", now, existing.id);
    writeAudit(db, { at: now, actor: CLI_ACTOR, action: 'user.role', target: userTarget(existing), details: { before: existing.role, after: 'admin' } });
  });
  print(`${existing.public_id} is now an admin`);
}

function removeAdmin(db: Db, args: Args): void {
  const email = emailArg(args, 1);
  const user = getUserByEmail(db, email);
  if (!user) throw new CliError(`No account with ${email}`);
  if (user.role !== 'admin') {
    print(`${user.public_id} is not an admin`);
    return;
  }
  const now = systemClock.now();
  tx(db, () => {
    if (user.status === 'active' && countActiveAdmins(db) <= 1) throw new CliError('This is the only admin; make someone else admin first');
    run(db, "UPDATE users SET role = 'user', updated_at = ? WHERE id = ?", now, user.id);
    writeAudit(db, { at: now, actor: CLI_ACTOR, action: 'user.role', target: userTarget(user), details: { before: 'admin', after: 'user' } });
  });
  print(`${user.public_id} is no longer an admin`);
}

function grant(db: Db, config: Config, args: Args): void {
  const user = userArg(db, args.positional[1]);
  const plan = args.positional[2];
  if (plan !== 'monthly' && plan !== 'yearly' && plan !== 'lifetime') throw new CliError('The plan must be monthly, yearly or lifetime');
  const reason = (flag(args, 'reason') ?? '').replace(/\s+/g, ' ').trim();
  if ([...reason].length < 3 || [...reason].length > 500) throw new CliError('--reason="…" is required (3–500 characters)');
  const daysFlag = flag(args, 'days');
  if (plan === 'lifetime' && daysFlag !== undefined) throw new CliError('A lifetime grant takes no --days');
  const days = plan === 'lifetime' ? null : daysFlag === undefined ? DEFAULT_GRANT_DAYS[plan] : Number(daysFlag);
  if (days !== null && (!Number.isSafeInteger(days) || days < 1 || days > MAX_GRANT_DAYS)) throw new CliError(`--days must be 1–${MAX_GRANT_DAYS}`);
  if (user.status === 'merged') throw new CliError('This guest was merged into another account; grant to that account');
  const now = systemClock.now();
  const g = tx(db, () => {
    const row = insertGrant(db, { userId: user.id, plan, source: 'admin', endsAt: days === null ? null : now + days * DAY, reason, createdBy: null, now });
    recomputePlan(db, user.id, now, { sandboxGrantsPro: config.storeSandboxGrantsPro });
    writeAudit(db, {
      at: now, actor: CLI_ACTOR, action: 'grant.create', target: { type: 'grant', id: row.id, userId: user.id, label: user.public_id },
      details: { grantId: row.id, plan, endsAt: isoOrNull(row.ends_at), reason },
    });
    return row;
  });
  print(`Granted ${plan} to ${user.public_id} (grant ${g.id}, ${g.ends_at === null ? 'lifetime' : `until ${iso(g.ends_at)}`})`);
}

function backup(db: Db, config: Config, args: Args): void {
  const out = flag(args, 'out');
  if (out) {
    const target = resolve(out);
    if (existsSync(target)) throw new CliError(`${target} exists already`);
    print(`Backup written to ${writeBackup(db, target)}`);
    return;
  }
  const r = runBackup(db, { dir: config.backupDir, now: systemClock.now(), keepDaily: config.backupKeepDaily, keepWeekly: config.backupKeepWeekly });
  print(`Backup written to ${r.file}${r.removed.length ? ` (rotated out: ${r.removed.join(', ')})` : ''}`);
}

/**
 * After restoring a backup (4.11): re-applies the user.delete entries newer than --since from the
 * audit log of the newer database (the one the backup replaced).
 */
function reapplyDeletions(db: Db, args: Args): void {
  const sinceFlag = flag(args, 'since');
  const from = flag(args, 'from');
  const since = sinceFlag ? parseIsoDate(sinceFlag) : null;
  if (since === null) throw new CliError('--since=ISO is required (the time of the backup)');
  if (!from || !existsSync(from)) throw new CliError('--from=<newer db file> is required and must exist');
  const source = new DatabaseSync(resolve(from), { readOnly: true });
  let entries: Array<{ target_id: string | null; target_label: string | null; details: string }>;
  try {
    entries = source
      .prepare("SELECT target_id, target_label, details FROM audit_log WHERE action = 'user.delete' AND at >= ? ORDER BY id")
      .all(since) as typeof entries;
  } finally {
    source.close();
  }
  const now = systemClock.now();
  let deleted = 0;
  for (const e of entries) {
    const user = (e.target_id ? getUser(db, e.target_id) : undefined) ?? (e.target_label ? getUserByPublicId(db, e.target_label) : undefined);
    if (!user) continue;
    let by: 'self' | 'admin' = 'admin';
    try {
      by = (JSON.parse(e.details) as { by?: string }).by === 'self' ? 'self' : 'admin';
    } catch {
      by = 'admin';
    }
    tx(db, () => deleteUser(db, user.id, { by, reason: 'Re-applied after a restore', actor: CLI_ACTOR, now }));
    deleted++;
  }
  print(`Re-applied ${deleted} deletion(s) of ${entries.length} found since ${iso(since)}`);
}

async function main(argv: readonly string[]): Promise<number> {
  const args = parseArgs(argv);
  const command = args.positional[0];
  if (!command || command === 'help' || args.flags.has('help')) {
    print(USAGE);
    return command ? 0 : 1;
  }
  let config: Config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) throw new CliError(err.message);
    throw err;
  }
  const log = createLogger({ level: config.logLevel === 'debug' ? 'debug' : 'warn' });
  const db = openDatabase(config.databasePath);
  try {
    if (command === 'migrate' && args.flags.has('status')) {
      const s = migrationStatus(db);
      print({ current: s.current, latest: s.latest, pending: s.pending.map((m) => m.name) });
      return 0;
    }
    const m = migrate(db, { backupDir: config.backupDir, now: systemClock.now(), log });
    switch (command) {
      case 'migrate':
        print({ from: m.from, to: m.to, applied: m.applied, backups: m.backups });
        return 0;
      case 'seed':
        await seed(db, config, args);
        return 0;
      case 'make-admin':
        await makeAdmin(db, config, args);
        return 0;
      case 'remove-admin':
        removeAdmin(db, args);
        return 0;
      case 'grant':
        grant(db, config, args);
        return 0;
      case 'backup':
        backup(db, config, args);
        return 0;
      case 'prune':
        print(prune(db, systemClock.now()));
        return 0;
      case 'reapply-deletions':
        reapplyDeletions(db, args);
        return 0;
      case 'stats':
        print(buildDashboard(db, { now: systemClock.now(), days: 30, webhookConfigured: config.revenuecatWebhookSecret !== null }));
        return 0;
      default:
        throw new CliError(`Unknown command: ${command}\n${USAGE}`);
    }
  } finally {
    closeDatabase(db);
  }
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err: unknown) => {
    process.stderr.write(`${err instanceof CliError ? err.message : err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
    process.exit(1);
  },
);
