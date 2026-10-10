/**
 * Request parsing (spec 2.1, 4.3): JSON bodies with size and type limits, the client IP behind
 * TRUST_PROXY hops, X-Client, Accept-Language and X-Request-Id.
 */
import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { isIP } from 'node:net';

import type { ApiLang, Platform } from '../../../src/api/types.ts';
import { ApiError, badRequest } from './errors.ts';

export const DEFAULT_BODY_LIMIT = 16 * 1024;

export const API_LANGS: readonly ApiLang[] = ['da', 'de', 'en', 'fi', 'fr', 'hi', 'it', 'ja', 'nb', 'nl', 'sv'];
export const isApiLang = (v: unknown): v is ApiLang => typeof v === 'string' && (API_LANGS as readonly string[]).includes(v);

export type ClientInfo = {
  platform: Platform;
  appVersion: string;
  build: number | null;
  osVersion: string | null;
};

const X_CLIENT_RE = /^(android|ios)\/(\d{1,3}\.\d{1,3}\.\d{1,3})\/(\d{1,9}|-)\/([0-9A-Za-z._-]{1,20}|-)$/;

/** `android/1.0.0/12/14` → { platform, appVersion, build, osVersion }; null when absent or malformed. */
export function parseXClient(header: string | string[] | undefined): ClientInfo | null {
  if (typeof header !== 'string') return null;
  const m = X_CLIENT_RE.exec(header.trim());
  if (!m) return null;
  return {
    platform: m[1] as Platform,
    appVersion: m[2]!,
    build: m[3] === '-' ? null : Number(m[3]),
    osVersion: m[4] === '-' ? null : m[4]!,
  };
}

export type LocaleInfo = { language: ApiLang | null; country: string | null };

/** `en-DE`, `hi-IN`, `nb` (the app sends `<appLanguage>[-<DEVICE REGION>]`); only the first tag counts. */
export function parseAcceptLanguage(header: string | string[] | undefined): LocaleInfo {
  if (typeof header !== 'string') return { language: null, country: null };
  const first = header.split(',')[0]?.split(';')[0]?.trim() ?? '';
  if (first.length > 35) return { language: null, country: null };
  const parts = first.split(/[-_]/);
  const lang = parts[0]?.toLowerCase();
  const region = parts.slice(1).find((p) => /^[A-Za-z]{2}$/.test(p));
  return {
    language: isApiLang(lang) ? lang : null,
    country: region ? region.toUpperCase() : null,
  };
}

const REQUEST_ID_RE = /^[A-Za-z0-9-]{8,64}$/;

/** The client's X-Request-Id when it is well-formed, otherwise a new one. */
export function requestIdFrom(header: string | string[] | undefined): string {
  return typeof header === 'string' && REQUEST_ID_RE.test(header) ? header : randomUUID();
}

function normalizeIp(value: string): string {
  let v = value.trim();
  if (v.startsWith('[')) v = v.slice(1, v.indexOf(']') > 0 ? v.indexOf(']') : undefined);
  else if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(v)) v = v.slice(0, v.lastIndexOf(':'));
  v = v.toLowerCase();
  if (v.startsWith('::ffff:') && isIP(v.slice(7)) === 4) v = v.slice(7);
  return v;
}

/**
 * The socket address when TRUST_PROXY = 0. Otherwise the entry TRUST_PROXY positions from the
 * right in X-Forwarded-For + [socket address] (Fly, Railway, Render: 1; Cloudflare + Fly: 2).
 */
export function clientIp(req: IncomingMessage, trustProxy: number): string {
  const socketIp = normalizeIp(req.socket.remoteAddress ?? '') || '0.0.0.0';
  if (trustProxy <= 0) return socketIp;
  const header = req.headers['x-forwarded-for'];
  const xff = Array.isArray(header) ? header.join(',') : (header ?? '');
  const chain = [...xff.split(',').map((s) => s.trim()).filter(Boolean), socketIp];
  const candidate = normalizeIp(chain[Math.max(0, chain.length - 1 - trustProxy)] ?? socketIp);
  return isIP(candidate) ? candidate : socketIp;
}

/**
 * The key per-IP rate limits use: the address itself for IPv4, the /64 prefix for IPv6 (one
 * subscriber usually owns a whole /64, so per-address keys would be trivial to rotate).
 */
export function ipRateKey(ip: string): string {
  if (isIP(ip) !== 6) return ip;
  const [head = '', tail = ''] = ip.split('::');
  const h = head ? head.split(':') : [];
  const t = tail ? tail.split(':') : [];
  const groups = ip.includes('::') ? [...h, ...Array<string>(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t] : h;
  return `${groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, '')).join(':')}::/64`;
}

const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
export const methodHasBody = (method: string): boolean => BODY_METHODS.has(method);

function contentTypeIsJson(header: string): boolean {
  const [type, ...params] = header.split(';').map((s) => s.trim().toLowerCase());
  if (type !== 'application/json') return false;
  for (const p of params) {
    const [k, v] = p.split('=').map((s) => s.trim());
    if (k === 'charset' && v !== 'utf-8' && v !== 'utf8' && v !== '"utf-8"') return false;
  }
  return true;
}

const tooLarge = (): ApiError =>
  new ApiError(413, 'payload_too_large', 'Request body too large', { headers: { Connection: 'close' } });
const unsupported = (): ApiError =>
  new ApiError(415, 'unsupported_media_type', 'Use Content-Type: application/json');

function readRaw(req: IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let failed = false;
    req.on('data', (chunk: Buffer) => {
      if (failed) return;
      size += chunk.length;
      if (size > limit) {
        failed = true;
        chunks.length = 0;
        reject(tooLarge());
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!failed) resolve(Buffer.concat(chunks));
    });
    req.on('error', (err) => {
      if (!failed) {
        failed = true;
        reject(err);
      }
    });
  });
}

/**
 * Reads a JSON object body. An empty body counts as {}. Other content types get 415, bodies over
 * the limit 413, malformed JSON or a non-object 400 bad_request.
 */
export async function readJsonBody(req: IncomingMessage, limit: number = DEFAULT_BODY_LIMIT): Promise<Record<string, unknown>> {
  const type = req.headers['content-type'];
  if (type !== undefined && !contentTypeIsJson(type)) throw unsupported();
  const declared = req.headers['content-length'];
  if (declared !== undefined && (!/^\d+$/.test(declared) || Number(declared) > limit)) throw tooLarge();
  const raw = await readRaw(req, limit);
  if (raw.length === 0) return {};
  if (type === undefined) throw unsupported();
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(raw);
  } catch {
    throw badRequest('Body is not valid UTF-8');
  }
  if (text.trim() === '') return {};
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw badRequest('Malformed JSON');
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw badRequest('The body must be a JSON object');
  return value as Record<string, unknown>;
}
