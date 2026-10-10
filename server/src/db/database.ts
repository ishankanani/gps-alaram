/**
 * SQLite through node:sqlite (spec 1.4): one file in WAL mode, prepared statements only.
 *
 * node:sqlite is synchronous, so a transaction without awaits cannot interleave with another
 * request. tx() enforces that: its callback must not return a promise. Password hashing and
 * outbound HTTP happen before or after a transaction, never inside it.
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';

export type Db = DatabaseSync;
export type Param = SQLInputValue;
export type NamedParams = Record<string, Param>;
type Params = Param[] | [NamedParams];

export function openDatabase(path: string): Db {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path, { enableForeignKeyConstraints: true, timeout: 5000 });
  db.exec(
    'PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON; ' +
      'PRAGMA temp_store = MEMORY; PRAGMA trusted_schema = OFF;',
  );
  return db;
}

/** Runs PRAGMA optimize and checkpoints the WAL, then closes (shutdown, spec 1.4). */
export function closeDatabase(db: Db): void {
  if (!db.isOpen) return;
  try {
    db.exec('PRAGMA optimize');
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  } finally {
    statementCache.delete(db);
    db.close();
  }
}

const statementCache = new WeakMap<Db, Map<string, StatementSync>>();

/** A cached prepared statement for this connection. */
export function stmt(db: Db, sql: string): StatementSync {
  let cache = statementCache.get(db);
  if (!cache) {
    cache = new Map();
    statementCache.set(db, cache);
  }
  let s = cache.get(sql);
  if (!s) {
    s = db.prepare(sql);
    if (cache.size > 500) cache.clear();
    cache.set(sql, s);
  }
  return s;
}

type Runner = (...args: unknown[]) => unknown;

/** First row or undefined. Params are positional values or one object of named values. */
export function one<T>(db: Db, sql: string, ...params: Params): T | undefined {
  return (stmt(db, sql).get as Runner)(...params) as T | undefined;
}

export function many<T>(db: Db, sql: string, ...params: Params): T[] {
  return (stmt(db, sql).all as Runner)(...params) as T[];
}

export function run(db: Db, sql: string, ...params: Params): { changes: number; lastInsertRowid: number } {
  const r = (stmt(db, sql).run as Runner)(...params) as { changes: number | bigint; lastInsertRowid: number | bigint };
  return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) };
}

/** `?, ?, ?` for an IN list. */
export const placeholders = (n: number): string => Array.from({ length: n }, () => '?').join(', ');

let savepointSeq = 0;

function assertSync(result: unknown): void {
  if (result !== null && typeof result === 'object' && typeof (result as { then?: unknown }).then === 'function') {
    throw new Error('tx() callbacks must be synchronous: never await inside a transaction');
  }
}

/**
 * BEGIN IMMEDIATE … COMMIT, or ROLLBACK when fn throws. Nested calls use a savepoint, so an inner
 * failure that the outer code catches only undoes the inner part.
 */
export function tx<T>(db: Db, fn: () => T): T {
  if (db.isTransaction) {
    const name = `sp_${++savepointSeq}`;
    db.exec(`SAVEPOINT ${name}`);
    try {
      const result = fn();
      assertSync(result);
      db.exec(`RELEASE ${name}`);
      return result;
    } catch (err) {
      db.exec(`ROLLBACK TO ${name}`);
      db.exec(`RELEASE ${name}`);
      throw err;
    }
  }
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    assertSync(result);
    db.exec('COMMIT');
    return result;
  } catch (err) {
    if (db.isTransaction) db.exec('ROLLBACK');
    throw err;
  }
}

/** True for a UNIQUE (or PRIMARY KEY) violation, optionally on a given `table.column`. */
export function isUniqueViolation(err: unknown, column?: string): boolean {
  if (!(err instanceof Error)) return false;
  const e = err as Error & { errcode?: number };
  const unique = e.errcode === 2067 || e.errcode === 1555 || /UNIQUE constraint failed/.test(e.message);
  return unique && (column === undefined || e.message.includes(column));
}
