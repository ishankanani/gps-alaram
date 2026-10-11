/**
 * Admin audit log (spec 2.10, 4.6): newest first, `before` cursor paging, filters by action
 * prefix, actor (<id|SW-…|env|cli|system>) and affected user (<id|SW-…>).
 */
import type { AppRoute, RequestContext } from '../../context.ts';
import { findUserByRef } from '../../domain/admin-users.ts';
import { listAudit } from '../../domain/audit.ts';
import { normalizePublicId } from '../../domain/ids.ts';
import { json, type Reply } from '../../http/response.ts';
import { route } from '../../http/router.ts';
import { Fields, queryInt, queryText } from './common.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** <id|SW-…> → the user id (when the user still exists) and the public-id label. */
function userRef(ctx: RequestContext, v: Fields, key: string, raw: string | null, labels: readonly string[] = []) {
  if (!raw) return { id: null, label: null };
  if (labels.includes(raw.toLowerCase())) return { id: null, label: raw.toLowerCase() };
  if (UUID.test(raw)) return { id: raw.toLowerCase(), label: null };
  const publicId = normalizePublicId(raw);
  if (!publicId) {
    v.add(key, 'invalid');
    return { id: null, label: null };
  }
  return { id: findUserByRef(ctx.app.db, publicId)?.id ?? null, label: publicId };
}

function list(ctx: RequestContext): Reply {
  const v = new Fields();
  const action = queryText(v, ctx.query, 'action', 64);
  const actor = userRef(ctx, v, 'actor', queryText(v, ctx.query, 'actor', 64), ['env', 'cli', 'system']);
  const user = userRef(ctx, v, 'user', queryText(v, ctx.query, 'user', 64));
  const before = ctx.query.get('before') ? queryInt(v, ctx.query, 'before', { min: 1, max: Number.MAX_SAFE_INTEGER, def: 0 }) : null;
  const limit = queryInt(v, ctx.query, 'limit', { min: 1, max: 100, def: 50 });
  v.throwIfAny();
  return json(200, listAudit(ctx.app.db, {
    action, actorId: actor.id, actorLabel: actor.label, userId: user.id, userLabel: user.label, before, limit,
  }));
}

export const adminAuditRoutes: AppRoute[] = [route({ method: 'GET', path: '/v1/admin/audit', auth: 'admin', handler: list })];
