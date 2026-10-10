/**
 * Audit log (spec 4.6): one row per admin mutation (plus bootstrap, merges and self-deletion),
 * written in the same transaction as the change. Append-only, enforced by a trigger; the only
 * permitted update is the GDPR scrub (4.10).
 *
 * `details` never contains email addresses, passwords, reset codes, tokens or note bodies. Callers
 * pass only ids, plans, dates and reasons; as a safety net every string in `details` has email
 * addresses masked and tokens removed before it is stored (a reason an admin typed may contain one).
 */
import type { AuditAction } from '../../../src/api/types.ts';
import { many, run, placeholders, type Db } from '../db/database.ts';
import { scrubText } from '../log.ts';

export type AuditTargetType = 'user' | 'grant' | 'promo_code' | 'price' | 'settings' | 'note' | 'store_event';

/** label: the admin's or user's public id, or 'env' (bootstrap), 'cli' or 'system' (merges). */
export type AuditActor = { id: string | null; label: string };

export const SYSTEM_ACTOR: AuditActor = { id: null, label: 'system' };
export const ENV_ACTOR: AuditActor = { id: null, label: 'env' };
export const CLI_ACTOR: AuditActor = { id: null, label: 'cli' };

export type AuditWrite = {
  at: number;
  actor: AuditActor;
  action: AuditAction;
  target?: { type: AuditTargetType; id?: string | number | null; userId?: string | null; label?: string | null };
  details?: Record<string, unknown>;
  /** Recorded for admin requests only. */
  ip?: string | null;
  requestId?: string | null;
};

function scrubDeep(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return scrubText(value);
  if (value === null || typeof value !== 'object' || depth > 6) return value;
  if (Array.isArray(value)) return value.map((v) => scrubDeep(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) out[k] = scrubDeep(v, depth + 1);
  return out;
}

export function writeAudit(db: Db, entry: AuditWrite): number {
  const details = JSON.stringify(scrubDeep(entry.details ?? {}));
  const t = entry.target;
  return run(
    db,
    `INSERT INTO audit_log (at, actor_id, actor_label, action, target_type, target_id, target_user_id, target_label, details, ip, request_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    entry.at,
    entry.actor.id,
    entry.actor.label,
    entry.action,
    t?.type ?? null,
    t?.id === undefined || t.id === null ? null : String(t.id),
    t?.userId ?? null,
    t?.label ?? null,
    details,
    entry.ip ?? null,
    entry.requestId ?? null,
  ).lastInsertRowid;
}

export const SCRUBBED = '{"scrubbed":true}';

/** GDPR scrub (4.10): replaces details on every row about these users. */
export function scrubAuditForUsers(db: Db, userIds: readonly string[]): number {
  if (userIds.length === 0) return 0;
  return run(
    db,
    `UPDATE audit_log SET details = '${SCRUBBED}' WHERE target_user_id IN (${placeholders(userIds.length)}) AND details != '${SCRUBBED}'`,
    ...userIds,
  ).changes;
}

export type AuditRow = {
  id: number;
  at: number;
  actor_id: string | null;
  actor_label: string;
  action: AuditAction;
  target_type: AuditTargetType | null;
  target_id: string | null;
  target_user_id: string | null;
  target_label: string | null;
  details: string;
  ip: string | null;
  request_id: string | null;
};

/** Rows about one user, newest first (tests and the admin detail). */
export function auditForUser(db: Db, userId: string, limit = 20): AuditRow[] {
  return many<AuditRow>(db, 'SELECT * FROM audit_log WHERE target_user_id = ? ORDER BY id DESC LIMIT ?', userId, limit);
}
