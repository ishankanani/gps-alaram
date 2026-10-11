/**
 * Admin views of users (spec 2.10): list items, the detail, and the user search with its filters,
 * sorts and offset pagination. ORDER BY columns come from a whitelist map, never from the raw
 * parameter; every value is a bound parameter.
 */
import type { AdminUser, AdminUserDetail, AdminUserListItem, PlanSource } from '../../../src/api/types.ts';
import { iso, isoOrNull } from '../clock.ts';
import { many, one, usedParams, type Db, type NamedParams } from '../db/database.ts';
import { auditEntriesForUser, escapeLike } from './audit.ts';
import { adminDevicesOf } from './devices.ts';
import { grantIdsOfUser, toAdminGrant } from './grants.ts';
import { CROCKFORD, normalizePublicId } from './ids.ts';
import { notesOfUser, toAdminNote } from './notes.ts';
import { effectivePlan, isProAt, LIFETIME_UNTIL, type PlanOptions } from './plans.ts';
import { redemptionsOfUser } from './promo.ts';
import { listStoreEvents, storeSubscriptionsOf, toAdminStoreSubscription } from './store.ts';
import { adminRef, getUser, getUserByPublicId, type UserRow } from './users.ts';

const UUID_ANY_CASE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `:id` in /v1/admin/users/:id: the internal UUID or a public id in any form normalization accepts. */
export function findUserByRef(db: Db, ref: string): UserRow | undefined {
  if (UUID_ANY_CASE.test(ref)) return getUser(db, ref.toLowerCase());
  const publicId = normalizePublicId(ref);
  return publicId ? getUserByPublicId(db, publicId) : undefined;
}

type ListRow = UserRow & { notes_count: number };

export function toAdminListItem(row: UserRow, notesCount: number, now: number): AdminUserListItem {
  const pro = isProAt(row, now) && row.plan !== 'free';
  return {
    id: row.id,
    publicId: row.public_id,
    kind: row.email === null ? 'guest' : 'account',
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    status: row.status,
    country: row.country,
    language: row.language,
    plan: pro ? row.plan : 'free',
    planSource: pro ? row.plan_source : null,
    planExpiresAt: pro && row.plan_until !== null && row.plan_until < LIFETIME_UNTIL ? iso(row.plan_until) : null,
    willRenew: pro && row.plan_will_renew === 1,
    trial: pro && row.plan_trial === 1,
    createdAt: iso(row.created_at),
    lastSeenAt: isoOrNull(row.last_seen_at),
    notesCount,
  };
}

export function toAdminUser(db: Db, row: UserRow, now: number): AdminUser {
  const notes = one<{ n: number }>(db, 'SELECT count(*) AS n FROM notes WHERE user_id = ?', row.id)?.n ?? 0;
  const sessions = one<{ n: number }>(db, 'SELECT count(*) AS n FROM sessions WHERE user_id = ? AND expires_at > ?', row.id, now)?.n ?? 0;
  return {
    ...toAdminListItem(row, notes, now),
    emailVerified: row.email_verified_at !== null,
    signedUpAt: isoOrNull(row.signed_up_at),
    disabledAt: isoOrNull(row.disabled_at),
    disabledReason: row.disabled_reason,
    mergedInto: adminRef(db, row.merged_into),
    passwordSet: row.password_hash !== null,
    activeSessions: sessions,
  };
}

export function adminUserDetail(db: Db, row: UserRow, now: number, opts: PlanOptions & { cacheDays: number }): AdminUserDetail {
  return {
    user: toAdminUser(db, row, now),
    plan: effectivePlan(db, row, now, opts),
    grants: grantIdsOfUser(db, row.id).map((id) => toAdminGrant(db, id, now)),
    storeSubscriptions: storeSubscriptionsOf(db, row.id).map((s) => toAdminStoreSubscription(s, now)),
    devices: adminDevicesOf(db, row.id, now),
    redemptions: redemptionsOfUser(db, row.id, now),
    notes: notesOfUser(db, row.id).map((n) => toAdminNote(db, n)),
    audit: auditEntriesForUser(db, row.id, 20),
    storeEvents: listStoreEvents(db, { userId: row.id, limit: 10 }).items,
  };
}

// ---- Search ----

export const USER_SORTS = ['created', 'lastSeen', 'email', 'planUntil', 'publicId'] as const;
export type UserSort = (typeof USER_SORTS)[number];
export const USER_PLAN_FILTERS = ['free', 'pro', 'trial', 'monthly', 'yearly', 'lifetime'] as const;

export type UserListQuery = {
  q: string | null;
  plan: (typeof USER_PLAN_FILTERS)[number] | null;
  source: PlanSource | null;
  kind: 'guest' | 'account' | null;
  role: 'user' | 'admin' | null;
  status: 'active' | 'disabled' | 'merged' | null;
  country: string | null;
  sort: UserSort;
  order: 'asc' | 'desc';
  limit: number;
  offset: number;
};

const SORT_SQL: Record<UserSort, string> = {
  created: 'u.created_at',
  lastSeen: 'u.last_seen_at',
  email: 'u.email',
  // The effective end: NULL (free) sorts lowest.
  planUntil: "(CASE WHEN u.status = 'active' AND u.plan_until > :now THEN u.plan_until END)",
  publicId: 'u.public_id',
};

const CROCKFORD_SET = new Set(CROCKFORD);
const crockfordBody = (s: string): string =>
  s.normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');

/**
 * The public-id part of a search (rule 3): `sw…` followed by 4–8 Crockford characters gives a
 * prefix (`SW-7K3P-9%`); exactly 8 Crockford characters (optional middle dash) give a full id.
 */
export function publicIdSearch(q: string): { pattern: string; bare: boolean } | null {
  const trimmed = q.trim();
  if (/^sw[\s-]*[0-9a-z][0-9a-z\s-]*$/i.test(trimmed)) {
    const body = crockfordBody(trimmed).slice(2);
    if (body.length >= 4 && body.length <= 8 && [...body].every((c) => CROCKFORD_SET.has(c))) {
      const pattern = `SW-${body.slice(0, 4)}${body.length > 4 ? `-${body.slice(4)}` : ''}`;
      return { pattern: body.length === 8 ? pattern : `${pattern}%`, bare: false };
    }
  }
  if (/^[0-9a-z]{4}-?[0-9a-z]{4}$/i.test(trimmed)) {
    const id = normalizePublicId(trimmed);
    if (id) return { pattern: id, bare: true };
  }
  return null;
}

export function listAdminUsers(db: Db, query: UserListQuery, now: number): { items: AdminUserListItem[]; total: number } {
  const where: string[] = [];
  const params: NamedParams = {};
  const pro = "(u.status = 'active' AND u.plan_until IS NOT NULL AND u.plan_until > :now)";

  if (query.status) {
    where.push('u.status = :status');
    params.status = query.status;
  } else {
    where.push("u.status IN ('active', 'disabled')");
  }
  if (query.kind) where.push(query.kind === 'guest' ? 'u.email IS NULL' : 'u.email IS NOT NULL');
  if (query.role) {
    where.push('u.role = :role');
    params.role = query.role;
  }
  if (query.country) {
    where.push('u.country = :country');
    params.country = query.country;
  }
  if (query.plan) {
    if (query.plan === 'pro') where.push(pro);
    else if (query.plan === 'free') where.push(`NOT ${pro}`);
    else if (query.plan === 'trial') where.push(`${pro} AND u.plan_trial = 1`);
    else {
      where.push(`${pro} AND u.plan = :planValue`);
      params.planValue = query.plan;
    }
  }
  if (query.source) {
    where.push(`${pro} AND u.plan_source = :source`);
    params.source = query.source;
  }
  if (query.q) {
    const q = query.q.trim();
    const like = `%${escapeLike(q)}%`;
    const text = "(u.email LIKE :like ESCAPE '\\' OR u.display_name LIKE :like ESCAPE '\\')";
    if (UUID_ANY_CASE.test(q)) {
      where.push('u.id = :qid');
      params.qid = q.toLowerCase();
    } else if (/^gpa\./i.test(q)) {
      where.push("u.id IN (SELECT s.user_id FROM store_subscriptions s WHERE s.original_transaction_id LIKE :gpa ESCAPE '\\')");
      params.gpa = `${escapeLike(q)}%`;
    } else {
      const pid = publicIdSearch(q);
      if (pid) {
        where.push(`(u.public_id LIKE :pid OR ${text})`);
        params.pid = pid.pattern;
        params.like = like;
      } else if (q.includes('@')) {
        where.push("u.email LIKE :like ESCAPE '\\'");
        params.like = like;
      } else {
        where.push(text);
        params.like = like;
      }
    }
  }
  const sortSql = SORT_SQL[query.sort];
  params.now = now;
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const dir = query.order === 'asc' ? 'ASC' : 'DESC';
  const countSql = `SELECT count(*) AS n FROM users u ${clause}`;
  const total = one<{ n: number }>(db, countSql, usedParams(countSql, params))?.n ?? 0;
  const listSql = `SELECT u.*, (SELECT count(*) FROM notes n WHERE n.user_id = u.id) AS notes_count FROM users u ${clause}
     ORDER BY ${sortSql} ${dir}, u.created_at ${dir}, u.id ${dir} LIMIT :limit OFFSET :offset`;
  const rows = many<ListRow>(db, listSql, usedParams(listSql, { ...params, limit: query.limit, offset: query.offset }));
  return { items: rows.map((r) => toAdminListItem(r, r.notes_count, now)), total };
}
