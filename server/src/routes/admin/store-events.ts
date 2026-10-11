/**
 * Admin store events (spec 2.10): the RevenueCat deliveries, newest first, with their stored
 * payload, and a retry for `unmatched` or `error` events (audited as store_event.retry).
 */
import type { AppRoute, RequestContext } from '../../context.ts';
import { tx } from '../../db/database.ts';
import { findUserByRef } from '../../domain/admin-users.ts';
import { getWebhookEvent, listStoreEvents, reprocessStoreEvent, storeEventById, type WebhookStatus } from '../../domain/store.ts';
import { getUser } from '../../domain/users.ts';
import { badRequest, notFound } from '../../http/errors.ts';
import { json, type Reply } from '../../http/response.ts';
import { route } from '../../http/router.ts';
import { audit, Fields, queryEnum, queryInt, queryText } from './common.ts';

/** Any event id RevenueCat may send (≤ 100 characters, no control characters). */
// eslint-disable-next-line no-control-regex
export const EVENT_ID_PARAM = /^[^\u0000-\u001F\u007F]{1,100}$/;
const STATUSES: readonly WebhookStatus[] = ['processed', 'stale', 'ignored', 'unmatched', 'error'];

function list(ctx: RequestContext): Reply {
  const v = new Fields();
  const status = queryEnum(v, ctx.query, 'status', STATUSES);
  const userRef = queryText(v, ctx.query, 'user', 64);
  const before = queryText(v, ctx.query, 'before', 100);
  const limit = queryInt(v, ctx.query, 'limit', { min: 1, max: 100, def: 50 });
  v.throwIfAny();
  let userId: string | null = null;
  if (userRef) {
    const u = findUserByRef(ctx.app.db, userRef);
    if (!u) return json(200, { items: [], nextBefore: null });
    userId = u.id;
  }
  return json(200, listStoreEvents(ctx.app.db, { status, userId, before, limit }));
}

function detail(ctx: RequestContext): Reply {
  const found = storeEventById(ctx.app.db, ctx.params.id!);
  if (!found) throw notFound();
  return json(200, found);
}

function retry(ctx: RequestContext): Reply {
  const { db } = ctx.app;
  const row = getWebhookEvent(db, ctx.params.id!);
  if (!row) throw notFound();
  if (row.status !== 'unmatched' && row.status !== 'error') throw badRequest('Only unmatched or error events can be retried');
  tx(db, () => {
    const r = reprocessStoreEvent(ctx.app, row);
    const user = r.userId ? getUser(db, r.userId) : undefined;
    audit(ctx, {
      action: 'store_event.retry',
      target: { type: 'store_event', id: row.id, userId: user?.id ?? null, label: user?.public_id ?? null },
      details: { eventId: row.id, before: r.before, after: r.after },
    });
  });
  return json(200, { event: storeEventById(db, row.id)!.event });
}

const P = { id: EVENT_ID_PARAM };

export const adminStoreEventRoutes: AppRoute[] = [
  route({ method: 'GET', path: '/v1/admin/store-events', auth: 'admin', handler: list }),
  route({ method: 'GET', path: '/v1/admin/store-events/:id', auth: 'admin', params: P, handler: detail }),
  route({ method: 'POST', path: '/v1/admin/store-events/:id/retry', auth: 'admin', params: P, handler: retry }),
];
