/**
 * The demo dataset (spec 6.7), deterministic so the admin screenshots stay stable:
 * users.id = uuidFrom('demo:' + publicId), every time relative to `now`, extra guests from a PRNG
 * seeded with 42. 40 named users (30 accounts, 2 admins, 8 guests): 20 Pro (store 14, grant 3,
 * promo 3; monthly 7, yearly 9, lifetime 4; 2 trials), 1 disabled. Plus promo codes, notes, store
 * rows and events, 15 audit entries, two settings and the PL price override.
 *
 * Demo accounts use `demo-password-2026` (hashed once, the hash reused); the admins use
 * ADMIN_PASSWORD if set, else `StopWake-admin-2026`.
 */
import type { AuditAction } from '../../../src/api/types.ts';
import { DAY, HOUR, iso, MINUTE } from '../clock.ts';
import { many, one, run, tx, type Db } from '../db/database.ts';
import { CROCKFORD, installIdHash, sha256Hex, uuidFrom } from '../domain/ids.ts';
import type { PasswordHasher } from '../domain/passwords.ts';
import { writeAudit, type AuditTargetType } from '../domain/audit.ts';
import { recomputePlan } from '../domain/plans.ts';

export const DEMO_PASSWORD = 'demo-password-2026';
export const DEMO_ADMIN_PASSWORD = 'StopWake-admin-2026';
export const DEMO_EMAIL = 'lena.weber@example.com';
export const DEMO_PROMO = 'STOPWAKE-DEMO';

/** USD per unit of local currency (6.7). */
export const USD_RATES: Readonly<Record<string, number>> = {
  EUR: 1.16, CHF: 1.24, GBP: 1.34, SEK: 0.105, NOK: 0.099, DKK: 0.155, USD: 1, CAD: 0.72, AUD: 0.65, JPY: 0.0067, INR: 0.0114,
};

type Lang = 'da' | 'de' | 'en' | 'fi' | 'fr' | 'hi' | 'it' | 'ja' | 'nb' | 'nl' | 'sv';

type StoreSetup = {
  kind: 'store';
  plan: 'monthly' | 'yearly' | 'lifetime';
  /** days relative to now (negative = past) */
  purchased: number;
  /** null = lifetime */
  ends: number | null;
  status: 'active' | 'trialing' | 'expired' | 'grace_period';
  willRenew: boolean;
  /** local price in major units (0 for trials) */
  price: number;
  currency: string;
  graceUntil?: number;
  cancelReason?: string;
  lastEvent?: { type: string; daysAgo: number };
};
type GrantSetup = { kind: 'grant'; plan: 'monthly' | 'yearly' | 'lifetime'; by: 'A1' | 'A2'; daysAgo: number; days: number | null; reason: string };
type PromoSetup = { kind: 'promo'; code: string; daysAgo: number };
type Setup = StoreSetup | GrantSetup | PromoSetup | { kind: 'free' } | { kind: 'disabled'; by: 'A2'; daysAgo: number; reason: string };

export type DemoUser = {
  key: string;
  publicId: string;
  name: string | null;
  email: string | null;
  country: string;
  language: Lang;
  joined: number;
  seen: number;
  role?: 'admin';
  setup: Setup;
  appVersion?: string;
  devices?: number;
};

const free = { kind: 'free' } as const;
const store = (s: Omit<StoreSetup, 'kind'>): StoreSetup => ({ kind: 'store', ...s });

/** The table of 6.7, in order (A1, A2, 1–38). */
export const DEMO_USERS: readonly DemoUser[] = [
  { key: 'A1', publicId: 'SW-AP9M-0668', name: 'Alex Admin', email: 'admin@example.com', country: 'DE', language: 'en', joined: 400, seen: 0, role: 'admin', setup: free },
  { key: 'A2', publicId: 'SW-B80G-CJRN', name: 'Sam Support', email: 'support@example.com', country: 'DE', language: 'en', joined: 20, seen: 1, role: 'admin', setup: free },
  { key: '1', publicId: 'SW-7K3P-92QX', name: 'Lena Weber', email: 'lena.weber@example.com', country: 'DE', language: 'de', joined: 210, seen: 0,
    setup: store({ plan: 'yearly', purchased: -200, ends: 165, status: 'active', willRenew: true, price: 9.99, currency: 'EUR' }) },
  { key: '2', publicId: 'SW-9M39-CQ1Z', name: 'Jonas Müller', email: 'jonas.mueller@example.com', country: 'DE', language: 'de', joined: 75, seen: 1,
    setup: store({ plan: 'monthly', purchased: -70, ends: 20, status: 'active', willRenew: true, price: 1.99, currency: 'EUR', lastEvent: { type: 'RENEWAL', daysAgo: 10 } }) },
  { key: '3', publicId: 'SW-R560-HWTG', name: 'Mia Schneider', email: 'mia.schneider@example.com', country: 'DE', language: 'de', joined: 3, seen: 0,
    setup: store({ plan: 'yearly', purchased: -3, ends: 4, status: 'trialing', willRenew: true, price: 0, currency: 'EUR', lastEvent: { type: 'INITIAL_PURCHASE', daysAgo: 3 } }) },
  { key: '4', publicId: 'SW-DFW7-4C22', name: 'Lukas Fischer', email: 'lukas.fischer@example.com', country: 'DE', language: 'de', joined: 400, seen: 25, appVersion: '0.9.4',
    setup: store({ plan: 'yearly', purchased: -385, ends: -20, status: 'expired', willRenew: false, price: 9.99, currency: 'EUR', cancelReason: 'UNSUBSCRIBE', lastEvent: { type: 'EXPIRATION', daysAgo: 20 } }) },
  { key: '5', publicId: 'SW-NEBT-TMZJ', name: 'Hannah Wagner', email: 'hannah.wagner@example.com', country: 'DE', language: 'de', joined: 300, seen: 2,
    setup: { kind: 'grant', plan: 'lifetime', by: 'A1', daysAgo: 75, days: null, reason: 'Beta tester, reported the tunnel bug' } },
  { key: '6', publicId: 'SW-7P22-3AAJ', name: 'Felix Becker', email: 'felix.becker@example.com', country: 'DE', language: 'en', joined: 40, seen: 6, setup: free },
  { key: '7', publicId: 'SW-PK22-TAAT', name: 'Emma Hoffmann', email: 'emma.hoffmann@example.com', country: 'DE', language: 'de', joined: 15, seen: 0, setup: free, devices: 2 },
  { key: '8', publicId: 'SW-4X7K-FR91', name: 'Anna Gruber', email: 'anna.gruber@example.com', country: 'AT', language: 'de', joined: 50, seen: 1,
    setup: store({ plan: 'monthly', purchased: -45, ends: 15, status: 'active', willRenew: true, price: 1.99, currency: 'EUR' }) },
  { key: '9', publicId: 'SW-79WJ-W1EB', name: 'Maximilian Huber', email: 'max.huber@example.com', country: 'AT', language: 'de', joined: 60, seen: 16, appVersion: '0.9.4',
    setup: { kind: 'grant', plan: 'monthly', by: 'A1', daysAgo: 45, days: 30, reason: 'Trial extension after support chat' } },
  { key: '10', publicId: 'SW-WXDG-CK4H', name: 'Laura Meier', email: 'laura.meier@example.com', country: 'CH', language: 'de', joined: 150, seen: 3,
    setup: store({ plan: 'yearly', purchased: -140, ends: 225, status: 'active', willRenew: true, price: 11.0, currency: 'CHF' }) },
  { key: '11', publicId: 'SW-N0NP-GYZK', name: 'Noah Keller', email: 'noah.keller@example.com', country: 'CH', language: 'fr', joined: 9, seen: 5,
    setup: { kind: 'disabled', by: 'A2', daysAgo: 5, reason: 'Promo code abuse with several guest accounts' } },
  { key: '12', publicId: 'SW-JHQN-JG3W', name: 'Daan de Vries', email: 'daan.devries@example.com', country: 'NL', language: 'nl', joined: 130, seen: 4,
    setup: store({ plan: 'lifetime', purchased: -120, ends: null, status: 'active', willRenew: false, price: 14.99, currency: 'EUR' }) },
  { key: '13', publicId: 'SW-3XRQ-67NZ', name: 'Sanne Jansen', email: 'sanne.jansen@example.com', country: 'NL', language: 'nl', joined: 12, seen: 0,
    setup: { kind: 'promo', code: 'WELCOME-2026', daysAgo: 12 } },
  { key: '14', publicId: 'SW-4CW6-RTMB', name: 'Lotte Peeters', email: 'lotte.peeters@example.com', country: 'BE', language: 'nl', joined: 33, seen: 12, setup: free },
  { key: '15', publicId: 'SW-W601-PW95', name: 'Claire Schmit', email: 'claire.schmit@example.com', country: 'LU', language: 'fr', joined: 22, seen: 8, setup: free },
  { key: '16', publicId: 'SW-41D4-V9VA', name: 'Oliver Smith', email: 'oliver.smith@example.com', country: 'GB', language: 'en', joined: 325, seen: 6,
    setup: store({ plan: 'yearly', purchased: -325, ends: 40, status: 'active', willRenew: false, price: 8.99, currency: 'GBP', cancelReason: 'UNSUBSCRIBE', lastEvent: { type: 'CANCELLATION', daysAgo: 6 } }) },
  { key: '17', publicId: 'SW-SKA3-TF42', name: 'Amelia Jones', email: 'amelia.jones@example.com', country: 'GB', language: 'en', joined: 2, seen: 1, setup: free },
  { key: '18', publicId: 'SW-GN9N-BGG8', name: 'Aoife Murphy', email: 'aoife.murphy@example.com', country: 'IE', language: 'en', joined: 31, seen: 7,
    setup: { kind: 'grant', plan: 'yearly', by: 'A1', daysAgo: 30, days: 365, reason: 'Press review copy' } },
  { key: '19', publicId: 'SW-EEFF-V9SG', name: 'Elsa Lindqvist', email: 'elsa.lindqvist@example.com', country: 'SE', language: 'sv', joined: 95, seen: 2,
    setup: store({ plan: 'monthly', purchased: -90, ends: -1, status: 'grace_period', willRenew: true, price: 25, currency: 'SEK', graceUntil: 3, lastEvent: { type: 'BILLING_ISSUE', daysAgo: 1 } }) },
  { key: '20', publicId: 'SW-BY8E-N1FH', name: 'Ingrid Hansen', email: 'ingrid.hansen@example.com', country: 'NO', language: 'nb', joined: 26, seen: 3,
    setup: { kind: 'promo', code: 'WELCOME-2026', daysAgo: 25 } },
  { key: '21', publicId: 'SW-D2X3-4Y3F', name: 'Freja Nielsen', email: 'freja.nielsen@example.com', country: 'DK', language: 'da', joined: 180, seen: 1,
    setup: store({ plan: 'yearly', purchased: -170, ends: 195, status: 'active', willRenew: true, price: 79, currency: 'DKK' }) },
  { key: '22', publicId: 'SW-FNS8-J376', name: 'Aino Virtanen', email: 'aino.virtanen@example.com', country: 'FI', language: 'fi', joined: 61, seen: 9,
    setup: { kind: 'promo', code: 'BETA-TESTERS', daysAgo: 60 } },
  { key: '23', publicId: 'SW-KRBZ-872B', name: 'Camille Dubois', email: 'camille.dubois@example.com', country: 'FR', language: 'fr', joined: 5, seen: 0,
    setup: store({ plan: 'yearly', purchased: -5, ends: 2, status: 'trialing', willRenew: true, price: 0, currency: 'EUR', lastEvent: { type: 'INITIAL_PURCHASE', daysAgo: 5 } }) },
  { key: '24', publicId: 'SW-T94B-VDS6', name: 'Lucas Martin', email: 'lucas.martin@example.com', country: 'FR', language: 'fr', joined: 70, seen: 30, appVersion: '0.9.4', setup: free },
  { key: '25', publicId: 'SW-BVB9-JGSW', name: 'Emily Johnson', email: 'emily.johnson@example.com', country: 'US', language: 'en', joined: 20, seen: 0,
    setup: store({ plan: 'yearly', purchased: -20, ends: 345, status: 'active', willRenew: true, price: 9.99, currency: 'USD' }) },
  { key: '26', publicId: 'SW-NFAP-HNY3', name: 'Liam Tremblay', email: 'liam.tremblay@example.com', country: 'CA', language: 'en', joined: 100, seen: 1,
    setup: { kind: 'grant', plan: 'monthly', by: 'A2', daysAgo: 10, days: 90, reason: 'Missed stop compensation, ticket 1042' } },
  { key: '27', publicId: 'SW-HWEN-FS1P', name: 'Chloe Wilson', email: 'chloe.wilson@example.com', country: 'AU', language: 'en', joined: 18, seen: 2,
    setup: store({ plan: 'lifetime', purchased: -17, ends: null, status: 'active', willRenew: false, price: 24.99, currency: 'AUD' }) },
  { key: '28', publicId: 'SW-FHSA-G19M', name: 'Haruto Sato', email: 'haruto.sato@example.com', country: 'JP', language: 'ja', joined: 14, seen: 0,
    setup: store({ plan: 'monthly', purchased: -14, ends: 16, status: 'active', willRenew: true, price: 300, currency: 'JPY' }) },
  { key: '29', publicId: 'SW-GBE0-QJJW', name: 'Aarav Sharma', email: 'aarav.sharma@example.com', country: 'IN', language: 'hi', joined: 45, seen: 4,
    setup: store({ plan: 'lifetime', purchased: -44, ends: null, status: 'active', willRenew: false, price: 599, currency: 'INR' }) },
  { key: '30', publicId: 'SW-VSQP-GNQY', name: 'Priya Patel', email: 'priya.patel@example.com', country: 'IN', language: 'en', joined: 8, seen: 8, setup: free },
  { key: '31', publicId: 'SW-PDNJ-DRVD', name: null, email: null, country: 'DE', language: 'en', joined: 1, seen: 0, setup: free },
  { key: '32', publicId: 'SW-V4A5-HKSV', name: null, email: null, country: 'DE', language: 'de', joined: 4, seen: 4, setup: free },
  { key: '33', publicId: 'SW-KDKX-6QAY', name: null, email: null, country: 'DE', language: 'de', joined: 11, seen: 2, setup: free },
  { key: '34', publicId: 'SW-PHQ9-BNXA', name: null, email: null, country: 'DE', language: 'de', joined: 27, seen: 27, setup: free },
  { key: '35', publicId: 'SW-7GXN-TTGV', name: null, email: null, country: 'AT', language: 'de', joined: 6, seen: 1, setup: free },
  { key: '36', publicId: 'SW-0KT7-NPC6', name: null, email: null, country: 'GB', language: 'en', joined: 13, seen: 13, setup: free },
  { key: '37', publicId: 'SW-B3SS-PXET', name: null, email: null, country: 'FR', language: 'fr', joined: 19, seen: 3, setup: free },
  { key: '38', publicId: 'SW-XKCS-DBMX', name: null, email: null, country: 'IN', language: 'hi', joined: 0, seen: 0, setup: free },
];

export type DemoPromo = {
  code: string;
  plan: 'monthly' | 'yearly' | 'lifetime';
  durationDays: number | null;
  max: number | null;
  starts: number | null;
  expires: number | null;
  active: boolean;
  description: string;
  created: number;
};

export const DEMO_PROMOS: readonly DemoPromo[] = [
  { code: 'WELCOME-2026', plan: 'monthly', durationDays: 30, max: null, starts: -60, expires: 80, active: true, description: 'Onboarding emails, Q4 2026', created: -60 },
  { code: 'BETA-TESTERS', plan: 'yearly', durationDays: 365, max: 100, starts: null, expires: null, active: true, description: 'Closed beta group', created: -90 },
  { code: 'PRESS-2026', plan: 'lifetime', durationDays: null, max: 20, starts: null, expires: 200, active: true, description: 'Press and reviewers', created: -100 },
  { code: 'SUMMER-26', plan: 'monthly', durationDays: 30, max: 500, starts: -130, expires: -40, active: false, description: 'Summer campaign', created: -135 },
  { code: 'STOPWAKE-DEMO', plan: 'yearly', durationDays: 365, max: null, starts: null, expires: null, active: true, description: 'Demo code for screenshots and testers', created: -2 },
];

const NOTES: readonly { user: string; by: 'A1' | 'A2'; daysAgo: number; body: string }[] = [
  { user: '5', by: 'A1', daysAgo: 75, body: 'Beta tester; prefers German emails.' },
  { user: '1', by: 'A2', daysAgo: 18, body: 'Asked about Wear OS support; told her the watch is planned.' },
  { user: '26', by: 'A2', daysAgo: 10, body: 'Missed Berri-UQAM: GPS dropped in the tunnel. Log received by email 12 days ago.' },
  { user: '16', by: 'A1', daysAgo: 6, body: 'Cancelled: switching to cycling. Happy with the app.' },
  { user: '11', by: 'A2', daysAgo: 5, body: 'Created six guest IDs to redeem WELCOME-2026 repeatedly.' },
  { user: '19', by: 'A2', daysAgo: 1, body: "Card expired; sent her the Google Play payment-method link." },
];

export const DEMO_ANNOUNCEMENT = {
  id: 'winter-timetables',
  enabled: false,
  level: 'info',
  texts: {
    en: {
      title: 'New timetables on 13 December',
      body: 'Trains change their schedules on 13 December. StopWake follows your position, so your alarms keep working.',
    },
    de: {
      title: 'Neue Fahrpläne ab 13. Dezember',
      body: 'Am 13. Dezember ändern sich die Fahrpläne. StopWake folgt deiner Position, deine Wecker funktionieren weiter.',
    },
  },
  url: null,
  countries: ['DE', 'AT', 'CH'],
  minAppVersion: null,
  maxAppVersion: null,
  startsAt: null,
  endsAt: null,
  dismissible: true,
} as const;

export const PL_OVERRIDE = { country: 'PL', currency: 'PLN', monthly: 899, yearly: 4499, lifetime: 6499 } as const;

const PRODUCTS = { monthly: 'stopwake_pro:monthly', yearly: 'stopwake_pro:yearly', lifetime: 'stopwake_lifetime' } as const;
const ADMIN_IPS = { A1: '203.0.113.10', A2: '198.51.100.7' } as const;
const EXTRA_COUNTRIES: readonly [string, number, Lang][] = [
  ['DE', 55, 'de'], ['AT', 8, 'de'], ['CH', 6, 'de'], ['GB', 6, 'en'], ['NL', 5, 'nl'], ['FR', 5, 'fr'], ['SE', 2, 'sv'], ['NO', 2, 'nb'],
  ['DK', 2, 'da'], ['FI', 2, 'fi'], ['BE', 2, 'nl'], ['US', 2, 'en'], ['IN', 2, 'hi'], ['IE', 1, 'en'],
];

/** Deterministic PRNG (mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const demoUserId = (publicId: string): string => uuidFrom(`demo:${publicId}`);

/** Local price × rate (6.7); trials have price 0. */
export const usdPrice = (price: number, currency: string): number => price * (USD_RATES[currency] ?? 1);

const TABLES = [
  'sessions', 'password_reset_tokens', 'promo_redemptions', 'grants', 'store_subscriptions', 'notes', 'webhook_events', 'devices',
  'promo_codes', 'settings', 'country_prices', 'audit_log', 'users',
] as const;

export function isEmptyDatabase(db: Db): boolean {
  return TABLES.every((t) => (one<{ n: number }>(db, `SELECT count(*) AS n FROM ${t}`)?.n ?? 0) === 0);
}

export function clearDatabase(db: Db): void {
  tx(db, () => {
    for (const t of TABLES) run(db, `DELETE FROM ${t}`);
  });
}

export type SeedOptions = {
  now: number;
  extraGuests?: number;
  /** ADMIN_EMAIL: replaces admin@example.com for A1. */
  adminEmail?: string | null;
  /** ADMIN_PASSWORD: the admins' password (else StopWake-admin-2026). */
  adminPassword?: string | null;
  hasher: PasswordHasher;
  planOptions?: { sandboxGrantsPro: boolean };
};

export type SeedSummary = { users: number; guests: number; extraGuests: number; promoCodes: number; auditEntries: number };

/** Seeds the demo data set into an empty, migrated database. */
export async function seedDemo(db: Db, opts: SeedOptions): Promise<SeedSummary> {
  if (!isEmptyDatabase(db)) throw new Error('The database is not empty (use --reset)');
  const demoHash = await opts.hasher.hash(DEMO_PASSWORD);
  const adminHash = await opts.hasher.hash(opts.adminPassword || DEMO_ADMIN_PASSWORD);
  const now = opts.now;
  const at = (days: number, extraMs = 0): number => now + days * DAY + extraMs;
  const planOptions = opts.planOptions ?? { sandboxGrantsPro: true };

  return tx(db, () => {
    const ids = new Map<string, string>();
    const publicIds = new Map<string, string>();
    for (const u of DEMO_USERS) {
      ids.set(u.key, demoUserId(u.publicId));
      publicIds.set(u.key, u.publicId);
    }
    const id = (key: string): string => ids.get(key)!;

    // ---- Users, devices, sessions ----
    DEMO_USERS.forEach((u, index) => {
      // Minutes of offset keep the sort order stable and the times plausible.
      const created = at(-u.joined, -(index + 1) * 7 * MINUTE);
      const seen = Math.max(created, at(-u.seen, -(index % 5) * 11 * MINUTE));
      const email = u.key === 'A1' && opts.adminEmail ? opts.adminEmail : u.email;
      const disabled = u.setup.kind === 'disabled' ? u.setup : null;
      run(
        db,
        `INSERT INTO users (id, public_id, email, email_verified_at, password_hash, password_changed_at, display_name, role, status,
           disabled_at, disabled_reason, country, language, created_at, updated_at, signed_up_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id(u.key), u.publicId, email, u.role === 'admin' ? created : null,
        email ? (u.role === 'admin' ? adminHash : demoHash) : null, email ? created : null,
        u.name, u.role ?? 'user', disabled ? 'disabled' : 'active', disabled ? at(-disabled.daysAgo) : null, disabled?.reason ?? null,
        u.country, u.language, created, seen, email ? Math.min(seen, created + 10 * MINUTE) : null, seen,
      );
      const appVersion = u.appVersion ?? '1.0.0';
      for (let d = 0; d < (u.devices ?? 1); d++) {
        const deviceSeen = d === 0 ? seen : Math.max(created, seen - 2 * DAY);
        const deviceId = run(
          db,
          `INSERT INTO devices (install_id_hash, user_id, platform, app_version, build, os_version, country, language, created_at, last_seen_at)
           VALUES (?, ?, 'android', ?, ?, ?, ?, ?, ?, ?)`,
          installIdHash(uuidFrom(`demo-install:${u.publicId}:${d}`)), id(u.key), appVersion, appVersion === '1.0.0' ? 12 : 9,
          ['13', '14', '15'][(index + d) % 3]!, u.country, u.language, created + d * DAY, deviceSeen,
        ).lastInsertRowid;
        const sessionCreated = Math.max(created, deviceSeen - 3 * DAY);
        run(
          db,
          `INSERT INTO sessions (user_id, device_id, token_hash, method, created_at, last_used_at, expires_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          id(u.key), deviceId, sha256Hex(`demo-session:${u.publicId}:${d}`), email ? 'sign_in' : 'guest',
          sessionCreated, deviceSeen, deviceSeen + 180 * DAY,
        );
      }
    });

    // ---- Promo codes ----
    const promoIds = new Map<string, number>();
    for (const p of DEMO_PROMOS) {
      const created = at(p.created);
      promoIds.set(p.code, run(
        db,
        `INSERT INTO promo_codes (code, plan, duration_days, max_redemptions, redemption_count, starts_at, expires_at, active, description,
           created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)`,
        p.code, p.plan, p.durationDays, p.max, p.starts === null ? null : at(p.starts), p.expires === null ? null : at(p.expires),
        p.active ? 1 : 0, p.description, id('A1'), created, p.code === 'SUMMER-26' ? at(-40) : created,
      ).lastInsertRowid);
    }

    // ---- Entitlements ----
    const storeRowIds = new Map<string, number>();
    for (const u of DEMO_USERS) {
      const s = u.setup;
      if (s.kind === 'grant') {
        const starts = at(-s.daysAgo);
        const grantId = run(
          db,
          `INSERT INTO grants (user_id, plan, source, starts_at, ends_at, reason, created_by, created_at, updated_at)
           VALUES (?, ?, 'admin', ?, ?, ?, ?, ?, ?)`,
          id(u.key), s.plan, starts, s.days === null ? null : starts + s.days * DAY, s.reason, id(s.by), starts, starts,
        ).lastInsertRowid;
        storeRowIds.set(`grant:${u.key}`, grantId);
      } else if (s.kind === 'promo') {
        const promo = DEMO_PROMOS.find((p) => p.code === s.code)!;
        const starts = at(-s.daysAgo);
        const promoId = promoIds.get(s.code)!;
        const grantId = run(
          db,
          `INSERT INTO grants (user_id, plan, source, promo_code_id, starts_at, ends_at, reason, created_by, created_at, updated_at)
           VALUES (?, ?, 'promo', ?, ?, ?, ?, NULL, ?, ?)`,
          id(u.key), promo.plan, promoId, starts, promo.durationDays === null ? null : starts + promo.durationDays * DAY,
          `Promo code ${promo.code}`, starts, starts,
        ).lastInsertRowid;
        run(db, 'INSERT INTO promo_redemptions (promo_code_id, user_id, grant_id, redeemed_at) VALUES (?, ?, ?, ?)', promoId, id(u.key), grantId, starts);
        run(db, 'UPDATE promo_codes SET redemption_count = redemption_count + 1 WHERE id = ?', promoId);
      } else if (s.kind === 'store') {
        const purchased = at(s.purchased);
        const lastEventAt = s.lastEvent ? at(-s.lastEvent.daysAgo) : purchased;
        const lastEventType = s.lastEvent?.type ?? (s.plan === 'lifetime' ? 'NON_RENEWING_PURCHASE' : 'INITIAL_PURCHASE');
        const number = String(Number.parseInt(u.key, 10)).padStart(5, '0');
        const rowId = run(
          db,
          `INSERT INTO store_subscriptions (user_id, store, environment, product_id, plan, original_transaction_id, rc_app_user_id, status,
             period_type, will_renew, purchased_at, expires_at, grace_until, cancel_reason, country, currency, price_local, price_usd,
             last_event_id, last_event_type, last_event_at, created_at, updated_at)
           VALUES (?, 'play_store', 'production', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          id(u.key), PRODUCTS[s.plan], s.plan, `GPA.3391-4210-7766-${number}`, id(u.key), s.status,
          s.status === 'trialing' ? 'trial' : s.plan === 'lifetime' ? null : 'normal', s.willRenew ? 1 : 0, purchased,
          s.ends === null ? null : at(s.ends), s.graceUntil === undefined ? null : at(s.graceUntil), s.cancelReason ?? null,
          u.country, s.currency, s.price, usdPrice(s.price, s.currency),
          s.lastEvent ? uuidFrom(`demo-event:${u.publicId}`) : null, lastEventType, lastEventAt, purchased, lastEventAt,
        ).lastInsertRowid;
        storeRowIds.set(`store:${u.key}`, rowId);
      }
    }

    // ---- Store events (processed) and one ignored TEST event ----
    for (const u of DEMO_USERS) {
      if (u.setup.kind !== 'store' || !u.setup.lastEvent) continue;
      const s = u.setup;
      const ev = s.lastEvent!;
      const eventAt = at(-ev.daysAgo);
      const payload: Record<string, unknown> = {
        id: uuidFrom(`demo-event:${u.publicId}`).toUpperCase(),
        type: ev.type,
        app_id: 'app1a2b3c4d5',
        app_user_id: id(u.key),
        original_app_user_id: id(u.key),
        aliases: [id(u.key)],
        event_timestamp_ms: eventAt,
        product_id: PRODUCTS[s.plan],
        entitlement_ids: ['pro'],
        period_type: s.status === 'trialing' ? 'TRIAL' : 'NORMAL',
        purchased_at_ms: ev.type === 'RENEWAL' ? at(-10) : at(s.purchased),
        expiration_at_ms: s.ends === null ? null : at(s.ends),
        store: 'PLAY_STORE',
        environment: 'PRODUCTION',
        transaction_id: `GPA.3391-4210-7766-${String(Number.parseInt(u.key, 10)).padStart(5, '0')}`,
        original_transaction_id: `GPA.3391-4210-7766-${String(Number.parseInt(u.key, 10)).padStart(5, '0')}`,
        country_code: u.country,
        currency: s.currency,
        price: usdPrice(s.price, s.currency),
        price_in_purchased_currency: s.price,
      };
      if (ev.type === 'CANCELLATION') payload.cancel_reason = 'UNSUBSCRIBE';
      if (ev.type === 'EXPIRATION') payload.expiration_reason = 'UNSUBSCRIBE';
      if (ev.type === 'BILLING_ISSUE') payload.grace_period_expiration_at_ms = at(s.graceUntil ?? 0);
      run(
        db,
        `INSERT INTO webhook_events (id, type, app_user_id, user_id, environment, event_at, received_at, processed_at, status, error, payload)
         VALUES (?, ?, ?, ?, 'production', ?, ?, ?, 'processed', NULL, ?)`,
        payload.id as string, ev.type, id(u.key), id(u.key), eventAt, eventAt + 2_000, eventAt + 2_050, JSON.stringify(payload),
      );
    }
    const testAt = at(-1, -3 * HOUR);
    const testEvent = {
      id: uuidFrom('demo-event:test').toUpperCase(), type: 'TEST', app_id: 'app1a2b3c4d5', app_user_id: '$RCAnonymousID:demo-test',
      event_timestamp_ms: testAt, store: 'PLAY_STORE', environment: 'SANDBOX',
    };
    run(
      db,
      `INSERT INTO webhook_events (id, type, app_user_id, user_id, environment, event_at, received_at, processed_at, status, error, payload)
       VALUES (?, 'TEST', ?, NULL, 'sandbox', ?, ?, ?, 'ignored', NULL, ?)`,
      testEvent.id, testEvent.app_user_id, testAt, testAt + 1_500, testAt + 1_520, JSON.stringify(testEvent),
    );

    // ---- Notes ----
    for (const n of NOTES) {
      const t = at(-n.daysAgo, -2 * HOUR);
      run(db, 'INSERT INTO notes (user_id, author_id, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', id(n.user), id(n.by), n.body, t, t);
    }

    // ---- Settings and the PL price override ----
    run(db, 'INSERT INTO settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)', 'support.email', JSON.stringify('support@example.com'), at(-120), id('A1'));
    run(db, 'INSERT INTO settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)', 'announcement', JSON.stringify(DEMO_ANNOUNCEMENT), at(-1), id('A1'));
    run(
      db,
      `INSERT INTO country_prices (country, currency, monthly_minor, yearly_minor, lifetime_minor, trial_days, format, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
      PL_OVERRIDE.country, PL_OVERRIDE.currency, PL_OVERRIDE.monthly, PL_OVERRIDE.yearly, PL_OVERRIDE.lifetime, at(-30), id('A1'),
    );

    // ---- Audit (15 entries, oldest first) ----
    const userTarget = (key: string) => ({ type: 'user', id: id(key), user: id(key), label: publicIds.get(key)! });
    const grantTarget = (key: string) => ({ type: 'grant', id: String(storeRowIds.get(`grant:${key}`)), user: id(key), label: publicIds.get(key)! });
    const promoTarget = (code: string) => ({ type: 'promo_code', id: String(promoIds.get(code)), user: null, label: code });
    const grantDetails = (key: string) => {
      const u = DEMO_USERS.find((x) => x.key === key)!;
      const g = u.setup as GrantSetup;
      const starts = at(-g.daysAgo);
      return { grantId: storeRowIds.get(`grant:${key}`), plan: g.plan, endsAt: g.days === null ? null : iso(starts + g.days * DAY), reason: g.reason };
    };
    const promoDetails = (code: string) => {
      const p = DEMO_PROMOS.find((x) => x.code === code)!;
      return { code, plan: p.plan, durationDays: p.durationDays, maxRedemptions: p.max };
    };
    const announcementBefore = null;
    const entries: { days: number; by: 'A1' | 'A2'; action: string; target: { type: string; id: string | null; user: string | null; label: string | null }; details: unknown }[] = [
      { days: -120, by: 'A1', action: 'settings.update', target: { type: 'settings', id: null, user: null, label: 'support.email' },
        details: { keys: ['support.email'], before: { 'support.email': 'help@example.com' }, after: { 'support.email': 'support@example.com' } } },
      { days: -90, by: 'A1', action: 'promo.create', target: promoTarget('BETA-TESTERS'), details: promoDetails('BETA-TESTERS') },
      { days: -75, by: 'A1', action: 'grant.create', target: grantTarget('5'), details: grantDetails('5') },
      { days: -60, by: 'A1', action: 'promo.create', target: promoTarget('WELCOME-2026'), details: promoDetails('WELCOME-2026') },
      { days: -45, by: 'A1', action: 'grant.create', target: grantTarget('9'), details: grantDetails('9') },
      { days: -40, by: 'A1', action: 'promo.update', target: promoTarget('SUMMER-26'), details: { before: { active: true }, after: { active: false } } },
      { days: -30, by: 'A1', action: 'grant.create', target: grantTarget('18'), details: grantDetails('18') },
      { days: -30, by: 'A1', action: 'price.update', target: { type: 'price', id: 'PL', user: null, label: 'PL' },
        details: { country: 'PL', before: null, after: { country: 'PL', currency: 'PLN', monthly: 899, yearly: 4499, lifetime: 6499, trialDays: null } } },
      { days: -20, by: 'A1', action: 'user.role', target: userTarget('A2'), details: { before: 'user', after: 'admin' } },
      { days: -10, by: 'A2', action: 'grant.create', target: grantTarget('26'), details: grantDetails('26') },
      { days: -10, by: 'A2', action: 'note.create', target: { type: 'note', id: null, user: id('26'), label: publicIds.get('26')! }, details: { noteId: null } },
      { days: -5, by: 'A2', action: 'user.disable', target: userTarget('11'), details: { reason: 'Promo code abuse with several guest accounts' } },
      { days: -5, by: 'A2', action: 'note.create', target: { type: 'note', id: null, user: id('11'), label: publicIds.get('11')! }, details: { noteId: null } },
      { days: -2, by: 'A1', action: 'promo.create', target: promoTarget('STOPWAKE-DEMO'), details: promoDetails('STOPWAKE-DEMO') },
      { days: -1, by: 'A1', action: 'settings.update', target: { type: 'settings', id: null, user: null, label: 'announcement' },
        details: { keys: ['announcement'], before: { announcement: announcementBefore }, after: { announcement: { id: DEMO_ANNOUNCEMENT.id, enabled: false } } } },
    ];
    const noteIds = new Map(many<{ id: number; user_id: string }>(db, 'SELECT id, user_id FROM notes').map((n) => [n.user_id, n.id]));
    entries.forEach((e, i) => {
      if (e.action === 'note.create' && e.target.user) {
        const noteId = noteIds.get(e.target.user) ?? null;
        e.target.id = noteId === null ? null : String(noteId);
        e.details = { noteId };
      }
      writeAudit(db, {
        at: at(e.days, -(15 - i) * MINUTE),
        actor: { id: id(e.by), label: publicIds.get(e.by)! },
        action: e.action as AuditAction,
        target: { type: e.target.type as AuditTargetType, id: e.target.id, userId: e.target.user, label: e.target.label },
        details: e.details as Record<string, unknown>,
        ip: ADMIN_IPS[e.by],
        requestId: uuidFrom(`demo-request:${i}`),
      });
    });

    // ---- Extra guests (PRNG seed 42) ----
    const extra = Math.max(0, Math.floor(opts.extraGuests ?? 0));
    const rand = mulberry32(42);
    const taken = new Set(DEMO_USERS.map((u) => u.publicId));
    const totalWeight = EXTRA_COUNTRIES.reduce((n, [, w]) => n + w, 0);
    for (let i = 0; i < extra; i++) {
      let r = rand() * totalWeight;
      let pick = EXTRA_COUNTRIES[0]!;
      for (const c of EXTRA_COUNTRIES) {
        r -= c[1];
        if (r < 0) {
          pick = c;
          break;
        }
      }
      const created = now - Math.floor(rand() * 90 * DAY);
      const seen = created + Math.floor(rand() * (now - created));
      const appVersion = rand() < 0.8 ? '1.0.0' : '0.9.4';
      let publicId = '';
      do {
        let s = '';
        for (let k = 0; k < 8; k++) s += CROCKFORD[Math.floor(rand() * 32)];
        publicId = `SW-${s.slice(0, 4)}-${s.slice(4)}`;
      } while (taken.has(publicId));
      taken.add(publicId);
      const userId = demoUserId(publicId);
      const osVersion = ['13', '14', '15'][Math.floor(rand() * 3)]!;
      run(
        db,
        `INSERT INTO users (id, public_id, country, language, created_at, updated_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        userId, publicId, pick[0], pick[2], created, seen, seen,
      );
      const deviceId = run(
        db,
        `INSERT INTO devices (install_id_hash, user_id, platform, app_version, build, os_version, country, language, created_at, last_seen_at)
         VALUES (?, ?, 'android', ?, ?, ?, ?, ?, ?, ?)`,
        installIdHash(uuidFrom(`demo-install:${publicId}:0`)), userId, appVersion, appVersion === '1.0.0' ? 12 : 9, osVersion,
        pick[0], pick[2], created, seen,
      ).lastInsertRowid;
      run(
        db,
        `INSERT INTO sessions (user_id, device_id, token_hash, method, created_at, last_used_at, expires_at) VALUES (?, ?, ?, 'guest', ?, ?, ?)`,
        userId, deviceId, sha256Hex(`demo-session:${publicId}:0`), created, seen, seen + 180 * DAY,
      );
    }

    // ---- Effective plans ----
    for (const u of DEMO_USERS) recomputePlan(db, id(u.key), now, planOptions);

    return {
      users: DEMO_USERS.length + extra,
      guests: DEMO_USERS.filter((u) => u.email === null).length + extra,
      extraGuests: extra,
      promoCodes: DEMO_PROMOS.length,
      auditEntries: entries.length,
    };
  });
}
