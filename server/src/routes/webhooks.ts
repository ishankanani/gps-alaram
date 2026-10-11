/**
 * RevenueCat webhook (spec 2.9): `Authorization: Bearer <REVENUECAT_WEBHOOK_SECRET>` (or the previous
 * secret during rotation), idempotent by event id. Processing is in domain/store.ts (3.5, 3.6).
 */
import type { AppRoute, RequestContext } from '../context.ts';
import { receiveStoreEvent } from '../domain/store.ts';
import { badRequest } from '../http/errors.ts';
import { json, type Reply } from '../http/response.ts';
import { route } from '../http/router.ts';

export const WEBHOOK_BODY_LIMIT = 256 * 1024;

function revenuecat(ctx: RequestContext): Reply {
  const event = ctx.body.event;
  if (event === null || typeof event !== 'object' || Array.isArray(event)) throw badRequest('The body needs an event object');
  const e = event as Record<string, unknown>;
  if (typeof e.id !== 'string' || e.id.length < 1 || e.id.length > 100) throw badRequest('event.id is required (at most 100 characters)');
  if (typeof e.type !== 'string' || e.type.length < 1 || e.type.length > 64) throw badRequest('event.type is required');
  const { status } = receiveStoreEvent(ctx.app, e);
  return json(200, { ok: true, status });
}

export const webhookRoutes: AppRoute[] = [
  route({ method: 'POST', path: '/v1/webhooks/revenuecat', auth: 'webhook', bodyLimit: WEBHOOK_BODY_LIMIT, handler: revenuecat }),
];
