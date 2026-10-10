/**
 * Identifiers (spec 1.1): public ids, reset and promo codes, session tokens, install-id hashes,
 * their normalizers, and constant-time comparison helpers.
 */
import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';

/** Crockford base32: no I, L, O or U. */
export const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CROCKFORD_SET = new Set(CROCKFORD);

/** n × randomInt(32) over the Crockford alphabet (5 bits per character). */
export function randomCrockford(n: number): string {
  let s = '';
  for (let i = 0; i < n; i++) s += CROCKFORD[randomInt(32)];
  return s;
}

export const PUBLIC_ID_RE = /^SW-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;

/** SW-XXXX-XXXX, 40 bits. */
export function newPublicId(): string {
  const s = randomCrockford(8);
  return `SW-${s.slice(0, 4)}-${s.slice(4)}`;
}

/** NFKC, uppercase, keep A–Z/0–9, map O→0 and I, L→1. */
function crockfordBody(input: string): string {
  return input
    .normalize('NFKC')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
}

const allCrockford = (s: string): boolean => [...s].every((c) => CROCKFORD_SET.has(c));

/**
 * A typed public id in any form → `SW-7K3P-92QX`, or null. `sw 7k3p 92qx`, `SW7K3P92QX` and
 * `7K3P-92QX` all normalize to the same id. A 10-character result starting with SW drops the SW;
 * exactly 8 alphabet characters must remain.
 */
export function normalizePublicId(input: string): string | null {
  if (typeof input !== 'string' || input.length > 100) return null;
  let body = crockfordBody(input);
  if (body.length === 10 && body.startsWith('SW')) body = body.slice(2);
  if (body.length !== 8 || !allCrockford(body)) return null;
  return `SW-${body.slice(0, 4)}-${body.slice(4)}`;
}

/** XXXX-XXXX reset code (40 bits), shown to people with the dash. */
export function newResetCode(): string {
  const s = randomCrockford(8);
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

/** A typed reset code → its 8 normalized characters (same rules as public ids, no prefix), or null. */
export function normalizeResetCode(input: string): string | null {
  if (typeof input !== 'string' || input.length > 100) return null;
  const body = crockfordBody(input);
  return body.length === 8 && allCrockford(body) ? body : null;
}

/** XXXX-XXXX-XXXX generated promo code (60 bits). */
export function newPromoCode(): string {
  const s = randomCrockford(12);
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
}

/**
 * Promo codes are words, so there is no O/I/L mapping: NFKC, trim, uppercase, whitespace runs →
 * '-', drop characters outside [A-Z0-9-], collapse repeated '-', trim '-' at both ends.
 * `welcome 2026` → `WELCOME-2026`. Length is checked by the caller (4–32).
 */
export function normalizePromoCode(input: string): string {
  if (typeof input !== 'string') return '';
  return input
    .slice(0, 200)
    .normalize('NFKC')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '-')
    .replace(/[^A-Z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

export const TOKEN_RE = /^sw_[A-Za-z0-9_-]{43}$/;

/** `sw_` + 43 base64url characters (32 random bytes). Only sha256(token) is stored. */
export function newSessionToken(): string {
  return `sw_${randomBytes(32).toString('base64url')}`;
}

export const sha256Hex = (value: string): string => createHash('sha256').update(value, 'utf8').digest('hex');

export const INSTALL_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** sha256("install:" + installId), the only form stored. */
export const installIdHash = (installId: string): string => sha256Hex(`install:${installId}`);

/** sha256(userId + ":" + normalizedCode). */
export const resetCodeHash = (userId: string, normalizedCode: string): string => sha256Hex(`${userId}:${normalizedCode}`);

/** Constant-time comparison of two hex digests of the same length. */
export function hexEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  if (ba.length !== bb.length || ba.length === 0) {
    // Compare against itself anyway so the work does not depend on the input.
    timingSafeEqual(ba.length ? ba : Buffer.alloc(32), ba.length ? ba : Buffer.alloc(32));
    return false;
  }
  return timingSafeEqual(ba, bb);
}

/** Constant-time string comparison through SHA-256 digests (lengths may differ). */
export function digestEqual(a: string, b: string): boolean {
  return timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
}

export const newUserId = (): string => randomUUID();

export const USER_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Deterministic UUID v4 from a seed (demo data, 6.7): sha256's first 16 bytes, version 4, variant 10. */
export function uuidFrom(seed: string): string {
  const b = createHash('sha256').update(seed).digest().subarray(0, 16);
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
