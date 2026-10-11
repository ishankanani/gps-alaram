/**
 * Public endpoints (spec 2.5): health, remote config (ETag, 304) and the static pages.
 */
import { readFileSync } from 'node:fs';

import type { HealthResponse } from '../../../src/api/types.ts';
import { iso } from '../clock.ts';
import type { AppRoute, RequestContext } from '../context.ts';
import { one } from '../db/database.ts';
import { parseConfigQuery } from '../domain/config.ts';
import { unavailable } from '../http/errors.ts';
import { etagMatches, html, json, type Reply } from '../http/response.ts';
import { route } from '../http/router.ts';

export const STATIC_PAGES = ['privacy', 'terms', 'account-deletion'] as const;
export type StaticPage = (typeof STATIC_PAGES)[number];

const STATIC_DIR = new URL('../../static/', import.meta.url);
const pageCache = new Map<StaticPage, string>();

function pageTemplate(name: StaticPage): string {
  let t = pageCache.get(name);
  if (t === undefined) {
    try {
      t = readFileSync(new URL(`${name}.html`, STATIC_DIR), 'utf8');
    } catch {
      t = `<!doctype html><meta charset="utf-8"><title>StopWake</title><p>This page is not available yet. Contact {{SUPPORT_EMAIL}}.</p>`;
    }
    pageCache.set(name, t);
  }
  return t;
}

const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** The page with {{SUPPORT_EMAIL}} and {{PUBLIC_URL}} substituted (HTML-escaped). */
export function renderStaticPage(name: StaticPage, vars: { supportEmail: string; publicUrl: string }): string {
  return pageTemplate(name)
    .replaceAll('{{SUPPORT_EMAIL}}', escapeHtml(vars.supportEmail))
    .replaceAll('{{PUBLIC_URL}}', escapeHtml(vars.publicUrl));
}

function health(ctx: RequestContext): Reply {
  try {
    one(ctx.app.db, 'SELECT 1 AS ok');
  } catch (err) {
    ctx.app.log.error('health check failed', { error: err });
    throw unavailable('Database unavailable');
  }
  const body: HealthResponse = {
    ok: true,
    version: ctx.app.version,
    commit: ctx.app.config.gitCommit,
    time: iso(ctx.now),
    uptimeSeconds: Math.max(0, Math.floor((ctx.now - ctx.app.startedAt) / 1000)),
  };
  return json(200, body, { 'Cache-Control': 'no-store' });
}

function config(ctx: RequestContext): Reply {
  const q = parseConfigQuery(ctx.query);
  const built = ctx.app.configCache.get(ctx.app.db, ctx.app.config, q, ctx.now);
  const headers = { ETag: built.etag, 'Cache-Control': 'public, max-age=300' };
  if (etagMatches(ctx.req.headers['if-none-match'], built.etag)) return { status: 304, headers, body: null };
  return { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers }, body: built.body };
}

function staticPage(name: StaticPage) {
  return (ctx: RequestContext): Reply =>
    html(200, renderStaticPage(name, { supportEmail: ctx.app.settings()['support.email'], publicUrl: ctx.app.config.publicUrl }), {
      'Cache-Control': 'public, max-age=3600',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
    });
}

export const publicRoutes: AppRoute[] = [
  route({ method: 'GET', path: '/v1/health', auth: 'none', handler: health }),
  route({ method: 'GET', path: '/v1/config', auth: 'none', handler: config }),
  ...STATIC_PAGES.map((name) => route<RequestContext>({ method: 'GET', path: `/${name}`, auth: 'none', handler: staticPage(name) })),
];
