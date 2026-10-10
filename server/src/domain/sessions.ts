/**
 * Sessions (spec 4.2): opaque `sw_…` tokens with 256 random bits, stored only as sha256 (hex).
 * Lookup goes by hash through the unique index. 180 days of inactivity, sliding.
 */
import type { Session } from '../../../src/api/types.ts';
import { DAY, iso } from '../clock.ts';
import { many, one, run, type Db } from '../db/database.ts';
import { newSessionToken, sha256Hex, TOKEN_RE } from './ids.ts';

export type SessionMethod = 'guest' | 'sign_up' | 'sign_in' | 'reset';

export type SessionRow = {
  id: number;
  user_id: string;
  device_id: number | null;
  token_hash: string;
  method: SessionMethod;
  created_at: number;
  last_used_at: number;
  expires_at: number;
};

export const tokenHash = (token: string): string => sha256Hex(token);

export function createSession(
  db: Db,
  input: { userId: string; deviceId: number | null; method: SessionMethod; now: number; days: number },
): { token: string; session: SessionRow } {
  const token = newSessionToken();
  const id = run(
    db,
    `INSERT INTO sessions (user_id, device_id, token_hash, method, created_at, last_used_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    input.userId, input.deviceId, tokenHash(token), input.method, input.now, input.now, input.now + input.days * DAY,
  ).lastInsertRowid;
  return { token, session: one<SessionRow>(db, 'SELECT * FROM sessions WHERE id = ?', id)! };
}

/** The session for a token (expired ones included; the caller checks expiry). */
export function findSessionByToken(db: Db, token: string): SessionRow | undefined {
  if (!TOKEN_RE.test(token)) return undefined;
  return one<SessionRow>(db, 'SELECT * FROM sessions WHERE token_hash = ?', tokenHash(token));
}

export const deleteSession = (db: Db, sessionId: number): number =>
  run(db, 'DELETE FROM sessions WHERE id = ?', sessionId).changes;

/** Deletes the user's sessions, optionally keeping one. Returns the number deleted. */
export function deleteUserSessions(db: Db, userId: string, opts: { exceptId?: number } = {}): number {
  return opts.exceptId === undefined
    ? run(db, 'DELETE FROM sessions WHERE user_id = ?', userId).changes
    : run(db, 'DELETE FROM sessions WHERE user_id = ? AND id != ?', userId, opts.exceptId).changes;
}

/** One installation holds one token at a time: a new session on a device replaces the others there. */
export const deleteDeviceSessions = (db: Db, deviceId: number): number =>
  run(db, 'DELETE FROM sessions WHERE device_id = ?', deviceId).changes;

/** Sliding expiry: last_used_at = now, expires_at = now + SESSION_DAYS. */
export function slideSession(db: Db, sessionId: number, now: number, days: number): void {
  run(db, 'UPDATE sessions SET last_used_at = ?, expires_at = ? WHERE id = ?', now, now + days * DAY, sessionId);
}

export const activeSessionsOfUser = (db: Db, userId: string, now: number): SessionRow[] =>
  many<SessionRow>(db, 'SELECT * FROM sessions WHERE user_id = ? AND expires_at > ? ORDER BY created_at, id', userId, now);

export const toSession = (row: SessionRow): Session => ({ createdAt: iso(row.created_at), expiresAt: iso(row.expires_at) });
