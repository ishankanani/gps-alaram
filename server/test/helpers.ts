/**
 * Test harness (spec 6.11): createApp() on port 0 with DATABASE_PATH=:memory:, SCRYPT_N=1024,
 * MAIL_MODE=memory and a controllable clock; tests call it with fetch.
 */
import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { AuthResponse } from '../../src/api/types.ts';
import { createApp, type App } from '../src/app.ts';
import { createTestClock, type TestClock } from '../src/clock.ts';
import { loadConfig, type Config } from '../src/config.ts';
import { openDatabase, type Db } from '../src/db/database.ts';
import { migrate } from '../src/db/migrate.ts';
import { recomputePlan } from '../src/domain/plans.ts';
import type { RevenueCatApi } from '../src/domain/revenuecat-api.ts';
import { createAccount, getUserByEmail } from '../src/domain/users.ts';
import { createLogger, type Logger } from '../src/log.ts';
import { createMailer, type OutgoingMail } from '../src/mail/mailer.ts';
import { seedDemo, type SeedSummary } from '../src/seed/demo.ts';

/** 2026-10-10T08:00:00.000Z */
export const T0 = Date.UTC(2026, 9, 10, 8, 0, 0);
export const X_CLIENT = 'android/1.0.0/12/14';

export type TestResponse<T = any> = { status: number; body: T; headers: Headers; text: string };

export type RequestOptions = {
  token?: string | null;
  body?: unknown;
  /** Sent as is (no JSON encoding). */
  rawBody?: string | Buffer;
  /** Extra headers; a null value removes a default header. */
  headers?: Record<string, string | null>;
};

export type Session = { token: string; user: AuthResponse['user']; installId: string; response: AuthResponse };

export type TestServer = {
  url: string;
  clock: TestClock;
  db: Db;
  app: App;
  config: Config;
  /** MAIL_MODE=memory: every queued mail. */
  mail: OutgoingMail[];
  logs: string[];
  request<T = any>(method: string, path: string, opts?: RequestOptions): Promise<TestResponse<T>>;
  /** A new guest (POST /v1/auth/guest). */
  guest(opts?: { installId?: string; headers?: Record<string, string | null> }): Promise<Session>;
  /** A guest that signs up (POST /v1/auth/sign-up). */
  account(email: string, password?: string, opts?: { displayName?: string }): Promise<Session>;
  signIn(email: string, password: string, opts?: { token?: string | null; installId?: string }): Promise<TestResponse>;
  /** A fresh admin session (the admin account is created on first use). */
  adminToken(email?: string): Promise<string>;
  seed(extraGuests?: number): Promise<SeedSummary>;
  close(): Promise<void>;
};

export const PASSWORD = 'correct horse battery';
export const ADMIN_PASSWORD = 'admin password 2026!';

export async function startTestServer(
  opts: { now?: number | string; env?: Record<string, string>; revenuecat?: RevenueCatApi | null; log?: Logger } = {},
): Promise<TestServer> {
  const env = {
    NODE_ENV: 'test',
    DATABASE_PATH: ':memory:',
    SCRYPT_N: '1024',
    SCRYPT_P: '1',
    MAIL_MODE: 'memory',
    RATE_LIMITS: 'off',
    LOG_LEVEL: 'silent',
    PUBLIC_URL: 'https://api.example.com',
    SUPPORT_EMAIL: 'support@example.com',
    REVENUECAT_WEBHOOK_SECRET: 'test-webhook-secret',
    ...opts.env,
  };
  const config = loadConfig(env);
  const clock = createTestClock(opts.now ?? T0);
  const db = openDatabase(config.databasePath);
  migrate(db);
  const logs: string[] = [];
  const log = opts.log ?? createLogger({ level: config.logLevel === 'silent' ? 'silent' : config.logLevel, clock, sink: (l) => logs.push(l) });
  const mailer = createMailer({ mode: config.mailMode, from: config.mailFrom, log, clock, transport: async () => {} });
  const app = createApp({ db, clock, config, mailer, revenuecat: opts.revenuecat ?? null, log });
  const server: Server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const request = async <T = any>(method: string, path: string, o: RequestOptions = {}): Promise<TestResponse<T>> => {
    const headers: Record<string, string> = { 'X-Client': X_CLIENT };
    if (o.token) headers.Authorization = `Bearer ${o.token}`;
    if (o.body !== undefined) headers['Content-Type'] = 'application/json';
    for (const [k, v] of Object.entries(o.headers ?? {})) {
      for (const existing of Object.keys(headers)) if (existing.toLowerCase() === k.toLowerCase()) delete headers[existing];
      if (v !== null) headers[k] = v;
    }
    const res = await fetch(`${url}${path}`, {
      method,
      headers,
      body: o.rawBody !== undefined ? o.rawBody : o.body !== undefined ? JSON.stringify(o.body) : undefined,
    });
    const text = await res.text();
    let body: any = null;
    if (text && (res.headers.get('content-type') ?? '').includes('application/json')) body = JSON.parse(text);
    return { status: res.status, body: body as T, headers: res.headers, text };
  };

  const guest = async (g: { installId?: string; headers?: Record<string, string | null> } = {}): Promise<Session> => {
    const installId = g.installId ?? randomUUID();
    const res = await request<AuthResponse>('POST', '/v1/auth/guest', { body: { installId }, headers: g.headers });
    if (res.status !== 201 && res.status !== 200) throw new Error(`guest failed: ${res.status} ${res.text}`);
    return { token: res.body.token, user: res.body.user, installId, response: res.body };
  };

  const account = async (email: string, password = PASSWORD, a: { displayName?: string } = {}): Promise<Session> => {
    const g = await guest();
    const res = await request<AuthResponse>('POST', '/v1/auth/sign-up', {
      token: g.token, body: { email, password, ...(a.displayName ? { displayName: a.displayName } : {}) },
    });
    if (res.status !== 201) throw new Error(`sign-up failed: ${res.status} ${res.text}`);
    return { token: res.body.token, user: res.body.user, installId: g.installId, response: res.body };
  };

  const signIn = (email: string, password: string, s: { token?: string | null; installId?: string } = {}) =>
    request('POST', '/v1/auth/sign-in', { token: s.token ?? null, body: { email, password, installId: s.installId ?? randomUUID() } });

  const adminToken = async (email = 'root@example.com'): Promise<string> => {
    if (!getUserByEmail(db, email)) {
      const hash = await app.context.hasher.hash(ADMIN_PASSWORD);
      createAccount(db, { email, passwordHash: hash, role: 'admin', now: clock.now() });
    }
    const res = await signIn(email, ADMIN_PASSWORD);
    if (res.status !== 200) throw new Error(`admin sign-in failed: ${res.status} ${res.text}`);
    return res.body.token as string;
  };

  return {
    url,
    clock,
    db,
    app,
    config,
    mail: mailer.sent,
    logs,
    request,
    guest,
    account,
    signIn,
    adminToken,
    seed: (extraGuests = 0) => seedDemo(db, { now: clock.now(), extraGuests, hasher: app.context.hasher }),
    close: async () => {
      mailer.close();
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      });
      db.close();
    },
  };
}

/** Rows of a table, for assertions. */
export const rows = <T = Record<string, unknown>>(db: Db, sql: string, ...params: Array<string | number | null>): T[] =>
  db.prepare(sql).all(...params) as T[];

export const count = (db: Db, sql: string, ...params: Array<string | number | null>): number =>
  Number((db.prepare(sql).get(...params) as { n: number }).n);

// ---- Admin test utilities ----

export type AuditRow = {
  id: number;
  at: number;
  actor_id: string | null;
  actor_label: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  target_user_id: string | null;
  target_label: string | null;
  details: string;
  ip: string | null;
  request_id: string | null;
};

/** The highest audit row id so far (0 when empty). */
export const lastAuditId = (db: Db): number => count(db, 'SELECT coalesce(max(id), 0) AS n FROM audit_log');

/** Audit rows written after `afterId`, oldest first. */
export const auditRowsAfter = (db: Db, afterId: number): AuditRow[] =>
  rows<AuditRow>(db, 'SELECT * FROM audit_log WHERE id > ? ORDER BY id', afterId);

/** Runs `fn` and returns its result with the audit rows and the mails it produced. */
export async function tracked<T>(s: TestServer, fn: () => Promise<T>): Promise<{ result: T; audit: AuditRow[]; mail: OutgoingMail[] }> {
  const auditBefore = lastAuditId(s.db);
  const mailBefore = s.mail.length;
  const result = await fn();
  return { result, audit: auditRowsAfter(s.db, auditBefore), mail: s.mail.slice(mailBefore) };
}

/** Inserts a production Play Store subscription row (default: monthly, active, renewing, ends in 20 days) and recomputes the plan. */
export function insertStoreSubscription(
  db: Db,
  userId: string,
  now: number,
  opts: { plan?: 'monthly' | 'yearly' | 'lifetime'; status?: string; willRenew?: 0 | 1; expiresInDays?: number | null; transactionId?: string } = {},
): number {
  const plan = opts.plan ?? 'monthly';
  const expires = opts.expiresInDays === null || plan === 'lifetime' ? null : now + (opts.expiresInDays ?? 20) * 86_400_000;
  const r = db.prepare(
    `INSERT INTO store_subscriptions (user_id, store, environment, product_id, plan, original_transaction_id, rc_app_user_id, status, will_renew,
       purchased_at, expires_at, last_event_at, created_at, updated_at)
     VALUES (?, 'play_store', 'production', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    userId, plan === 'lifetime' ? 'stopwake_lifetime' : `stopwake_pro:${plan}`, plan, opts.transactionId ?? `GPA.test-${randomUUID()}`, userId,
    opts.status ?? 'active', plan === 'lifetime' ? 0 : (opts.willRenew ?? 1), now - 86_400_000, expires, now, now, now,
  );
  recomputePlan(db, userId, now, { sandboxGrantsPro: true });
  return Number(r.lastInsertRowid);
}
