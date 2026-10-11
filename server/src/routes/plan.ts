/**
 * Plan and promo endpoints (spec 2.8): the effective plan, RevenueCat sync and code redemption.
 */
import type { RedeemResponse, SyncResponse } from '../../../src/api/types.ts';
import type { AppRoute, RequestContext } from '../context.ts';
import { authOf } from '../context.ts';
import { tx } from '../db/database.ts';
import { getGrantWithCode, grantEntitlement } from '../domain/plans.ts';
import { redeemPromo } from '../domain/promo.ts';
import { syncWithRevenueCat } from '../domain/store.ts';
import { ApiError } from '../http/errors.ts';
import { json, type Reply } from '../http/response.ts';
import { route } from '../http/router.ts';
import { Fields, readString } from '../http/validate.ts';
import { planOf, reloadUser } from './shared.ts';

function getPlan(ctx: RequestContext): Reply {
  return json(200, planOf(ctx, reloadUser(ctx, authOf(ctx).user.id)));
}

/** POST /v1/plan/sync: reconcile with RevenueCat when REVENUECAT_API_KEY is set. */
async function syncPlan(ctx: RequestContext): Promise<Reply> {
  const auth = authOf(ctx);
  const synced = await syncWithRevenueCat(ctx.app, auth.user.id);
  const body: SyncResponse = { ...planOf(ctx, reloadUser(ctx, auth.user.id)), synced };
  return json(200, body);
}

/** POST /v1/promo/redeem (guests allowed). */
function redeem(ctx: RequestContext): Reply {
  const { db } = ctx.app;
  if (!ctx.app.settings()['promo.redeemEnabled']) throw new ApiError(403, 'redeem_disabled', 'Redeeming codes is switched off at the moment');
  const auth = authOf(ctx);
  const v = new Fields();
  const code = readString(v, ctx.body, 'code', { required: true, max: 200 });
  v.throwIfAny();
  const { grant } = tx(db, () => redeemPromo(db, { userId: auth.user.id, rawCode: code!, now: ctx.now, plan: ctx.app.planOptions }));
  const user = reloadUser(ctx, auth.user.id);
  const body: RedeemResponse = { ...planOf(ctx, user), grant: grantEntitlement(getGrantWithCode(db, grant.id)!, ctx.now) };
  return json(200, body);
}

export const planRoutes: AppRoute[] = [
  route({ method: 'GET', path: '/v1/plan', auth: 'session', handler: getPlan }),
  route({ method: 'POST', path: '/v1/plan/sync', auth: 'session', limits: ['sync'], handler: syncPlan }),
  route({ method: 'POST', path: '/v1/promo/redeem', auth: 'session', limits: ['redeemIp', 'redeemUser'], handler: redeem }),
];
