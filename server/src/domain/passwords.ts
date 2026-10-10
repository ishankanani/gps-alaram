/**
 * Passwords (spec 4.1).
 *
 * - scrypt, async on the libuv pool: N = 2^15, r = 8, p = 3, keylen 32, random 16-byte salt,
 *   maxmem 64 MiB (OWASP's equivalent of N = 2^17, r = 8, p = 1 at 32 MiB per hash).
 * - Encoding: scrypt$v=1$N=32768,r=8,p=3$<salt b64url>$<hash b64url>. Verification parses the
 *   parameters and compares with timingSafeEqual; a successful sign-in rehashes outdated hashes.
 * - At most 2 hashes run at once and up to 50 more wait; beyond that callers get 503 unavailable.
 * - Policy: NFKC, never trimmed, 8–128 code points (12 for admins), not a common password,
 *   not the email or its local part.
 *
 * common-passwords.txt is the SecLists "10k-most-common" list (MIT licence, Daniel Miessler et al.),
 * lowercased, plus a few words specific to this service (NIST SP 800-63B suggests blocking those).
 */
import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { unavailable } from '../http/errors.ts';

export const SCRYPT_R = 8;
export const SCRYPT_KEYLEN = 32;
const SALT_BYTES = 16;
const MAXMEM_FLOOR = 64 * 1024 * 1024;

export type HashParams = { N: number; r: number; p: number };

export type PasswordHasher = {
  readonly params: HashParams;
  hash(password: string): Promise<string>;
  verify(password: string, encoded: string): Promise<boolean>;
  /** Hash parameters differ from the current ones (or the hash is unreadable). */
  needsRehash(encoded: string): boolean;
  /** Same work as a real verification, against a hash nobody knows (unknown emails, 4.9). */
  verifyDummy(password: string): Promise<void>;
  stats(): { running: number; queued: number };
};

export const normalizePassword = (password: string): string => password.normalize('NFKC');

const b64url = (b: Buffer): string => b.toString('base64url');

export function encodeHash(params: HashParams, salt: Buffer, key: Buffer): string {
  return `scrypt$v=1$N=${params.N},r=${params.r},p=${params.p}$${b64url(salt)}$${b64url(key)}`;
}

const HASH_RE = /^scrypt\$v=1\$N=(\d{1,7}),r=(\d{1,2}),p=(\d{1,2})\$([A-Za-z0-9_-]{16,64})\$([A-Za-z0-9_-]{16,128})$/;

export function decodeHash(encoded: string): { params: HashParams; salt: Buffer; key: Buffer } | null {
  const m = typeof encoded === 'string' ? HASH_RE.exec(encoded) : null;
  if (!m) return null;
  const params = { N: Number(m[1]), r: Number(m[2]), p: Number(m[3]) };
  // Bounds keep a tampered row from turning a verification into a memory or CPU bomb.
  const powerOfTwo = params.N >= 2 && (params.N & (params.N - 1)) === 0;
  if (!powerOfTwo || params.N > 2 ** 17 || params.r < 1 || params.r > 32 || params.p < 1 || params.p > 16) return null;
  return { params, salt: Buffer.from(m[4]!, 'base64url'), key: Buffer.from(m[5]!, 'base64url') };
}

function scryptAsync(password: string, salt: Buffer, keylen: number, p: HashParams): Promise<Buffer> {
  const options: ScryptOptions = { N: p.N, r: p.r, p: p.p, maxmem: Math.max(MAXMEM_FLOOR, 256 * p.N * p.r) };
  return new Promise((resolve, reject) => {
    try {
      scrypt(password, salt, keylen, options, (err, key) => (err ? reject(err) : resolve(key)));
    } catch (err) {
      reject(err as Error);
    }
  });
}

function createSemaphore(max: number, maxQueue: number) {
  let running = 0;
  const waiting: Array<() => void> = [];
  return {
    async run<T>(fn: () => Promise<T>): Promise<T> {
      if (running >= max) {
        if (waiting.length >= maxQueue) throw unavailable('Too many password checks at once, try again');
        // The releasing caller hands its slot over, so `running` stays the same.
        await new Promise<void>((resolve) => waiting.push(resolve));
      } else {
        running++;
      }
      try {
        return await fn();
      } finally {
        const next = waiting.shift();
        if (next) next();
        else running--;
      }
    },
    stats: () => ({ running, queued: waiting.length }),
  };
}

export function createPasswordHasher(opts: { N: number; p: number; r?: number; maxConcurrent?: number; maxQueue?: number }): PasswordHasher {
  const params: HashParams = { N: opts.N, r: opts.r ?? SCRYPT_R, p: opts.p };
  const sem = createSemaphore(opts.maxConcurrent ?? 2, opts.maxQueue ?? 50);

  const hashNow = async (password: string): Promise<string> => {
    const salt = randomBytes(SALT_BYTES);
    const key = await scryptAsync(normalizePassword(password), salt, SCRYPT_KEYLEN, params);
    return encodeHash(params, salt, key);
  };

  const verifyNow = async (password: string, encoded: string): Promise<boolean> => {
    const decoded = decodeHash(encoded);
    if (!decoded || decoded.key.length < 16) return false;
    const key = await scryptAsync(normalizePassword(password), decoded.salt, decoded.key.length, decoded.params);
    return timingSafeEqual(key, decoded.key);
  };

  // DUMMY_HASH: computed once at startup with the current parameters.
  const dummy = hashNow(randomBytes(24).toString('base64url'));
  dummy.catch(() => {});

  return {
    params,
    hash: (password) => sem.run(() => hashNow(password)),
    verify: (password, encoded) => sem.run(() => verifyNow(password, encoded)),
    needsRehash(encoded) {
      const d = decodeHash(encoded);
      return !d || d.params.N !== params.N || d.params.r !== params.r || d.params.p !== params.p || d.key.length !== SCRYPT_KEYLEN;
    },
    async verifyDummy(password) {
      const encoded = await dummy;
      await sem.run(() => verifyNow(password, encoded));
    },
    stats: () => sem.stats(),
  };
}

let common: Set<string> | null = null;

function commonPasswords(): Set<string> {
  if (!common) {
    const text = readFileSync(new URL('./common-passwords.txt', import.meta.url), 'utf8');
    common = new Set(text.split(/\r?\n/).filter(Boolean).map((l) => l.toLowerCase()));
  }
  return common;
}

export const isCommonPassword = (password: string): boolean => commonPasswords().has(normalizePassword(password).toLowerCase());

export type PolicyError = 'too_short' | 'too_long' | 'too_common' | 'same_as_email';

export const PASSWORD_MIN = 8;
export const ADMIN_PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;

/** null when the password is acceptable. */
export function passwordPolicyError(password: string, email: string | null, opts: { admin?: boolean } = {}): PolicyError | null {
  const pw = normalizePassword(password);
  const length = [...pw].length;
  if (length < (opts.admin ? ADMIN_PASSWORD_MIN : PASSWORD_MIN)) return 'too_short';
  if (length > PASSWORD_MAX) return 'too_long';
  const lower = pw.toLowerCase();
  if (email) {
    const e = email.toLowerCase();
    const local = e.slice(0, e.lastIndexOf('@') >= 0 ? e.lastIndexOf('@') : e.length);
    if (lower === e || lower === local) return 'same_as_email';
  }
  if (commonPasswords().has(lower)) return 'too_common';
  return null;
}
