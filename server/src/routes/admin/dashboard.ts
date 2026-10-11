/**
 * GET /v1/admin/dashboard?days=7|30|90 (spec 2.10); `days` only affects signupsByDay.
 */
import type { AppRoute, RequestContext } from '../../context.ts';
import { buildDashboard, DASHBOARD_DAYS, type DashboardDays } from '../../domain/dashboard.ts';
import { json, type Reply } from '../../http/response.ts';
import { route } from '../../http/router.ts';
import { Fields } from './common.ts';

function dashboard(ctx: RequestContext): Reply {
  const raw = ctx.query.get('days');
  let days: DashboardDays = 30;
  if (raw !== null && raw !== '') {
    const n = Number(raw);
    if (!(DASHBOARD_DAYS as readonly number[]).includes(n)) {
      const v = new Fields();
      v.add('days', 'invalid');
      v.throwIfAny();
    }
    days = n as DashboardDays;
  }
  return json(200, buildDashboard(ctx.app.db, { now: ctx.now, days, webhookConfigured: ctx.app.config.revenuecatWebhookSecret !== null }));
}

export const adminDashboardRoutes: AppRoute[] = [route({ method: 'GET', path: '/v1/admin/dashboard', auth: 'admin', handler: dashboard })];
