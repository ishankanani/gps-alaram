/**
 * Admin prices (spec 2.10, 5.4): built-in rows merged with overrides; PUT and DELETE an override;
 * reset all. Every write clears the remote-config cache. Changing a price here does not change
 * what Google Play charges: Play Console must be updated too.
 */
import type { AdminPriceRow } from '../../../../src/api/types.ts';
import type { AppRoute, RequestContext } from '../../context.ts';
import { authOf } from '../../context.ts';
import { tx } from '../../db/database.ts';
import {
  deletePriceOverride, EU_ALIAS, listAdminPrices, PRICE_KEY_RE, priceWarnings, resetPriceOverrides, upsertPriceOverride, validatePriceUpdate,
} from '../../domain/prices.ts';
import { notFound } from '../../http/errors.ts';
import { json, noContent, type Reply } from '../../http/response.ts';
import { route } from '../../http/router.ts';
import { audit, Fields } from './common.ts';

const target = (country: string) => ({ type: 'price' as const, id: country, label: country });
const rowFor = (ctx: RequestContext, country: string): AdminPriceRow | undefined =>
  listAdminPrices(ctx.app.db).find((r) => r.country === country);

function list(ctx: RequestContext): Reply {
  return json(200, {
    items: listAdminPrices(ctx.app.db),
    defaultTrialDays: ctx.app.settings()['pricing.trialDays'],
    euAlias: [...EU_ALIAS],
  });
}

function put(ctx: RequestContext): Reply {
  const country = ctx.params.country!;
  const input = validatePriceUpdate(country, ctx.body);
  tx(ctx.app.db, () => {
    const { before, after } = upsertPriceOverride(ctx.app.db, input, { by: authOf(ctx).user.id, now: ctx.now });
    audit(ctx, { action: 'price.update', target: target(country), details: { country, before, after } });
  });
  ctx.app.configCache.clear();
  return json(200, { item: rowFor(ctx, country), warnings: priceWarnings(input.row) });
}

function remove(ctx: RequestContext): Reply {
  const country = ctx.params.country!;
  tx(ctx.app.db, () => {
    const before = deletePriceOverride(ctx.app.db, country);
    if (!before) throw notFound();
    audit(ctx, { action: 'price.delete', target: target(country), details: { country, before } });
  });
  ctx.app.configCache.clear();
  return noContent();
}

function reset(ctx: RequestContext): Reply {
  const v = new Fields();
  if (ctx.body.confirm === undefined) v.add('confirm', 'required');
  else if (ctx.body.confirm !== true) v.add('confirm', 'invalid');
  v.throwIfAny();
  const removed = tx(ctx.app.db, () => {
    const n = resetPriceOverrides(ctx.app.db);
    audit(ctx, { action: 'price.reset', target: { type: 'price', id: null, label: null }, details: { removed: n } });
    return n;
  });
  ctx.app.configCache.clear();
  return json(200, { removed });
}

export const adminPriceRoutes: AppRoute[] = [
  route({ method: 'GET', path: '/v1/admin/prices', auth: 'admin', handler: list }),
  route({ method: 'POST', path: '/v1/admin/prices/reset', auth: 'admin', handler: reset }),
  route({ method: 'PUT', path: '/v1/admin/prices/:country', auth: 'admin', params: { country: PRICE_KEY_RE }, handler: put }),
  route({ method: 'DELETE', path: '/v1/admin/prices/:country', auth: 'admin', params: { country: PRICE_KEY_RE }, handler: remove }),
];

