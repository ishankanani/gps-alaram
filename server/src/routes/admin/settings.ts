/**
 * Admin settings (spec 2.10, 6.5): every key with its value, default and override state; an
 * all-or-nothing patch where null resets a key. The remote-config cache is cleared on write.
 */
import type { AppRoute, RequestContext } from '../../context.ts';
import { authOf } from '../../context.ts';
import { tx } from '../../db/database.ts';
import { listAdminSettings, patchSettings } from '../../domain/settings.ts';
import { json, type Reply } from '../../http/response.ts';
import { route } from '../../http/router.ts';
import { audit } from './common.ts';

export const SETTINGS_BODY_LIMIT = 32 * 1024;

function list(ctx: RequestContext): Reply {
  return json(200, { items: listAdminSettings(ctx.app.db, ctx.app.config) });
}

function patch(ctx: RequestContext): Reply {
  const { db, config } = ctx.app;
  tx(db, () => {
    const r = patchSettings(db, config, ctx.body.values, { by: authOf(ctx).user.id, now: ctx.now });
    audit(ctx, {
      action: 'settings.update',
      target: { type: 'settings', id: null, label: r.keys.join(',').slice(0, 300) },
      details: { keys: r.keys, before: r.before, after: r.after },
    });
  });
  ctx.app.configCache.clear();
  return json(200, { items: listAdminSettings(db, config) });
}

export const adminSettingsRoutes: AppRoute[] = [
  route({ method: 'GET', path: '/v1/admin/settings', auth: 'admin', handler: list }),
  route({ method: 'PATCH', path: '/v1/admin/settings', auth: 'admin', bodyLimit: SETTINGS_BODY_LIMIT, handler: patch }),
];
