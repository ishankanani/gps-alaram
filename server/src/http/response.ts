/**
 * Replies (spec 2.1): handlers return a Reply; app.ts writes it with the default headers.
 */
import { createHash } from 'node:crypto';
import type { ServerResponse } from 'node:http';

export type Reply = {
  status: number;
  headers: Record<string, string>;
  /** Serialized body; null for 204/304. */
  body: string | null;
};

export const JSON_TYPE = 'application/json; charset=utf-8';
export const DEFAULT_CSP = "default-src 'none'; frame-ancestors 'none'";

export function json(status: number, data: unknown, headers: Record<string, string> = {}): Reply {
  return { status, headers: { 'Content-Type': JSON_TYPE, ...headers }, body: JSON.stringify(data) };
}

export function noContent(headers: Record<string, string> = {}): Reply {
  return { status: 204, headers, body: null };
}

export function html(status: number, body: string, headers: Record<string, string> = {}): Reply {
  return { status, headers: { 'Content-Type': 'text/html; charset=utf-8', ...headers }, body };
}

/** `"<first 16 hex chars of sha256(body)>"` (spec 2.5). */
export function etagFor(content: string): string {
  return `"${createHash('sha256').update(content).digest('hex').slice(0, 16)}"`;
}

/** If-None-Match handling: a list of tags or `*`; the weak prefix W/ is ignored. */
export function etagMatches(ifNoneMatch: string | string[] | undefined, etag: string): boolean {
  if (!ifNoneMatch) return false;
  const header = Array.isArray(ifNoneMatch) ? ifNoneMatch.join(',') : ifNoneMatch;
  const want = etag.replace(/^W\//, '');
  return header.split(',').some((part) => {
    const tag = part.trim().replace(/^W\//, '');
    return tag === '*' || tag === want;
  });
}

/** Writes the reply with the security headers every response carries. */
export function writeReply(
  res: ServerResponse,
  reply: Reply,
  base: { requestId: string; hsts: boolean },
): void {
  const headers: Record<string, string> = {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': DEFAULT_CSP,
    ...reply.headers,
    'X-Request-Id': base.requestId,
  };
  if (base.hsts) headers['Strict-Transport-Security'] = 'max-age=31536000';
  const body = reply.status === 204 || reply.status === 304 ? null : reply.body;
  if (body === null) {
    delete headers['Content-Type'];
  } else {
    headers['Content-Length'] = String(Buffer.byteLength(body));
  }
  res.writeHead(reply.status, headers);
  res.end(body ?? undefined);
}
