// "Plan now → After" previews for Give Pro, Change plan, Add time and Revoke (ui-critiques: every
// plan action shows what it will do). Mirrors the server's choice of the effective plan
// (backend-spec 3.1 and 3.2): the entitlement that keeps the user Pro the longest wins. Pure.

import type { AdminGrant, AdminStoreSubscription, AdminUserDetail, PaidPlan, PlanSource } from '../../../api/types';
import { formatDate, toDate } from './format';
import type { AdminT } from './text';
import { PLAN_LABEL, SOURCE_LABEL } from './users';

export type Candidate = { plan: PaidPlan; source: PlanSource; end: number; store?: boolean };

const PLAN_RANK: Record<PaidPlan, number> = { lifetime: 3, yearly: 2, monthly: 1 };
const SOURCE_RANK: Record<PlanSource, number> = { store: 3, grant: 2, promo: 1 };

/** Whether a gift counts now: active (not revoked, not expired). */
export function grantCounts(g: AdminGrant, now: number): boolean {
  if (g.status !== 'active' || g.revokedAt) return false;
  const end = toDate(g.endsAt);
  return !end || end.getTime() > now;
}

/** Whether a store subscription gives Pro now (production only; sandbox needs a server flag). */
export function subscriptionCounts(s: AdminStoreSubscription, now: number): boolean {
  if (s.environment !== 'production' || s.status === 'expired' || s.status === 'refunded') return false;
  return subscriptionEnd(s) > now;
}

export function subscriptionEnd(s: AdminStoreSubscription): number {
  if (!s.expiresAt) return Infinity;
  return Math.max(toDate(s.expiresAt)?.getTime() ?? 0, toDate(s.graceUntil)?.getTime() ?? 0);
}

export function grantEnd(g: Pick<AdminGrant, 'endsAt'>): number {
  return g.endsAt ? (toDate(g.endsAt)?.getTime() ?? 0) : Infinity;
}

/** Every entitlement counting now, from the user detail. */
export function candidatesOf(detail: Pick<AdminUserDetail, 'grants' | 'storeSubscriptions'>, now: number): Candidate[] {
  const out: Candidate[] = [];
  for (const g of detail.grants) {
    if (grantCounts(g, now)) out.push({ plan: g.plan, source: g.source === 'admin' ? 'grant' : 'promo', end: grantEnd(g) });
  }
  for (const s of detail.storeSubscriptions) {
    if (subscriptionCounts(s, now)) out.push({ plan: s.plan, source: 'store', end: subscriptionEnd(s), store: true });
  }
  return out;
}

/** The best candidate (latest end, then plan rank, then source rank), or null for Free. */
export function best(candidates: Candidate[]): Candidate | null {
  let winner: Candidate | null = null;
  for (const c of candidates) {
    if (
      !winner ||
      c.end > winner.end ||
      (c.end === winner.end && PLAN_RANK[c.plan] > PLAN_RANK[winner.plan]) ||
      (c.end === winner.end && c.plan === winner.plan && SOURCE_RANK[c.source] > SOURCE_RANK[winner.source])
    ) {
      winner = c;
    }
  }
  return winner;
}

/** "Free", "Pro · Yearly (Google Play) until 25 Mar 2027", "Pro · Lifetime (gift)". */
export function describeCandidate(c: Candidate | null, t: AdminT): string {
  if (!c) return t('admin.plan.free');
  const what = t('admin.preview.what', { plan: t(PLAN_LABEL[c.plan]), source: t(SOURCE_LABEL[c.source]) });
  if (!Number.isFinite(c.end)) return what;
  return t('admin.preview.until', { what, date: formatDate(c.end) });
}

export type Preview = { before: string; after: string; unchanged: boolean };

function preview(current: Candidate | null, next: Candidate | null, disabled: boolean, t: AdminT): Preview {
  const before = disabled ? t('admin.plan.free') : describeCandidate(current, t);
  if (disabled) return { before, after: t('admin.preview.disabled'), unchanged: true };
  const same =
    (current === null && next === null) ||
    (current !== null && next !== null && current.end === next.end && current.plan === next.plan && current.source === next.source);
  if (same && current) {
    return { before, after: t(current.store ? 'admin.preview.unchangedStore' : 'admin.preview.unchanged'), unchanged: true };
  }
  return { before, after: describeCandidate(next, t), unchanged: same };
}

type DetailLike = Pick<AdminUserDetail, 'grants' | 'storeSubscriptions'> & { user: { status: string } };

/** A new, separate gift. */
export function previewGrant(detail: DetailLike, gift: { plan: PaidPlan; end: number }, t: AdminT, now: number): Preview {
  const current = candidatesOf(detail, now);
  const next = best([...current, { plan: gift.plan, source: 'grant', end: gift.end }]);
  return preview(best(current), next, detail.user.status !== 'active', t);
}

/** Change plan: every active gift is revoked, then (unless Free) one new gift. */
export function previewChangePlan(detail: DetailLike, gift: { plan: PaidPlan; end: number } | null, t: AdminT, now: number): Preview {
  const current = candidatesOf(detail, now);
  const kept = current.filter((c) => c.store);
  const next = best(gift ? [...kept, { plan: gift.plan, source: 'grant', end: gift.end }] : kept);
  return preview(best(current), next, detail.user.status !== 'active', t);
}

/** Add time to one gift (its end moves), or a new gift when there is none. */
export function previewExtend(
  detail: DetailLike,
  target: AdminGrant | null,
  newEnd: number,
  plan: PaidPlan,
  t: AdminT,
  now: number,
): Preview {
  const current = candidatesOf(detail, now);
  const others: Candidate[] = [];
  for (const g of detail.grants) {
    if (target && g.id === target.id) continue;
    if (grantCounts(g, now)) others.push({ plan: g.plan, source: g.source === 'admin' ? 'grant' : 'promo', end: grantEnd(g) });
  }
  for (const s of detail.storeSubscriptions) {
    if (subscriptionCounts(s, now)) others.push({ plan: s.plan, source: 'store', end: subscriptionEnd(s), store: true });
  }
  const extended: Candidate = target
    ? { plan: target.plan, source: target.source === 'admin' ? 'grant' : 'promo', end: newEnd }
    : { plan, source: 'grant', end: newEnd };
  return preview(best(current), best([...others, extended]), detail.user.status !== 'active', t);
}

/** Revoking one gift: what is left. */
export function previewRevoke(detail: DetailLike, grantId: number, t: AdminT, now: number): Preview {
  const current = candidatesOf(detail, now);
  const left = candidatesOf({ ...detail, grants: detail.grants.filter((g) => g.id !== grantId) }, now);
  return preview(best(current), best(left), detail.user.status !== 'active', t);
}

/** The active gift Add time extends by default: the non-lifetime one ending last. */
export function latestExtendableGrant(grants: AdminGrant[], now: number): AdminGrant | null {
  let found: AdminGrant | null = null;
  for (const g of grants) {
    if (!grantCounts(g, now) || g.endsAt === null) continue;
    if (!found || grantEnd(g) > grantEnd(found)) found = g;
  }
  return found;
}

/** Whether the user pays through a store right now (the "already pays" banners). */
export function hasActiveStoreSubscription(detail: Pick<AdminUserDetail, 'storeSubscriptions'>, now: number): boolean {
  return detail.storeSubscriptions.some((s) => subscriptionCounts(s, now));
}
