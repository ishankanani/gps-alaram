/**
 * Field validation (spec 4.4), hand-written and dependency-free.
 *
 * - Strings are NFC-normalized and trimmed; control characters are rejected, except newlines in
 *   multi-line texts (note and announcement bodies).
 * - Lengths count Unicode code points, like SQLite's length().
 * - A field is "absent" when the key is missing or undefined; `null` is an explicit value that
 *   only nullable fields accept. Unknown fields are ignored by never being read.
 *
 * Usage: `const v = new Fields(); const email = readEmail(v, body, 'email', { required: true }); v.throwIfAny();`
 */
import type { ApiLang, FieldError } from '../../../src/api/types.ts';
import { validationFailed } from './errors.ts';
import { isApiLang } from './request.ts';

export type Body = Record<string, unknown>;

/** Collects field errors; the first error per field wins. */
export class Fields {
  readonly errors: Record<string, FieldError> = {};

  add(field: string, error: FieldError): void {
    if (!(field in this.errors)) this.errors[field] = error;
  }

  has(field: string): boolean {
    return field in this.errors;
  }

  get ok(): boolean {
    return Object.keys(this.errors).length === 0;
  }

  throwIfAny(): void {
    if (!this.ok) throw validationFailed({ ...this.errors });
  }
}

export const codePoints = (s: string): number => {
  let n = 0;
  for (const _ of s) n++;
  return n;
};

// C0 and C1 controls, DEL, and the line/paragraph separators.
const CONTROL = /[\u0000-\u001F\u007F-\u009F\u2028\u2029]/;
const CONTROL_EXCEPT_NEWLINE = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F\u2028\u2029]/;

export const hasOwn = (body: Body, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(body, key) && body[key] !== undefined;

/**
 * NFC + trim + control-character check. Multi-line texts keep newlines (CRLF → LF); returns null
 * when the text contains forbidden characters.
 */
export function cleanText(raw: string, opts: { multiline?: boolean } = {}): string | null {
  let s = raw.normalize('NFC');
  if (opts.multiline) s = s.replace(/\r\n?/g, '\n');
  s = s.trim();
  return (opts.multiline ? CONTROL_EXCEPT_NEWLINE : CONTROL).test(s) ? null : s;
}

type Presence = { required?: boolean; nullable?: boolean };

/** Shared presence handling: returns `skip` when the caller should stop. */
function presence(v: Fields, body: Body, key: string, opts: Presence): 'absent' | 'null' | 'value' | 'error' {
  if (!hasOwn(body, key)) {
    if (opts.required) v.add(key, 'required');
    return opts.required ? 'error' : 'absent';
  }
  if (body[key] === null) {
    if (opts.nullable) return 'null';
    v.add(key, opts.required ? 'required' : 'invalid');
    return 'error';
  }
  return 'value';
}

export function readString(
  v: Fields,
  body: Body,
  key: string,
  opts: Presence & { min?: number; max?: number; multiline?: boolean } = {},
): string | null | undefined {
  const p = presence(v, body, key, opts);
  if (p === 'absent') return undefined;
  if (p === 'null') return null;
  if (p === 'error') return undefined;
  const value = body[key];
  if (typeof value !== 'string') {
    v.add(key, 'invalid');
    return undefined;
  }
  const s = cleanText(value, { multiline: opts.multiline });
  if (s === null) {
    v.add(key, 'invalid');
    return undefined;
  }
  const n = codePoints(s);
  if (n === 0 && opts.required) {
    v.add(key, 'required');
    return undefined;
  }
  if (n < (opts.min ?? 0)) {
    v.add(key, 'too_short');
    return undefined;
  }
  if (opts.max !== undefined && n > opts.max) {
    v.add(key, 'too_long');
    return undefined;
  }
  return s;
}

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;

/** Trimmed, lowercased; ≤ 254 chars; local part ≤ 64; `^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$`. */
export function normalizeEmail(raw: string): { email: string } | { error: 'invalid_email' | 'too_long' } {
  const s = cleanText(raw);
  if (s === null) return { error: 'invalid_email' };
  const email = s.toLowerCase();
  if (codePoints(email) > 254) return { error: 'too_long' };
  if (!EMAIL_RE.test(email)) return { error: 'invalid_email' };
  return { email };
}

export function readEmail(v: Fields, body: Body, key: string, opts: { required?: boolean } = {}): string | undefined {
  const p = presence(v, body, key, opts);
  if (p !== 'value') return undefined;
  const value = body[key];
  if (typeof value !== 'string') {
    v.add(key, 'invalid_email');
    return undefined;
  }
  if (value.trim() === '' && opts.required) {
    v.add(key, 'required');
    return undefined;
  }
  const r = normalizeEmail(value);
  if ('error' in r) {
    v.add(key, r.error);
    return undefined;
  }
  return r.email;
}

/**
 * A password as typed: NFKC-normalized, never trimmed (spec 4.1). The policy is checked
 * separately (domain/passwords.ts); here only presence, type and a hard upper bound.
 */
export function readPassword(v: Fields, body: Body, key: string, opts: { required?: boolean } = {}): string | undefined {
  const p = presence(v, body, key, opts);
  if (p !== 'value') return undefined;
  const value = body[key];
  if (typeof value !== 'string') {
    v.add(key, 'invalid');
    return undefined;
  }
  if (value === '') {
    v.add(key, 'required');
    return undefined;
  }
  // Far above the policy maximum (128 code points); bounds hashing input for sign-in attempts.
  if (value.length > 1024) {
    v.add(key, 'too_long');
    return undefined;
  }
  return value.normalize('NFKC');
}

/** 1–60 chars, internal whitespace collapsed, single line; null clears it. */
export function readDisplayName(v: Fields, body: Body, key: string): string | null | undefined {
  const p = presence(v, body, key, { nullable: true });
  if (p === 'absent' || p === 'error') return undefined;
  if (p === 'null') return null;
  const value = body[key];
  if (typeof value !== 'string') {
    v.add(key, 'invalid');
    return undefined;
  }
  const collapsed = cleanText(value.normalize('NFC').replace(/\s+/gu, ' '));
  if (collapsed === null || collapsed === '') {
    v.add(key, 'invalid');
    return undefined;
  }
  if (codePoints(collapsed) > 60) {
    v.add(key, 'too_long');
    return undefined;
  }
  return collapsed;
}

/** Reason: 3–500 chars, single line (newlines become spaces). */
export function readReason(v: Fields, body: Body, key = 'reason'): string | undefined {
  const value = body[key];
  if (typeof value === 'string') {
    const single = { ...body, [key]: value.replace(/\r\n?|\n/g, ' ') };
    return readString(v, single, key, { required: true, min: 3, max: 500 }) ?? undefined;
  }
  return readString(v, body, key, { required: true, min: 3, max: 500 }) ?? undefined;
}

/** Note body: 1–2000 chars, newlines allowed. */
export const readNoteBody = (v: Fields, body: Body, key = 'body'): string | undefined =>
  readString(v, body, key, { required: true, min: 1, max: 2000, multiline: true }) ?? undefined;

/** Description: ≤ 200 chars, single line. */
export const readDescription = (v: Fields, body: Body, key = 'description'): string | undefined =>
  readString(v, body, key, { max: 200 }) ?? undefined;

export function readInt(
  v: Fields,
  body: Body,
  key: string,
  opts: Presence & { min: number; max: number },
): number | null | undefined {
  const p = presence(v, body, key, opts);
  if (p === 'absent') return undefined;
  if (p === 'null') return null;
  if (p === 'error') return undefined;
  const value = body[key];
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    v.add(key, 'invalid');
    return undefined;
  }
  if (value < opts.min || value > opts.max) {
    v.add(key, 'out_of_range');
    return undefined;
  }
  return value;
}

export function readBool(v: Fields, body: Body, key: string, opts: { required?: boolean } = {}): boolean | undefined {
  const p = presence(v, body, key, opts);
  if (p !== 'value') return undefined;
  const value = body[key];
  if (typeof value !== 'boolean') {
    v.add(key, 'invalid');
    return undefined;
  }
  return value;
}

export function readEnum<T extends string>(
  v: Fields,
  body: Body,
  key: string,
  values: readonly T[],
  opts: Presence = {},
): T | null | undefined {
  const p = presence(v, body, key, opts);
  if (p === 'absent') return undefined;
  if (p === 'null') return null;
  if (p === 'error') return undefined;
  const value = body[key];
  if (typeof value !== 'string' || !(values as readonly string[]).includes(value)) {
    v.add(key, 'invalid');
    return undefined;
  }
  return value as T;
}

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})$/;

/** ISO 8601 with Z or an offset, round-tripped through Date (rejects 2026-02-30). Returns ms. */
export function parseIsoDate(value: string): number | null {
  const m = ISO_RE.exec(value);
  if (!m) return null;
  const [, y, mo, d, h, mi, s = '0', ms = '0', zone] = m;
  const fields = [Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s), Number(ms.padEnd(3, '0'))] as const;
  const local = new Date(Date.UTC(...fields));
  if (
    local.getUTCFullYear() !== fields[0] || local.getUTCMonth() !== fields[1] || local.getUTCDate() !== fields[2] ||
    local.getUTCHours() !== fields[3] || local.getUTCMinutes() !== fields[4] || local.getUTCSeconds() !== fields[5]
  ) {
    return null;
  }
  let offset = 0;
  if (zone && zone !== 'Z') {
    const sign = zone[0] === '-' ? -1 : 1;
    const oh = Number(zone.slice(1, 3));
    const om = Number(zone.slice(4, 6));
    if (oh > 14 || om > 59) return null;
    offset = sign * (oh * 60 + om) * 60_000;
  }
  const t = local.getTime() - offset;
  return Number.isFinite(t) ? t : null;
}

export function readIsoDate(v: Fields, body: Body, key: string, opts: Presence = {}): number | null | undefined {
  const p = presence(v, body, key, opts);
  if (p === 'absent') return undefined;
  if (p === 'null') return null;
  if (p === 'error') return undefined;
  const value = body[key];
  const t = typeof value === 'string' ? parseIsoDate(value.trim()) : null;
  if (t === null) {
    v.add(key, 'invalid_date');
    return undefined;
  }
  return t;
}

export const COUNTRY_RE = /^[A-Z]{2}$/;

export function readCountry(v: Fields, body: Body, key: string, opts: Presence = {}): string | null | undefined {
  const p = presence(v, body, key, opts);
  if (p === 'absent') return undefined;
  if (p === 'null') return null;
  if (p === 'error') return undefined;
  const value = body[key];
  if (typeof value !== 'string' || !COUNTRY_RE.test(value)) {
    v.add(key, 'invalid');
    return undefined;
  }
  return value;
}

export function readLanguage(v: Fields, body: Body, key: string, opts: Presence = {}): ApiLang | null | undefined {
  const p = presence(v, body, key, opts);
  if (p === 'absent') return undefined;
  if (p === 'null') return null;
  if (p === 'error') return undefined;
  const value = body[key];
  if (!isApiLang(value)) {
    v.add(key, 'invalid');
    return undefined;
  }
  return value;
}

const VERSION_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
export const isVersion = (s: unknown): s is string => typeof s === 'string' && VERSION_RE.test(s);

/** Numeric x.y.z comparison: negative when a < b. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** https:// only, ≤ 300 chars, parsed with URL, no credentials. */
export function isHttpsUrl(s: unknown): s is string {
  if (typeof s !== 'string' || s.length > 300 || s.trim() !== s || CONTROL.test(s) || /\s/.test(s)) return false;
  try {
    const u = new URL(s);
    return u.protocol === 'https:' && u.hostname !== '' && u.username === '' && u.password === '';
  } catch {
    return false;
  }
}

/** Path ids are checked against a regex before any query; a mismatch is a 404 (router). */
export const ID_PATTERNS = {
  uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
  rowid: /^[1-9]\d{0,15}$/,
} as const;
