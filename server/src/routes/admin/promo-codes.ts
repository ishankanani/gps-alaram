/**
 * Admin promo codes (spec 2.10, 3.4): list with derived status, create (custom or generated),
 * detail with the newest 100 redemptions, update (plan and duration are frozen once redeemed),
 * delete (unused codes only).
 */
import type { AppRoute, RequestContext } from '../../context.ts';
import { authOf } from '../../context.ts';
import { tx } from '../../db/database.ts';
import {
  createPromo, deletePromo, getPromo, listPromos, PROMO_STATUSES, promoAuditView, redemptionsOfPromo, toPromoCode, updatePromo,
  validatePromoInput, type PromoStatus,
} from '../../domain/promo.ts';
import { notFound } from '../../http/errors.ts';
import { json, noContent, type Reply } from '../../http/response.ts';
import { route } from '../../http/router.ts';
import { audit, Fields, pageOf, queryEnum, queryText, ROWID_PARAM } from './common.ts';

const target = (p: { id: number; code: string }) => ({ type: 'promo_code' as const, id: p.id, label: p.code });

function list(ctx: RequestContext): Reply {
  const v = new Fields();
  const status = queryEnum<PromoStatus | 'all'>(v, ctx.query, 'status', [...PROMO_STATUSES, 'all']) ?? 'all';
  const q = queryText(v, ctx.query, 'q', 100);
  const page = pageOf(v, ctx.query);
  v.throwIfAny();
  const { db } = ctx.app;
  const { items, total } = listPromos(db, { status, q, ...page, now: ctx.now });
  return json(200, { items: items.map((p) => toPromoCode(db, p, ctx.now)), total, ...page });
}

function create(ctx: RequestContext): Reply {
  const { db } = ctx.app;
  const input = validatePromoInput(ctx.body, 'create');
  const promo = tx(db, () => {
    const p = createPromo(db, { ...input, plan: input.plan! }, { by: authOf(ctx).user.id, now: ctx.now });
    audit(ctx, {
      action: 'promo.create', target: target(p),
      details: { code: p.code, plan: p.plan, durationDays: p.duration_days, maxRedemptions: p.max_redemptions },
    });
    return p;
  });
  return json(201, { promoCode: toPromoCode(db, promo, ctx.now) });
}

function promoParam(ctx: RequestContext) {
  const p = getPromo(ctx.app.db, Number(ctx.params.id));
  if (!p) throw notFound();
  return p;
}

function detail(ctx: RequestContext): Reply {
  const { db } = ctx.app;
  const p = promoParam(ctx);
  return json(200, { promoCode: toPromoCode(db, p, ctx.now), redemptions: redemptionsOfPromo(db, p.id, ctx.now, 100) });
}

function update(ctx: RequestContext): Reply {
  const { db } = ctx.app;
  const existing = promoParam(ctx);
  const input = validatePromoInput(ctx.body, 'update', existing);
  const after = tx(db, () => {
    const r = updatePromo(db, existing.id, input, ctx.now);
    if (!r) throw notFound();
    const before = promoAuditView(r.before);
    const now = promoAuditView(r.after);
    const changed = Object.keys(now).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(now[k]));
    audit(ctx, {
      action: 'promo.update', target: target(r.after),
      details: { before: Object.fromEntries(changed.map((k) => [k, before[k]])), after: Object.fromEntries(changed.map((k) => [k, now[k]])) },
    });
    return r.after;
  });
  return json(200, { promoCode: toPromoCode(db, after, ctx.now) });
}

function remove(ctx: RequestContext): Reply {
  const { db } = ctx.app;
  const existing = promoParam(ctx);
  tx(db, () => {
    const p = deletePromo(db, existing.id);
    if (!p) throw notFound();
    audit(ctx, { action: 'promo.delete', target: target(p), details: { code: p.code } });
  });
  return noContent();
}

const P = { id: ROWID_PARAM };

export const adminPromoRoutes: AppRoute[] = [
  route({ method: 'GET', path: '/v1/admin/promo-codes', auth: 'admin', handler: list }),
  route({ method: 'POST', path: '/v1/admin/promo-codes', auth: 'admin', handler: create }),
  route({ method: 'GET', path: '/v1/admin/promo-codes/:id', auth: 'admin', params: P, handler: detail }),
  route({ method: 'PATCH', path: '/v1/admin/promo-codes/:id', auth: 'admin', params: P, handler: update }),
  route({ method: 'DELETE', path: '/v1/admin/promo-codes/:id', auth: 'admin', params: P, handler: remove }),
];
