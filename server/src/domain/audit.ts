/**
 * Audit log (spec 4.6): one row per admin mutation (plus bootstrap, merges and self-deletion),
 * written in the same transaction as the change. Append-only, enforced by a trigger; the only
 * permitted update is the GDPR scrub (4.10).
 *
 * `details` never contains email addresses, passwords, reset codes, tokens or note bodies. Callers
 * pass only ids, plans, dates and reasons; as a safety net every string in `details` has email
 * addresses masked and tokens removed before it is stored (a reason an admin typed may contain one).
 */
import type { AuditAction, AuditEntry } from '../../../src/api/types.ts';
import { iso } from '../clock.ts';
import { many, one, run, placeholders, type Db, type Param } from '../db/database.ts';
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

type AuditRowWithActor = AuditRow & { actor_display_name: string | null };

function parseDetails(text: string): Record<string, unknown> {
  try {
    const v = JSON.parse(text) as unknown;
    return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function toAuditEntry(row: AuditRowWithActor): AuditEntry {
  return {
    id: row.id,
    at: iso(row.at),
    actor: { id: row.actor_id, label: row.actor_label, displayName: row.actor_display_name },
    action: row.action,
    target: { type: row.target_type, id: row.target_id, label: row.target_label },
    userId: row.target_user_id,
    details: parseDetails(row.details),
    ip: row.ip,
  };
}

const AUDIT_SELECT = 'SELECT a.*, u.display_name AS actor_display_name FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id';

export const escapeLike = (s: string): string => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export type AuditQuery = {
  /** Prefix match, e.g. `grant.` */
  action?: string | null;
  /** users.id of the actor and/or its label (a public id, or env / cli / system). */
  actorId?: string | null;
  actorLabel?: string | null;
  /** target_user_id and/or the target label (the public id, for users that no longer exist). */
  userId?: string | null;
  userLabel?: string | null;
  before?: number | null;
  limit: number;
};

/** Newest first, cursor paging by id: { items, nextBefore }. */
export function listAudit(db: Db, q: AuditQuery): { items: AuditEntry[]; nextBefore: number | null } {
  const where: string[] = [];
  const params: Param[] = [];
  if (q.action) {
    where.push("a.action LIKE ? ESCAPE '\\'");
    params.push(`${escapeLike(q.action)}%`);
  }
  if (q.actorId || q.actorLabel) {
    const parts: string[] = [];
    if (q.actorId) {
      parts.push('a.actor_id = ?');
      params.push(q.actorId);
    }
    if (q.actorLabel) {
      parts.push('a.actor_label = ?');
      params.push(q.actorLabel);
    }
    where.push(`(${parts.join(' OR ')})`);
  }
  if (q.userId || q.userLabel) {
    const parts: string[] = [];
    if (q.userId) {
      parts.push('a.target_user_id = ?');
      params.push(q.userId);
    }
    if (q.userLabel) {
      parts.push("(a.target_type = 'user' AND a.target_label = ?)");
      params.push(q.userLabel);
    }
    where.push(`(${parts.join(' OR ')})`);
  }
  if (q.before !== undefined && q.before !== null) {
    where.push('a.id < ?');
    params.push(q.before);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = many<AuditRowWithActor>(db, `${AUDIT_SELECT} ${clause} ORDER BY a.id DESC LIMIT ?`, ...params, q.limit);
  const items = rows.map(toAuditEntry);
  return { items, nextBefore: rows.length === q.limit ? (rows.at(-1)?.id ?? null) : null };
}

/** Latest entries about one user (admin user detail: 20). */
export const auditEntriesForUser = (db: Db, userId: string, limit = 20): AuditEntry[] =>
  many<AuditRowWithActor>(db, `${AUDIT_SELECT} WHERE a.target_user_id = ? ORDER BY a.id DESC LIMIT ?`, userId, limit).map(toAuditEntry);

/** Latest entries overall (dashboard: 10). */
export const recentAuditEntries = (db: Db, limit = 10): AuditEntry[] =>
  many<AuditRowWithActor>(db, `${AUDIT_SELECT} ORDER BY a.id DESC LIMIT ?`, limit).map(toAuditEntry);

export const getAuditRow = (db: Db, id: number): AuditRow | undefined => one<AuditRow>(db, 'SELECT * FROM audit_log WHERE id = ?', id);
