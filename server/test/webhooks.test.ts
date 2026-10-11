import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';

import { DAY } from '../src/clock.ts';
import type { StoreSubscriptionRow } from '../src/domain/plans.ts';
import type { RevenueCatApi } from '../src/domain/revenuecat-api.ts';
import { count, rows, startTestServer, T0, type Session, type TestServer } from './helpers.ts';

const FIXTURES = new URL('./fixtures/revenuecat/', import.meta.url);
const SECRET = 'test-webhook-secret';

type Body = { api_version: string; event: Record<string, unknown> };

/** A fixture with placeholders replaced, a fresh event id and per-test overrides. */
function fixture(name: string, vars: Record<string, string>, patch: Record<string, unknown> = {}): Body {
  let text = readFileSync(new URL(`${name}.json`, FIXTURES), 'utf8');
  for (const [k, v] of Object.entries(vars)) text = text.replaceAll(k, v);
  const body = JSON.parse(text) as Body;
  body.event = { ...body.event, id: randomUUID().toUpperCase(), ...patch };
  return body;
}

let s: TestServer;
before(async () => {
  s = await startTestServer();
});
after(() => s.close());

const send = (body: unknown, secret: string | null = SECRET) =>
  s.request('POST', '/v1/webhooks/revenuecat', { body, headers: { Authorization: secret === null ? null : `Bearer ${secret}` } });

const subRow = (otid: string): StoreSubscriptionRow =>
  rows<StoreSubscriptionRow>(s.db, 'SELECT * FROM store_subscriptions WHERE original_transaction_id = ?', otid)[0]!;

const planOf = async (u: Session) => (await s.request('GET', '/v1/plan', { token: u.token })).body.plan;

let seq = 0;
const otid = (): string => `GPA.9000-0000-0000-${String(++seq).padStart(5, '0')}`;

describe('webhook auth', () => {
  it('missing or wrong Authorization → 401', async () => {
    const body = fixture('test', {});
    assert.equal((await send(body, null)).status, 401);
    const wrong = await send(body, 'nope');
    assert.equal(wrong.status, 401);
    assert.equal(wrong.body.error.code, 'unauthorized');
    assert.equal(count(s.db, 'SELECT count(*) AS n FROM webhook_events'), 0);
  });

  it('accepts the previous secret during rotation', async () => {
    const t = await startTestServer({ env: { REVENUECAT_WEBHOOK_SECRET: 'new-secret', REVENUECAT_WEBHOOK_SECRET_PREVIOUS: 'old-secret' } });
    try {
      for (const secret of ['new-secret', 'old-secret']) {
        const res = await t.request('POST', '/v1/webhooks/revenuecat', { body: fixture('test', {}), headers: { Authorization: `Bearer ${secret}` } });
        assert.equal(res.status, 200);
        assert.deepEqual(res.body, { ok: true, status: 'ignored' });
      }
      const res = await t.request('POST', '/v1/webhooks/revenuecat', { body: fixture('test', {}), headers: { Authorization: 'Bearer older' } });
      assert.equal(res.status, 401);
    } finally {
      await t.close();
    }
  });

  it('without a secret → 503 not_configured', async () => {
    const t = await startTestServer({ env: { REVENUECAT_WEBHOOK_SECRET: '' } });
    try {
      const res = await t.request('POST', '/v1/webhooks/revenuecat', { body: fixture('test', {}), headers: { Authorization: 'Bearer x' } });
      assert.equal(res.status, 503);
      assert.equal(res.body.error.code, 'not_configured');
    } finally {
      await t.close();
    }
  });

  it('malformed JSON and missing event fields → 400 bad_request', async () => {
    const bad = await s.request('POST', '/v1/webhooks/revenuecat', { rawBody: '{"event":', headers: { Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json' } });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.error.code, 'bad_request');
    assert.equal((await send({ api_version: '1.0' })).body.error.code, 'bad_request');
    assert.equal((await send({ event: { type: 'RENEWAL' } })).body.error.code, 'bad_request');
    assert.equal((await send({ event: { id: 'x'.repeat(101), type: 'RENEWAL' } })).body.error.code, 'bad_request');
    assert.equal((await send({ event: { id: 'evt-1' } })).body.error.code, 'bad_request');
  });
});

describe('event types (3.5)', () => {
  it('INITIAL_PURCHASE (trial) → RENEWAL → CANCELLATION → UNCANCELLATION → EXPIRATION', async () => {
    const u = await s.account('lifecycle@example.com');
    const id = otid();
    const vars = { __USER__: u.user.id };
    const initial = fixture('initial_purchase', vars, { original_transaction_id: id });
    const res = await send(initial);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true, status: 'processed' });
    let row = subRow(id);
    assert.equal(row.user_id, u.user.id);
    assert.equal(row.status, 'trialing');
    assert.equal(row.will_renew, 1);
    assert.equal(row.plan, 'yearly');
    assert.equal(row.period_type, 'trial');
    assert.equal(row.environment, 'production');
    assert.equal(row.store, 'play_store');
    assert.equal(row.expires_at, T0 + 7 * DAY);
    assert.equal(row.purchased_at, T0);
    let plan = await planOf(u);
    assert.deepEqual(
      { plan: plan.plan, source: plan.source, trial: plan.trial, willRenew: plan.willRenew, status: plan.status, store: plan.store, productId: plan.productId },
      { plan: 'yearly', source: 'store', trial: true, willRenew: true, status: 'trialing', store: 'play_store', productId: 'stopwake_pro:yearly' },
    );
    assert.equal(plan.expiresAt, new Date(T0 + 7 * DAY).toISOString());
    // The stored payload has no subscriber attributes (and so no email address).
    const stored = rows<{ payload: string; status: string; user_id: string }>(s.db, 'SELECT payload, status, user_id FROM webhook_events WHERE id = ?', initial.event.id as string)[0]!;
    assert.equal(stored.status, 'processed');
    assert.equal(stored.user_id, u.user.id);
    assert.ok(!stored.payload.includes('subscriber_attributes'));
    assert.ok(!stored.payload.includes('lena.weber@example.com'));

    // A duplicate delivery changes nothing.
    const dup = await send(initial);
    assert.deepEqual(dup.body, { ok: true, status: 'duplicate' });

    assert.equal((await send(fixture('renewal', vars, { original_transaction_id: id }))).body.status, 'processed');
    row = subRow(id);
    assert.equal(row.status, 'active');
    assert.equal(row.will_renew, 1);
    assert.equal(row.expires_at, 1823760000000);
    assert.equal(row.grace_until, null);
    assert.equal(row.price_usd, 11.59);
    assert.equal(row.price_local, 9.99);
    assert.equal(row.currency, 'EUR');
    assert.equal(row.country, 'DE');
    assert.equal(row.period_type, 'normal');
    plan = await planOf(u);
    assert.equal(plan.trial, false);
    assert.equal(plan.status, 'active');

    assert.equal((await send(fixture('cancellation', vars, { original_transaction_id: id }))).body.status, 'processed');
    row = subRow(id);
    assert.equal(row.status, 'active');
    assert.equal(row.will_renew, 0);
    assert.equal(row.cancel_reason, 'UNSUBSCRIBE');
    plan = await planOf(u);
    assert.equal(plan.isPro, true);
    assert.equal(plan.willRenew, false);

    const uncancel = fixture('cancellation', vars, { original_transaction_id: id, type: 'UNCANCELLATION', event_timestamp_ms: 1792396800000 });
    delete uncancel.event.cancel_reason;
    assert.equal((await send(uncancel)).body.status, 'processed');
    assert.equal(subRow(id).will_renew, 1);

    assert.equal((await send(fixture('expiration', vars, { original_transaction_id: id }))).body.status, 'processed');
    row = subRow(id);
    assert.equal(row.status, 'expired');
    assert.equal(row.will_renew, 0);
    assert.equal(row.cancel_reason, 'UNSUBSCRIBE');
    assert.equal(row.expires_at, 1823760000000);
    plan = await planOf(u);
    assert.equal(plan.plan, 'free');
    assert.equal(plan.isPro, false);
  });

  it('CANCELLATION with CUSTOMER_SUPPORT is a refund: access ends at the event time', async () => {
    const u = await s.account('refund@example.com');
    const id = otid();
    const vars = { __USER__: u.user.id };
    await send(fixture('renewal', vars, { original_transaction_id: id, event_timestamp_ms: T0 - DAY }));
    assert.equal((await planOf(u)).plan, 'yearly');
    const refund = await send(fixture('cancellation', vars, { original_transaction_id: id, cancel_reason: 'CUSTOMER_SUPPORT', event_timestamp_ms: T0 - 1000, price: -11.59 }));
    assert.equal(refund.body.status, 'processed');
    const row = subRow(id);
    assert.equal(row.status, 'refunded');
    assert.equal(row.expires_at, T0 - 1000);
    assert.equal(row.price_usd, 11.59, 'a negative refund price keeps the purchase price');
    assert.equal((await planOf(u)).plan, 'free');

    const reversed = await send(fixture('renewal', vars, { original_transaction_id: id, type: 'REFUND_REVERSED', event_timestamp_ms: T0 }));
    assert.equal(reversed.body.status, 'processed');
    assert.equal(subRow(id).status, 'active');
    assert.equal(subRow(id).expires_at, 1823760000000);
    assert.equal((await planOf(u)).plan, 'yearly');
  });

  it('NON_RENEWING_PURCHASE of the lifetime product', async () => {
    const u = await s.account('lifetime@example.com');
    const id = otid();
    assert.equal((await send(fixture('non_renewing_purchase', { __USER__: u.user.id }, { original_transaction_id: id }))).body.status, 'processed');
    const row = subRow(id);
    assert.equal(row.plan, 'lifetime');
    assert.equal(row.status, 'active');
    assert.equal(row.will_renew, 0);
    assert.equal(row.expires_at, null);
    const plan = await planOf(u);
    assert.equal(plan.plan, 'lifetime');
    assert.equal(plan.expiresAt, null);
    assert.equal(plan.cacheUntil, new Date(T0 + 30 * DAY).toISOString());
  });

  it('BILLING_ISSUE: grace period while the grace end is ahead, billing_issue otherwise', async () => {
    const u = await s.account('billing@example.com');
    const id = otid();
    await send(fixture('billing_issue', { __USER__: u.user.id }, { original_transaction_id: id }));
    let row = subRow(id);
    assert.equal(row.status, 'grace_period');
    assert.equal(row.grace_until, 1791878400000);
    assert.equal(row.will_renew, 1);
    const plan = await planOf(u);
    assert.equal(plan.plan, 'monthly');
    assert.equal(plan.status, 'grace_period');
    assert.equal(plan.expiresAt, new Date(1791878400000).toISOString());

    const id2 = otid();
    await send(fixture('billing_issue', { __USER__: u.user.id }, { original_transaction_id: id2, grace_period_expiration_at_ms: T0 - DAY }));
    row = subRow(id2);
    assert.equal(row.status, 'billing_issue');
  });

  it('SUBSCRIPTION_PAUSED, SUBSCRIPTION_EXTENDED, TEMPORARY_ENTITLEMENT_GRANT, PRODUCT_CHANGE', async () => {
    const u = await s.account('misc@example.com');
    const id = otid();
    const vars = { __USER__: u.user.id };
    await send(fixture('renewal', vars, { original_transaction_id: id, event_timestamp_ms: T0 - 5 * DAY }));
    await send(fixture('renewal', vars, { original_transaction_id: id, type: 'SUBSCRIPTION_PAUSED', event_timestamp_ms: T0 - 4 * DAY }));
    let row = subRow(id);
    assert.equal(row.status, 'paused');
    assert.equal(row.will_renew, 0);
    await send(fixture('renewal', vars, { original_transaction_id: id, type: 'SUBSCRIPTION_EXTENDED', event_timestamp_ms: T0 - 3 * DAY, expiration_at_ms: T0 + 400 * DAY }));
    row = subRow(id);
    assert.equal(row.status, 'paused');
    assert.equal(row.expires_at, T0 + 400 * DAY);
    await send(fixture('renewal', vars, { original_transaction_id: id, type: 'TEMPORARY_ENTITLEMENT_GRANT', event_timestamp_ms: T0 - 2 * DAY, expiration_at_ms: T0 + DAY }));
    row = subRow(id);
    assert.equal(row.status, 'active');
    assert.equal(row.will_renew, 0);
    assert.equal(row.expires_at, T0 + DAY);
    await send(fixture('renewal', vars, {
      original_transaction_id: id, type: 'PRODUCT_CHANGE', event_timestamp_ms: T0 - DAY, product_id: 'stopwake_pro:monthly', new_product_id: 'stopwake_pro:yearly',
    }));
    row = subRow(id);
    assert.equal(row.last_event_type, 'PRODUCT_CHANGE');
    assert.equal(row.product_id, 'stopwake_pro:yearly', 'PRODUCT_CHANGE is recorded only');
    assert.equal(row.expires_at, T0 + DAY);
    // The next RENEWAL carries the new product and plan.
    await send(fixture('renewal', vars, { original_transaction_id: id, event_timestamp_ms: T0, product_id: 'stopwake_pro:monthly', expiration_at_ms: T0 + 30 * DAY }));
    row = subRow(id);
    assert.equal(row.product_id, 'stopwake_pro:monthly');
    assert.equal(row.plan, 'monthly');
  });

  it('TEST, unknown types and foreign entitlements are ignored', async () => {
    const u = await s.account('ignored@example.com');
    assert.equal((await send(fixture('test', {}))).body.status, 'ignored');
    assert.equal((await send(fixture('renewal', { __USER__: u.user.id }, { type: 'SUBSCRIBER_ALIAS', original_transaction_id: otid() }))).body.status, 'ignored');
    const id = otid();
    assert.equal((await send(fixture('renewal', { __USER__: u.user.id }, { original_transaction_id: id, entitlement_ids: ['other'] }))).body.status, 'ignored');
    assert.equal(count(s.db, 'SELECT count(*) AS n FROM store_subscriptions WHERE original_transaction_id = ?', id), 0);
    assert.equal((await planOf(u)).plan, 'free');
  });
});

describe('ordering, idempotency and errors', () => {
  it('an older event than the row’s last event is stale: stored, not applied', async () => {
    const u = await s.account('stale@example.com');
    const id = otid();
    const vars = { __USER__: u.user.id };
    await send(fixture('renewal', vars, { original_transaction_id: id }));
    const late = await send(fixture('cancellation', vars, { original_transaction_id: id, event_timestamp_ms: T0 }));
    assert.equal(late.body.status, 'stale');
    assert.equal(subRow(id).will_renew, 1);
    assert.equal(count(s.db, "SELECT count(*) AS n FROM webhook_events WHERE status = 'stale' AND user_id = ?", u.user.id), 1);
  });

  it('a failure stores the event as error and answers 500; the redelivery is processed again', async () => {
    const u = await s.account('error@example.com');
    const id = otid();
    s.db.exec(`CREATE TRIGGER fail_once BEFORE INSERT ON store_subscriptions WHEN NEW.original_transaction_id = '${id}'
      BEGIN SELECT RAISE(ABORT, 'injected failure'); END`);
    const body = fixture('renewal', { __USER__: u.user.id }, { original_transaction_id: id });
    const failed = await send(body);
    assert.equal(failed.status, 500);
    assert.equal(failed.body.error.code, 'internal');
    const stored = rows<{ status: string; error: string; processed_at: number | null }>(s.db, 'SELECT status, error, processed_at FROM webhook_events WHERE id = ?', body.event.id as string)[0]!;
    assert.equal(stored.status, 'error');
    assert.match(stored.error, /injected failure/);
    assert.equal(stored.processed_at, null);
    s.db.exec('DROP TRIGGER fail_once');
    const again = await send(body);
    assert.deepEqual(again.body, { ok: true, status: 'processed' });
    assert.equal(subRow(id).user_id, u.user.id);
    assert.equal(rows<{ status: string }>(s.db, 'SELECT status FROM webhook_events WHERE id = ?', body.event.id as string)[0]!.status, 'processed');
  });

  it('unmatched → 200, then an admin retry once the user exists', async () => {
    const admin = await s.adminToken();
    const futureId = randomUUID();
    const id = otid();
    const body = fixture('renewal', { __USER__: futureId }, { original_transaction_id: id });
    const res = await send(body);
    assert.deepEqual(res.body, { ok: true, status: 'unmatched' });
    assert.equal(count(s.db, 'SELECT count(*) AS n FROM store_subscriptions WHERE original_transaction_id = ?', id), 0);
    // The retry before the user exists keeps it unmatched.
    const early = await s.request('POST', `/v1/admin/store-events/${body.event.id}/retry`, { token: admin });
    assert.equal(early.status, 200);
    assert.equal(early.body.event.status, 'unmatched');
    s.db.prepare(
      `INSERT INTO users (id, public_id, created_at, updated_at, last_seen_at) VALUES (?, 'SW-RETR-Y000', ?, ?, ?)`,
    ).run(futureId, s.clock.now(), s.clock.now(), s.clock.now());
    const retry = await s.request('POST', `/v1/admin/store-events/${body.event.id}/retry`, { token: admin });
    assert.equal(retry.status, 200);
    assert.equal(retry.body.event.status, 'processed');
    assert.equal(retry.body.event.user.publicId, 'SW-RETR-Y000');
    assert.equal(subRow(id).user_id, futureId);
    const audit = rows<{ details: string; target_type: string; target_id: string }>(
      s.db, "SELECT details, target_type, target_id FROM audit_log WHERE action = 'store_event.retry' ORDER BY id DESC LIMIT 1",
    )[0]!;
    assert.deepEqual(JSON.parse(audit.details), { eventId: body.event.id, before: 'unmatched', after: 'processed' });
    assert.equal(audit.target_type, 'store_event');
    // Processed events cannot be retried.
    assert.equal((await s.request('POST', `/v1/admin/store-events/${body.event.id}/retry`, { token: admin })).status, 400);
  });
});

describe('user resolution (3.6)', () => {
  it('via aliases, original_app_user_id and merged_into; anonymous ids never match', async () => {
    const viaAlias = await s.account('alias@example.com');
    const id1 = otid();
    await send(fixture('renewal', { __USER__: viaAlias.user.id }, {
      original_transaction_id: id1, app_user_id: '$RCAnonymousID:aaaa', original_app_user_id: '$RCAnonymousID:bbbb', aliases: ['$RCAnonymousID:cccc', viaAlias.user.id],
    }));
    assert.equal(subRow(id1).user_id, viaAlias.user.id);

    const viaOriginal = await s.account('original@example.com');
    const id2 = otid();
    await send(fixture('renewal', { __USER__: viaOriginal.user.id }, { original_transaction_id: id2, app_user_id: randomUUID(), aliases: [] }));
    assert.equal(subRow(id2).user_id, viaOriginal.user.id);

    const account = await s.account('merged-into@example.com');
    const guest = await s.guest();
    await s.signIn('merged-into@example.com', 'correct horse battery', { token: guest.token });
    const id3 = otid();
    await send(fixture('renewal', { __USER__: guest.user.id }, { original_transaction_id: id3 }));
    assert.equal(subRow(id3).user_id, account.user.id);
    assert.equal((await planOf(account)).plan, 'yearly');

    const id4 = otid();
    const anon = await send(fixture('renewal', { __USER__: '$RCAnonymousID:dddd' }, { original_transaction_id: id4 }));
    assert.equal(anon.body.status, 'unmatched');
  });

  it('an existing transaction row determines the user', async () => {
    const owner = await s.account('owner@example.com');
    const other = await s.account('other-owner@example.com');
    const id = otid();
    await send(fixture('renewal', { __USER__: owner.user.id }, { original_transaction_id: id, event_timestamp_ms: T0 - DAY }));
    await send(fixture('cancellation', { __USER__: other.user.id }, { original_transaction_id: id, event_timestamp_ms: T0 }));
    const row = subRow(id);
    assert.equal(row.user_id, owner.user.id);
    assert.equal(row.will_renew, 0);
    assert.equal(row.rc_app_user_id, other.user.id);
    assert.equal((await planOf(other)).plan, 'free');
  });

  it('TRANSFER moves the rows and recomputes both sides', async () => {
    const from = await s.account('transfer-from@example.com');
    const to = await s.account('transfer-to@example.com');
    const id = otid();
    await send(fixture('renewal', { __USER__: from.user.id }, { original_transaction_id: id }));
    assert.equal((await planOf(from)).plan, 'yearly');
    const res = await send(fixture('transfer', { __FROM__: from.user.id, __TO__: to.user.id }));
    assert.equal(res.body.status, 'processed');
    assert.equal(subRow(id).user_id, to.user.id);
    assert.equal((await planOf(from)).plan, 'free');
    assert.equal((await planOf(to)).plan, 'yearly');
    const unmatched = await send(fixture('transfer', { __FROM__: to.user.id, __TO__: randomUUID() }));
    assert.equal(unmatched.body.status, 'unmatched');
  });
});

describe('product mapping and sandbox', () => {
  it('setting, then names, then the expiry heuristic', async () => {
    const admin = await s.adminToken();
    await s.request('PATCH', '/v1/admin/settings', { token: admin, body: { values: { 'store.productPlans': { odd_sku_42: 'lifetime' } } } });
    const u = await s.account('mapping@example.com');
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ product_id: 'odd_sku_42', expiration_at_ms: T0 + 30 * DAY }, 'lifetime'],
      [{ product_id: 'pro_annual' }, 'yearly'],
      [{ product_id: 'pro_month_v2' }, 'monthly'],
      [{ product_id: 'pro_forever_lifetime', expiration_at_ms: T0 + DAY }, 'lifetime'],
      [{ product_id: 'sku_a', purchased_at_ms: T0, expiration_at_ms: T0 + 365 * DAY }, 'yearly'],
      [{ product_id: 'sku_b', purchased_at_ms: T0, expiration_at_ms: T0 + 31 * DAY }, 'monthly'],
      [{ product_id: 'sku_c', type: 'NON_RENEWING_PURCHASE', expiration_at_ms: null }, 'lifetime'],
    ];
    for (const [patch, plan] of cases) {
      const id = otid();
      await send(fixture('renewal', { __USER__: u.user.id }, { original_transaction_id: id, ...patch }));
      assert.equal(subRow(id).plan, plan, JSON.stringify(patch));
    }
  });

  it('sandbox purchases give Pro but are excluded from revenue', async () => {
    const admin = await s.adminToken();
    const before = (await s.request('GET', '/v1/admin/dashboard', { token: admin })).body.store;
    const u = await s.account('sandbox@example.com');
    const id = otid();
    await send(fixture('renewal', { __USER__: u.user.id }, { original_transaction_id: id, environment: 'SANDBOX', expiration_at_ms: T0 + 30 * DAY }));
    assert.equal(subRow(id).environment, 'sandbox');
    assert.equal((await planOf(u)).isPro, true);
    const after = (await s.request('GET', '/v1/admin/dashboard', { token: admin })).body.store;
    assert.equal(after.sandboxActive, before.sandboxActive + 1);
    assert.equal(after.mrrUsd, before.mrrUsd);
    assert.equal(after.active, before.active);
  });

  it('STORE_SANDBOX_GRANTS_PRO=false keeps sandbox purchases free', async () => {
    const t = await startTestServer({ env: { STORE_SANDBOX_GRANTS_PRO: 'false' } });
    try {
      const u = await t.account('nosandbox@example.com');
      await t.request('POST', '/v1/webhooks/revenuecat', {
        body: fixture('renewal', { __USER__: u.user.id }, { environment: 'SANDBOX' }), headers: { Authorization: `Bearer ${SECRET}` },
      });
      assert.equal((await t.request('GET', '/v1/plan', { token: u.token })).body.plan.isPro, false);
    } finally {
      await t.close();
    }
  });
});

describe('RevenueCat reconciliation (/v1/plan/sync)', () => {
  it('without REVENUECAT_API_KEY: synced false', async () => {
    const u = await s.guest();
    const res = await s.request('POST', '/v1/plan/sync', { token: u.token });
    assert.equal(res.status, 200);
    assert.equal(res.body.synced, false);
    assert.equal(res.body.plan.plan, 'free');
  });

  it('applies the subscriber, then a webhook with the real transaction id adopts the rcsync row', async () => {
    let calls = 0;
    const fake: RevenueCatApi = {
      getSubscriber: async (id) => {
        calls++;
        return {
          subscriber: {
            original_app_user_id: id,
            entitlements: { pro: { product_identifier: 'stopwake_pro', expires_date: '2027-10-10T08:00:00Z' } },
            subscriptions: {
              stopwake_pro: {
                product_plan_identifier: 'yearly', store: 'play_store', is_sandbox: false, period_type: 'normal',
                purchase_date: '2026-10-09T08:00:00Z', original_purchase_date: '2026-10-09T08:00:00Z', expires_date: '2027-10-09T08:00:00Z',
                unsubscribe_detected_at: null, billing_issues_detected_at: null, refunded_at: null, grace_period_expires_date: null,
              },
            },
            non_subscriptions: {},
          },
        };
      },
      deleteSubscriber: async () => {},
    };
    const t = await startTestServer({ revenuecat: fake, env: { REVENUECAT_API_KEY: 'sk_test' } });
    try {
      const u = await t.account('sync@example.com');
      const res = await t.request('POST', '/v1/plan/sync', { token: u.token });
      assert.equal(res.status, 200);
      assert.equal(res.body.synced, true);
      assert.equal(res.body.plan.plan, 'yearly');
      assert.equal(res.body.plan.willRenew, true);
      assert.equal(calls, 1);
      const synced = rows<StoreSubscriptionRow>(t.db, 'SELECT * FROM store_subscriptions WHERE user_id = ?', u.user.id);
      assert.equal(synced.length, 1);
      assert.equal(synced[0]!.original_transaction_id, `rcsync:${u.user.id}:stopwake_pro:yearly`);
      assert.equal(synced[0]!.product_id, 'stopwake_pro:yearly');
      // A later webhook with the real transaction id adopts the row instead of inserting a duplicate.
      t.clock.advance(DAY);
      const hook = await t.request('POST', '/v1/webhooks/revenuecat', {
        body: fixture('renewal', { __USER__: u.user.id }, { original_transaction_id: 'GPA.adopt-1', event_timestamp_ms: t.clock.now() }),
        headers: { Authorization: `Bearer ${SECRET}` },
      });
      assert.equal(hook.body.status, 'processed');
      const after = rows<StoreSubscriptionRow>(t.db, 'SELECT * FROM store_subscriptions WHERE user_id = ?', u.user.id);
      assert.equal(after.length, 1);
      assert.equal(after[0]!.original_transaction_id, 'GPA.adopt-1');
      // The admin sync runs the same reconciliation and is audited.
      const admin = await t.adminToken();
      const adminSync = await t.request('POST', `/v1/admin/users/${u.user.publicId}/sync`, { token: admin });
      assert.equal(adminSync.status, 200);
      assert.equal(adminSync.body.synced, true);
      assert.equal(count(t.db, "SELECT count(*) AS n FROM audit_log WHERE action = 'user.sync'"), 1);
    } finally {
      await t.close();
    }
  });

  it('the admin sync without a key answers 503 not_configured', async () => {
    const admin = await s.adminToken();
    const u = await s.account('nosync@example.com');
    const res = await s.request('POST', `/v1/admin/users/${u.user.id}/sync`, { token: admin });
    assert.equal(res.status, 503);
    assert.equal(res.body.error.code, 'not_configured');
  });
});
