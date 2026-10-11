/**
 * Admin dashboard (spec 2.10): plain indexed queries over the denormalized plan columns (1.3).
 * Merged users are always excluded; days are UTC.
 *
 * - pro.total: active users with plan_until > now; share = pro / users (4 decimals).
 * - store.active: production rows whose access end is in the future and whose status is not
 *   expired/refunded; renewing: will_renew = 1; billingIssues: billing_issue or grace_period.
 * - mrrUsd: active non-trial production monthly/yearly rows, price_usd (monthly) or price_usd / 12
 *   (yearly), rounded to cents. lifetime30d: production lifetime purchases in the last 30 days.
 * - signupsByDay: users created per UTC day, split by their current kind (guest / account).
 */
import type { AdminDashboard, PaidPlan, PlanSource } from '../../../src/api/types.ts';
import { DAY, iso, isoOrNull } from '../clock.ts';
import { many, one, type Db } from '../db/database.ts';
import { recentAuditEntries } from './audit.ts';
import { promoStatus, type PromoRow } from './promo.ts';

export const DASHBOARD_DAYS = [7, 30, 90] as const;
export type DashboardDays = (typeof DASHBOARD_DAYS)[number];

const startOfUtcDay = (ms: number): number => Math.floor(ms / DAY) * DAY;
const dayKey = (ms: number): string => iso(ms).slice(0, 10);

/** Access has not ended: lifetime, or max(expires_at, grace_until) > now. */
const STORE_LIVE = "(s.expires_at IS NULL OR max(s.expires_at, coalesce(s.grace_until, 0)) > :now) AND s.status NOT IN ('expired', 'refunded')";

export function buildDashboard(db: Db, input: { now: number; days: DashboardDays; webhookConfigured: boolean }): AdminDashboard {
  const { now, days } = input;
  const count = (sql: string, params: Record<string, number | string> = {}): number =>
    one<{ n: number | null }>(db, sql, params)?.n ?? 0;
  const notMerged = "status != 'merged'";

  const users = one<{ total: number; accounts: number; guests: number; admins: number; disabled: number }>(
    db,
    `SELECT count(*) AS total,
       coalesce(sum(email IS NOT NULL), 0) AS accounts,
       coalesce(sum(email IS NULL), 0) AS guests,
       coalesce(sum(role = 'admin'), 0) AS admins,
       coalesce(sum(status = 'disabled'), 0) AS disabled
     FROM users WHERE ${notMerged}`,
  )!;
  const today = startOfUtcDay(now);
  const createdSince = (t: number): number => count(`SELECT count(*) AS n FROM users WHERE ${notMerged} AND created_at >= :t`, { t });
  const seenSince = (t: number): number => count(`SELECT count(*) AS n FROM users WHERE ${notMerged} AND last_seen_at >= :t`, { t });

  const proRows = many<{ plan: PaidPlan; plan_source: PlanSource; plan_trial: number; n: number }>(
    db,
    `SELECT plan, plan_source, plan_trial, count(*) AS n FROM users
     WHERE status = 'active' AND plan_until IS NOT NULL AND plan_until > :now
     GROUP BY plan, plan_source, plan_trial`,
    { now },
  );
  const bySource: Record<PlanSource, number> = { store: 0, grant: 0, promo: 0 };
  const byPlan: Record<PaidPlan, number> = { monthly: 0, yearly: 0, lifetime: 0 };
  let proTotal = 0;
  let trials = 0;
  for (const r of proRows) {
    proTotal += r.n;
    if (r.plan_source in bySource) bySource[r.plan_source] += r.n;
    if (r.plan in byPlan) byPlan[r.plan] += r.n;
    if (r.plan_trial === 1) trials += r.n;
  }

  const live = (env: 'production' | 'sandbox', extra = ''): number =>
    count(`SELECT count(*) AS n FROM store_subscriptions s WHERE s.environment = :env AND ${STORE_LIVE} ${extra}`, { now, env });
  const mrrRows = many<{ plan: PaidPlan; price_usd: number | null }>(
    db,
    `SELECT s.plan, s.price_usd FROM store_subscriptions s
     WHERE s.environment = 'production' AND ${STORE_LIVE} AND s.status != 'trialing' AND s.plan IN ('monthly', 'yearly')`,
    { now },
  );
  let mrr = 0;
  for (const r of mrrRows) mrr += r.plan === 'monthly' ? (r.price_usd ?? 0) : (r.price_usd ?? 0) / 12;

  const promos = many<PromoRow>(db, 'SELECT * FROM promo_codes');

  const firstDay = today - (days - 1) * DAY;
  const series = new Map<string, { date: string; guests: number; accounts: number }>();
  for (let t = firstDay; t <= today; t += DAY) series.set(dayKey(t), { date: dayKey(t), guests: 0, accounts: 0 });
  for (const r of many<{ day: number; guests: number; accounts: number }>(
    db,
    // node:sqlite binds JS numbers as REAL: without the CAST every user would be its own "day".
    `SELECT CAST(created_at / :dayMs AS INTEGER) AS day, coalesce(sum(email IS NULL), 0) AS guests, coalesce(sum(email IS NOT NULL), 0) AS accounts
     FROM users WHERE ${notMerged} AND created_at >= :from GROUP BY day`,
    { from: firstDay, dayMs: DAY },
  )) {
    const entry = series.get(dayKey(r.day * DAY));
    if (entry) {
      entry.guests = r.guests;
      entry.accounts = r.accounts;
    }
  }

  const countries = many<{ country: string; users: number; pro: number }>(
    db,
    `SELECT country, count(*) AS users,
       coalesce(sum(status = 'active' AND plan_until IS NOT NULL AND plan_until > :now), 0) AS pro
     FROM users WHERE ${notMerged} AND country IS NOT NULL
     GROUP BY country ORDER BY users DESC, country ASC LIMIT 10`,
    { now },
  );
  const appVersions = many<{ version: string; devices: number }>(
    db,
    `SELECT d.app_version AS version, count(*) AS devices FROM devices d JOIN users u ON u.id = d.user_id
     WHERE d.last_seen_at >= :t AND u.status != 'merged'
     GROUP BY d.app_version ORDER BY devices DESC, d.app_version DESC`,
    { t: now - 30 * DAY },
  );
  const lastEvent = one<{ t: number | null }>(db, 'SELECT max(received_at) AS t FROM webhook_events')?.t ?? null;

  return {
    generatedAt: iso(now),
    users: {
      total: users.total,
      accounts: users.accounts,
      guests: users.guests,
      admins: users.admins,
      disabled: users.disabled,
      new: { today: createdSince(today), last7d: createdSince(now - 7 * DAY), last30d: createdSince(now - 30 * DAY) },
      active: { last1d: seenSince(now - DAY), last7d: seenSince(now - 7 * DAY), last30d: seenSince(now - 30 * DAY) },
    },
    pro: {
      total: proTotal,
      share: users.total > 0 ? Math.round((proTotal / users.total) * 10_000) / 10_000 : 0,
      trials,
      bySource,
      byPlan,
    },
    store: {
      active: live('production'),
      renewing: live('production', 'AND s.will_renew = 1'),
      billingIssues: live('production', "AND s.status IN ('billing_issue', 'grace_period')"),
      mrrUsd: Math.round(mrr * 100) / 100,
      lifetime30d: count(
        `SELECT count(*) AS n FROM store_subscriptions s WHERE s.environment = 'production' AND s.plan = 'lifetime'
         AND s.status != 'refunded' AND s.purchased_at >= :t`,
        { t: now - 30 * DAY },
      ),
      sandboxActive: live('sandbox'),
    },
    promo: {
      activeCodes: promos.filter((p) => promoStatus(p, now) === 'active').length,
      redemptions30d: count('SELECT count(*) AS n FROM promo_redemptions WHERE redeemed_at >= :t', { t: now - 30 * DAY }),
    },
    signupsByDay: [...series.values()],
    countries,
    appVersions,
    webhooks: {
      configured: input.webhookConfigured,
      lastEventAt: isoOrNull(lastEvent),
      errors24h: count("SELECT count(*) AS n FROM webhook_events WHERE status = 'error' AND received_at >= :t", { t: now - DAY }),
      unmatched7d: count("SELECT count(*) AS n FROM webhook_events WHERE status = 'unmatched' AND received_at >= :t", { t: now - 7 * DAY }),
    },
    recentAudit: recentAuditEntries(db, 10),
  };
}
