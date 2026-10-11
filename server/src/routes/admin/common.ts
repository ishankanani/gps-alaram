/**
 * Helpers for the admin routes (spec 2.10, 4.5, 4.6): the acting admin, audit rows with the IP and
 * request id, the target user from `:id`, and query-string validation.
 */
import type { RequestContext } from '../../context.ts';
import { authOf } from '../../context.ts';
import { writeAudit, type AuditActor, type AuditWrite } from '../../domain/audit.ts';
import { findUserByRef } from '../../domain/admin-users.ts';
import type { UserRow } from '../../domain/users.ts';
import { ApiError, notFound } from '../../http/errors.ts';
import { Fields } from '../../http/validate.ts';

/** `:id` of /v1/admin/users/:id after decoding: a UUID or a public id in any accepted form. */
export const USER_REF_PARAM = /^[A-Za-z0-9 _.-]{1,64}$/;
export const ROWID_PARAM = /^[1-9]\d{0,15}$/;

export function adminActor(ctx: RequestContext): AuditActor {
  const { user } = authOf(ctx);
  return { id: user.id, label: user.public_id };
}

/** Writes the one audit row of an admin mutation (call inside the mutation's transaction). */
export function audit(ctx: RequestContext, entry: Omit<AuditWrite, 'at' | 'actor' | 'ip' | 'requestId'>): number {
  return writeAudit(ctx.app.db, { ...entry, at: ctx.now, actor: adminActor(ctx), ip: ctx.ip, requestId: ctx.requestId });
}

export const userTarget = (u: Pick<UserRow, 'id' | 'public_id'>): NonNullable<AuditWrite['target']> => ({
  type: 'user', id: u.id, userId: u.id, label: u.public_id,
});

/** The user named by `:id`, or 404. */
export function targetUser(ctx: RequestContext, param = 'id'): UserRow {
  const ref = ctx.params[param];
  const user = ref ? findUserByRef(ctx.app.db, ref) : undefined;
  if (!user) throw notFound();
  return user;
}

/** Merged guests are empty shells kept for 30 days; only notes and deletion apply to them. */
export function requireNotMerged(user: UserRow): void {
  if (user.status === 'merged') {
    throw new ApiError(409, 'not_an_account', 'This guest was merged into another account; act on that account instead');
  }
}

export function notSelf(ctx: RequestContext, user: UserRow): void {
  if (authOf(ctx).user.id === user.id) throw new ApiError(409, 'cannot_target_self', 'Admins cannot do this to their own account');
}

/** Integer query parameter within [min, max]; absent → def; invalid → a field error. */
export function queryInt(v: Fields, q: URLSearchParams, key: string, opts: { min: number; max: number; def: number }): number {
  const raw = q.get(key);
  if (raw === null || raw === '') return opts.def;
  if (!/^\d{1,16}$/.test(raw)) {
    v.add(key, 'invalid');
    return opts.def;
  }
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < opts.min || n > opts.max) {
    v.add(key, 'out_of_range');
    return opts.def;
  }
  return n;
}

/** Enum query parameter; absent or empty → null. */
export function queryEnum<T extends string>(v: Fields, q: URLSearchParams, key: string, values: readonly T[]): T | null {
  const raw = q.get(key);
  if (raw === null || raw === '') return null;
  if (!(values as readonly string[]).includes(raw)) {
    v.add(key, 'invalid');
    return null;
  }
  return raw as T;
}

/** Free-text query parameter (≤ max characters, no control characters); absent or blank → null. */
export function queryText(v: Fields, q: URLSearchParams, key: string, max: number): string | null {
  const raw = q.get(key);
  if (raw === null) return null;
  const s = raw.normalize('NFC').trim();
  if (s === '') return null;
   
  if ([...s].length > max || /[\u0000-\u001F\u007F]/.test(s)) {
    v.add(key, [...s].length > max ? 'too_long' : 'invalid');
    return null;
  }
  return s;
}

/** Offset pagination (2.1): limit 1–100 (default 25), offset 0–100000. */
export function pageOf(v: Fields, q: URLSearchParams): { limit: number; offset: number } {
  return {
    limit: queryInt(v, q, 'limit', { min: 1, max: 100, def: 25 }),
    offset: queryInt(v, q, 'offset', { min: 0, max: 100_000, def: 0 }),
  };
}

export { Fields };
