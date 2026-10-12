// Finding users: public-id normalization (backend-spec 1.1), the Users filter chips and sort
// options mapped to GET /v1/admin/users, and the labels of plans and sources. Pure.

import type { AdminUserListItem, PlanId, PlanSource } from '../../../api/types';
import type { AdminKey, AdminT } from './text';

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(text: string): boolean {
  return UUID.test(text.trim());
}

/** "sw 7k3p 92qx", "SW7K3P92QX" and "7K3P-92QX" → "SW-7K3P-92QX"; anything else → null. */
export function normalizePublicId(input: string): string | null {
  let s = input.normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]/g, '');
  s = s.replace(/O/g, '0').replace(/[IL]/g, '1');
  if (s.length === 10 && s.startsWith('SW')) s = s.slice(2);
  if (s.length !== 8 || [...s].some((c) => !CROCKFORD.includes(c))) return null;
  return `SW-${s.slice(0, 4)}-${s.slice(4)}`;
}

/**
 * What a search box entry points at directly: an internal id, or a complete public id typed as one
 * (with the SW prefix or as XXXX-XXXX). Names like "swantje" never match.
 */
export function directUserRef(query: string): string | null {
  const q = query.trim();
  if (isUuid(q)) return q.toLowerCase();
  const compact = q.replace(/[\s-]/g, '');
  const looksLikeId = /^sw/i.test(compact) ? compact.length === 10 : /^[0-9A-Za-z]{4}-[0-9A-Za-z]{4}$/.test(q);
  return looksLikeId ? normalizePublicId(q) : null;
}

export type UserFilter = 'all' | 'pro' | 'trial' | 'free' | 'accounts' | 'guests' | 'admins' | 'disabled';

export const USER_FILTERS: readonly UserFilter[] = ['all', 'pro', 'trial', 'free', 'accounts', 'guests', 'admins', 'disabled'];

export const USER_FILTER_LABEL: Record<UserFilter, AdminKey> = {
  all: 'admin.users.filter.all',
  pro: 'admin.users.filter.pro',
  trial: 'admin.users.filter.trial',
  free: 'admin.users.filter.free',
  accounts: 'admin.users.filter.accounts',
  guests: 'admin.users.filter.guests',
  admins: 'admin.users.filter.admins',
  disabled: 'admin.users.filter.disabled',
};

export type UserSort = 'newest' | 'oldest' | 'lastSeen' | 'email' | 'planUntil' | 'publicId';

export const USER_SORTS: readonly UserSort[] = ['newest', 'oldest', 'lastSeen', 'email', 'planUntil', 'publicId'];

export const USER_SORT_LABEL: Record<UserSort, AdminKey> = {
  newest: 'admin.users.sort.newest',
  oldest: 'admin.users.sort.oldest',
  lastSeen: 'admin.users.sort.lastSeen',
  email: 'admin.users.sort.email',
  planUntil: 'admin.users.sort.planUntil',
  publicId: 'admin.users.sort.publicId',
};

export type SourceFilter = 'any' | PlanSource;
export const SOURCE_FILTERS: readonly SourceFilter[] = ['any', 'store', 'grant', 'promo'];

export type UserQuery = {
  q?: string;
  plan?: 'free' | 'pro' | 'trial' | 'monthly' | 'yearly' | 'lifetime';
  source?: PlanSource;
  kind?: 'guest' | 'account';
  role?: 'user' | 'admin';
  status?: 'active' | 'disabled' | 'merged';
  country?: string;
  sort?: 'created' | 'lastSeen' | 'email' | 'planUntil' | 'publicId';
  order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
};

/** One query per chip (ui-critiques: each Users chip maps to exactly one query). */
export function buildUserQuery(options: {
  filter: UserFilter;
  source: SourceFilter;
  country: string | null;
  sort: UserSort;
  q: string;
}): UserQuery {
  const query: UserQuery = {};
  const q = options.q.trim();
  if (q) query.q = q.slice(0, 100);
  switch (options.filter) {
    case 'pro':
      query.plan = 'pro';
      break;
    case 'trial':
      query.plan = 'trial';
      break;
    case 'free':
      query.plan = 'free';
      break;
    case 'accounts':
      query.kind = 'account';
      break;
    case 'guests':
      query.kind = 'guest';
      break;
    case 'admins':
      query.role = 'admin';
      break;
    case 'disabled':
      query.status = 'disabled';
      break;
    default:
      break;
  }
  // A source implies Pro on the server; Free with a source would always be empty.
  if (options.source !== 'any' && options.filter !== 'free') query.source = options.source;
  if (options.country) query.country = options.country;
  switch (options.sort) {
    case 'oldest':
      Object.assign(query, { sort: 'created', order: 'asc' });
      break;
    case 'lastSeen':
      Object.assign(query, { sort: 'lastSeen', order: 'desc' });
      break;
    case 'email':
      Object.assign(query, { sort: 'email', order: 'asc' });
      break;
    case 'planUntil':
      Object.assign(query, { sort: 'planUntil', order: 'desc' });
      break;
    case 'publicId':
      Object.assign(query, { sort: 'publicId', order: 'asc' });
      break;
    default:
      Object.assign(query, { sort: 'created', order: 'desc' });
  }
  return query;
}

/**
 * The AdminUsers `filter` route param: a chip id, or "country:DE". Unknown values fall back to all.
 */
export function parseFilterParam(param: string | undefined): { filter: UserFilter; country: string | null; source: SourceFilter } {
  if (!param) return { filter: 'all', country: null, source: 'any' };
  if (param.startsWith('country:')) {
    const c = param.slice(8).toUpperCase();
    return { filter: 'all', country: /^[A-Z]{2}$/.test(c) ? c : null, source: 'any' };
  }
  if (param.startsWith('source:')) {
    const s = param.slice(7) as SourceFilter;
    return { filter: 'pro', country: null, source: SOURCE_FILTERS.includes(s) ? s : 'any' };
  }
  return { filter: (USER_FILTERS as readonly string[]).includes(param) ? (param as UserFilter) : 'all', country: null, source: 'any' };
}

export const PLAN_LABEL: Record<PlanId, AdminKey> = {
  free: 'admin.plan.free',
  monthly: 'admin.plan.monthly',
  yearly: 'admin.plan.yearly',
  lifetime: 'admin.plan.lifetime',
};

export const SOURCE_LABEL: Record<PlanSource, AdminKey> = {
  store: 'admin.source.store',
  grant: 'admin.source.grant',
  promo: 'admin.source.promo',
};

/** The row title: email, else name, else "Guest". */
export function userTitle(user: Pick<AdminUserListItem, 'email' | 'displayName' | 'kind'>, t: AdminT): string {
  return user.email ?? user.displayName ?? t('admin.user.guest');
}

/** "Pro · Yearly", "Pro · Lifetime", "Free". */
export function planName(plan: PlanId, t: AdminT): string {
  return plan === 'free' ? t('admin.plan.free') : t('admin.plan.pro', { plan: t(PLAN_LABEL[plan]) });
}
