/**
 * In-memory fixed-window rate limits (spec 4.3). The server runs as a single instance by design,
 * so the counters live in this process. Keys are swept every minute and capped at 100k entries.
 */
import { HOUR, MINUTE, type Clock } from '../clock.ts';
import { ApiError } from './errors.ts';

export type RuleKey = 'ip' | 'user' | 'email' | 'email+ip';
export type Rule = { limit: number; windowMs: number; key: RuleKey };

export const RULES = {
  /** Every route except the webhook. */
  global: { limit: 1200, windowMs: 10 * MINUTE, key: 'ip' },
  guest: { limit: 60, windowMs: 10 * MINUTE, key: 'ip' },
  signup: { limit: 10, windowMs: HOUR, key: 'ip' },
  /** Sign-in attempts per IP. */
  signin: { limit: 30, windowMs: 15 * MINUTE, key: 'ip' },
  /** Sign-in failures: checked before verifying the password, counted only on failure. */
  signinFailEmailIp: { limit: 5, windowMs: 15 * MINUTE, key: 'email+ip' },
  signinFailEmail: { limit: 20, windowMs: HOUR, key: 'email' },
  forgot: { limit: 10, windowMs: HOUR, key: 'ip' },
  forgotEmail: { limit: 3, windowMs: HOUR, key: 'email' },
  reset: { limit: 20, windowMs: HOUR, key: 'ip' },
  redeemUser: { limit: 10, windowMs: HOUR, key: 'user' },
  redeemIp: { limit: 30, windowMs: HOUR, key: 'ip' },
  sync: { limit: 6, windowMs: HOUR, key: 'user' },
  /** PATCH /me, /me/password, /me/export, DELETE /me, sign-out-all. */
  account: { limit: 20, windowMs: HOUR, key: 'user' },
  /** Per admin user, on every admin route. */
  admin: { limit: 600, windowMs: 10 * MINUTE, key: 'user' },
} as const satisfies Record<string, Rule>;

export type RuleName = keyof typeof RULES;

type Entry = { start: number; count: number; windowMs: number };

export type RateLimiter = {
  readonly enabled: boolean;
  /** Counts one hit; throws 429 rate_limited when the window is already full. */
  consume(rule: RuleName, key: string): void;
  /** Throws 429 when the window is full, without counting (failure counters). */
  check(rule: RuleName, key: string): void;
  /** Counts one hit without checking (a failure that happened). */
  record(rule: RuleName, key: string): void;
  /** Removes expired windows. */
  sweep(): void;
  size(): number;
  clear(): void;
};

export function rateLimited(retryAfterSeconds: number): ApiError {
  return new ApiError(429, 'rate_limited', 'Too many requests, try again later', {
    retryAfterSeconds,
    headers: { 'Retry-After': String(retryAfterSeconds) },
  });
}

export function createRateLimiter(opts: { clock: Clock; enabled?: boolean; maxKeys?: number }): RateLimiter {
  const enabled = opts.enabled ?? true;
  const maxKeys = opts.maxKeys ?? 100_000;
  const entries = new Map<string, Entry>();

  const current = (rule: RuleName, key: string, now: number): { id: string; entry: Entry | undefined } => {
    const id = `${rule}\u0000${key}`;
    const entry = entries.get(id);
    if (entry && now >= entry.start + entry.windowMs) {
      entries.delete(id);
      return { id, entry: undefined };
    }
    return { id, entry };
  };

  const sweep = (): void => {
    const now = opts.clock.now();
    for (const [id, e] of entries) if (now >= e.start + e.windowMs) entries.delete(id);
  };

  const makeRoom = (): void => {
    if (entries.size < maxKeys) return;
    sweep();
    // Still full (e.g. under a spray of addresses): drop the oldest tenth.
    let drop = entries.size - maxKeys + Math.ceil(maxKeys / 10);
    for (const id of entries.keys()) {
      if (drop-- <= 0) break;
      entries.delete(id);
    }
  };

  const reject = (entry: Entry, now: number): never => {
    throw rateLimited(Math.max(1, Math.ceil((entry.start + entry.windowMs - now) / 1000)));
  };

  const increment = (rule: RuleName, key: string, now: number, id: string, entry: Entry | undefined): void => {
    if (entry) {
      entry.count += 1;
      return;
    }
    makeRoom();
    entries.set(id, { start: now, count: 1, windowMs: RULES[rule].windowMs });
  };

  return {
    enabled,
    consume(rule, key) {
      if (!enabled) return;
      const now = opts.clock.now();
      const { id, entry } = current(rule, key, now);
      if (entry && entry.count >= RULES[rule].limit) reject(entry, now);
      increment(rule, key, now, id, entry);
    },
    check(rule, key) {
      if (!enabled) return;
      const now = opts.clock.now();
      const { entry } = current(rule, key, now);
      if (entry && entry.count >= RULES[rule].limit) reject(entry, now);
    },
    record(rule, key) {
      if (!enabled) return;
      const now = opts.clock.now();
      const { id, entry } = current(rule, key, now);
      increment(rule, key, now, id, entry);
    },
    sweep,
    size: () => entries.size,
    clear: () => entries.clear(),
  };
}
