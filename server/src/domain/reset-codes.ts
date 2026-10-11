/**
 * Password reset codes (spec 1.1, 2.6, 4.2): XXXX-XXXX (40 bits), stored only as
 * sha256(userId + ":" + normalizedCode). Single use, at most 5 attempts, valid 30 min (email) or
 * 60 min (admin). A new code replaces the user's older unused codes.
 */
import { MINUTE } from '../clock.ts';
import { one, run, type Db } from '../db/database.ts';
import { hexEqual, newResetCode, normalizeResetCode, resetCodeHash } from './ids.ts';

export const RESET_CODE_TTL = { email: 30 * MINUTE, admin: 60 * MINUTE } as const;
export const RESET_MAX_ATTEMPTS = 5;

export type ResetTokenRow = {
  id: number;
  user_id: string;
  code_hash: string;
  via: 'email' | 'admin';
  created_by: string | null;
  attempts: number;
  created_at: number;
  expires_at: number;
  used_at: number | null;
};

/** Replaces the user's unused codes with a new one. Returns the code as shown to people. */
export function issueResetCode(
  db: Db,
  input: { userId: string; via: 'email' | 'admin'; createdBy: string | null; now: number },
): { code: string; expiresAt: number } {
  const code = newResetCode();
  const expiresAt = input.now + RESET_CODE_TTL[input.via];
  run(db, 'DELETE FROM password_reset_tokens WHERE user_id = ? AND used_at IS NULL', input.userId);
  run(
    db,
    `INSERT INTO password_reset_tokens (user_id, code_hash, via, created_by, attempts, created_at, expires_at)
     VALUES (?, ?, ?, ?, 0, ?, ?)`,
    input.userId, resetCodeHash(input.userId, normalizeResetCode(code)!), input.via, input.createdBy, input.now, expiresAt,
  );
  return { code, expiresAt };
}

/** The newest unused, unexpired code of a user. */
export const newestResetToken = (db: Db, userId: string, now: number): ResetTokenRow | undefined =>
  one<ResetTokenRow>(
    db,
    'SELECT * FROM password_reset_tokens WHERE user_id = ? AND used_at IS NULL AND expires_at > ? ORDER BY created_at DESC, id DESC LIMIT 1',
    userId, now,
  );

const DUMMY_USER = '00000000-0000-4000-8000-000000000000';
const DUMMY_HASH = resetCodeHash(DUMMY_USER, 'ZZZZZZZZ');

/** Constant-time check of a typed code against a token (a malformed code never matches). */
export function resetCodeMatches(token: Pick<ResetTokenRow, 'user_id' | 'code_hash'> | null, typed: string): boolean {
  const normalized = normalizeResetCode(typed);
  if (!token) {
    // Equivalent work when there is no account or no code.
    hexEqual(resetCodeHash(DUMMY_USER, normalized ?? ''), DUMMY_HASH);
    return false;
  }
  const same = hexEqual(resetCodeHash(token.user_id, normalized ?? ''), token.code_hash);
  return same && normalized !== null;
}

/** Counts a wrong attempt (never above the maximum). */
export const countResetAttempt = (db: Db, tokenId: number): void => {
  run(db, 'UPDATE password_reset_tokens SET attempts = attempts + 1 WHERE id = ? AND attempts < ?', tokenId, RESET_MAX_ATTEMPTS);
};
