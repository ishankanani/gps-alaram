import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DAY, HOUR } from '../src/clock.ts';
import {
  computeCacheUntil, computePlan, LIFETIME_UNTIL, type ComputedPlan, type GrantRow, type StoreSubscriptionRow,
} from '../src/domain/plans.ts';

const NOW = Date.UTC(2026, 9, 10, 8);
let nextId = 1;

function grant(p: Partial<GrantRow> & Pick<GrantRow, 'plan'>): GrantRow {
  const id = p.id ?? nextId++;
  return {
    id, user_id: 'u', source: 'admin', promo_code_id: null, starts_at: NOW - DAY, ends_at: p.plan === 'lifetime' ? null : NOW + 30 * DAY,
    reason: 'test', created_by: null, created_at: NOW - DAY, updated_at: NOW - DAY, revoked_at: null, revoked_by: null, revoke_reason: null,
    ...p,
  };
}

function sub(p: Partial<StoreSubscriptionRow> & Pick<StoreSubscriptionRow, 'plan'>): StoreSubscriptionRow {
  const id = p.id ?? nextId++;
  return {
    id, user_id: 'u', store: 'play_store', environment: 'production', product_id: `stopwake_pro:${p.plan}`, original_transaction_id: `GPA.${id}`,
    rc_app_user_id: 'u', status: 'active', period_type: 'normal', will_renew: p.plan === 'lifetime' ? 0 : 1, purchased_at: NOW - 10 * DAY,
    expires_at: p.plan === 'lifetime' ? null : NOW + 20 * DAY, grace_until: null, cancel_reason: null, country: 'DE', currency: 'EUR',
    price_local: 1.99, price_usd: 2.31, last_event_id: null, last_event_type: null, last_event_at: NOW - 10 * DAY, created_at: NOW - 10 * DAY,
    updated_at: NOW - 10 * DAY,
    ...p,
  };
}

type Case = {
  name: string;
  status?: 'active' | 'disabled' | 'merged';
  grants?: GrantRow[];
  subs?: StoreSubscriptionRow[];
  sandbox?: boolean;
  want: Partial<ComputedPlan>;
};

const FREE = { plan: 'free', source: null, until: null, willRenew: false, trial: false, ref: null } as const;

const cases: Case[] = [
  { name: 'no entitlements → free', want: FREE },
  {
    name: 'a single admin grant',
    grants: [grant({ id: 101, plan: 'monthly', ends_at: NOW + 30 * DAY })],
    want: { plan: 'monthly', source: 'grant', until: NOW + 30 * DAY, willRenew: false, trial: false, ref: 'grant:101' },
  },
  {
    name: 'a promo grant counts as source promo',
    grants: [grant({ id: 102, plan: 'monthly', source: 'promo', promo_code_id: 1 })],
    want: { plan: 'monthly', source: 'promo', ref: 'grant:102' },
  },
  {
    name: 'lifetime beats a yearly that ends later than anything finite',
    grants: [grant({ id: 103, plan: 'yearly', ends_at: NOW + 3000 * DAY }), grant({ id: 104, plan: 'lifetime' })],
    want: { plan: 'lifetime', until: LIFETIME_UNTIL, ref: 'grant:104' },
  },
  {
    name: 'the latest end wins over a higher plan',
    grants: [grant({ id: 105, plan: 'yearly', ends_at: NOW + 10 * DAY }), grant({ id: 106, plan: 'monthly', ends_at: NOW + 40 * DAY })],
    want: { plan: 'monthly', until: NOW + 40 * DAY, ref: 'grant:106' },
  },
  {
    name: 'equal ends: plan rank decides',
    grants: [grant({ id: 107, plan: 'monthly', ends_at: NOW + 40 * DAY }), grant({ id: 108, plan: 'yearly', ends_at: NOW + 40 * DAY })],
    want: { plan: 'yearly', ref: 'grant:108' },
  },
  {
    name: 'equal ends and plans: source rank store > grant > promo',
    grants: [grant({ id: 109, plan: 'yearly', ends_at: NOW + 20 * DAY, source: 'promo' }), grant({ id: 110, plan: 'yearly', ends_at: NOW + 20 * DAY })],
    subs: [sub({ id: 111, plan: 'yearly', expires_at: NOW + 20 * DAY })],
    want: { plan: 'yearly', source: 'store', ref: 'store:111', willRenew: true },
  },
  {
    name: 'equal everything: grant before promo',
    grants: [grant({ id: 112, plan: 'yearly', ends_at: NOW + 20 * DAY, source: 'promo' }), grant({ id: 113, plan: 'yearly', ends_at: NOW + 20 * DAY })],
    want: { source: 'grant', ref: 'grant:113' },
  },
  {
    name: 'full tie: ref string order',
    grants: [grant({ id: 115, plan: 'yearly', ends_at: NOW + 20 * DAY }), grant({ id: 114, plan: 'yearly', ends_at: NOW + 20 * DAY })],
    want: { ref: 'grant:114' },
  },
  { name: 'a revoked grant does not count', grants: [grant({ plan: 'lifetime', revoked_at: NOW - HOUR, revoke_reason: 'x' })], want: FREE },
  { name: 'an expired grant does not count', grants: [grant({ plan: 'monthly', ends_at: NOW - 1 })], want: FREE },
  { name: 'a grant ending exactly now does not count', grants: [grant({ plan: 'monthly', ends_at: NOW })], want: FREE },
  { name: 'a future grant does not count yet', grants: [grant({ plan: 'monthly', starts_at: NOW + HOUR, ends_at: NOW + 30 * DAY })], want: FREE },
  { name: 'an expired store subscription', subs: [sub({ plan: 'yearly', status: 'expired' })], want: FREE },
  { name: 'a refunded store subscription', subs: [sub({ plan: 'lifetime', status: 'refunded', expires_at: NOW - DAY })], want: FREE },
  { name: 'a store subscription past its end without an event', subs: [sub({ plan: 'monthly', expires_at: NOW - HOUR })], want: FREE },
  {
    name: 'a grace period extends the end',
    subs: [sub({ id: 116, plan: 'monthly', status: 'grace_period', expires_at: NOW - DAY, grace_until: NOW + 3 * DAY })],
    want: { plan: 'monthly', source: 'store', until: NOW + 3 * DAY, willRenew: true, ref: 'store:116' },
  },
  {
    name: 'billing issue without grace still counts until the end',
    subs: [sub({ id: 117, plan: 'monthly', status: 'billing_issue', expires_at: NOW + DAY })],
    want: { plan: 'monthly', willRenew: false, ref: 'store:117' },
  },
  {
    name: 'a trial sets the trial flag',
    subs: [sub({ id: 118, plan: 'yearly', status: 'trialing', expires_at: NOW + 4 * DAY })],
    want: { plan: 'yearly', trial: true, willRenew: true, until: NOW + 4 * DAY },
  },
  {
    name: 'a cancelled subscription does not renew',
    subs: [sub({ id: 119, plan: 'yearly', will_renew: 0, expires_at: NOW + 40 * DAY })],
    want: { plan: 'yearly', willRenew: false },
  },
  {
    name: 'store lifetime',
    subs: [sub({ id: 120, plan: 'lifetime', expires_at: null })],
    want: { plan: 'lifetime', source: 'store', until: LIFETIME_UNTIL, willRenew: false },
  },
  { name: 'sandbox counts when STORE_SANDBOX_GRANTS_PRO', subs: [sub({ id: 121, plan: 'monthly', environment: 'sandbox' })], want: { plan: 'monthly', ref: 'store:121' } },
  { name: 'sandbox is ignored when off', sandbox: false, subs: [sub({ plan: 'monthly', environment: 'sandbox' })], want: FREE },
  { name: 'a disabled user is free', status: 'disabled', grants: [grant({ plan: 'lifetime' })], want: FREE },
  { name: 'a merged user is free', status: 'merged', subs: [sub({ plan: 'yearly' })], want: FREE },
  {
    name: 'a promo that ends after the store wins (3.9)',
    grants: [grant({ id: 122, plan: 'monthly', source: 'promo', ends_at: NOW + 30 * DAY })],
    subs: [sub({ id: 123, plan: 'monthly', expires_at: NOW + 20 * DAY })],
    want: { plan: 'monthly', source: 'promo', until: NOW + 30 * DAY, willRenew: false },
  },
  {
    name: 'admin lifetime + store monthly → lifetime grant (3.9)',
    grants: [grant({ id: 124, plan: 'lifetime' })],
    subs: [sub({ id: 125, plan: 'monthly' })],
    want: { plan: 'lifetime', source: 'grant', until: LIFETIME_UNTIL },
  },
];

describe('computePlan (3.2)', () => {
  for (const c of cases) {
    it(c.name, () => {
      const got = computePlan({ status: c.status ?? 'active' }, c.grants ?? [], c.subs ?? [], NOW, { sandboxGrantsPro: c.sandbox ?? true });
      for (const [k, v] of Object.entries(c.want)) assert.deepEqual(got[k as keyof ComputedPlan], v, `${k}`);
    });
  }
});

describe('cacheUntil (3.7)', () => {
  const base = { isPro: true, source: 'store' as const, status: 'active' as const, willRenew: true };
  it('free: nothing to trust', () => {
    assert.equal(computeCacheUntil({ ...base, isPro: false, end: NOW + DAY }, NOW, 30), NOW);
  });
  it('a renewing store subscription gets 72 h of slack', () => {
    assert.equal(computeCacheUntil({ ...base, end: NOW + 5 * DAY }, NOW, 30), NOW + 5 * DAY + 72 * HOUR);
  });
  it('a trialing store subscription gets the slack too', () => {
    assert.equal(computeCacheUntil({ ...base, status: 'trialing', end: NOW + 2 * DAY }, NOW, 30), NOW + 2 * DAY + 72 * HOUR);
  });
  it('no slack for grants, cancelled or billing-issue subscriptions', () => {
    assert.equal(computeCacheUntil({ ...base, source: 'grant', willRenew: false, end: NOW + 5 * DAY }, NOW, 30), NOW + 5 * DAY);
    assert.equal(computeCacheUntil({ ...base, willRenew: false, end: NOW + 5 * DAY }, NOW, 30), NOW + 5 * DAY);
    assert.equal(computeCacheUntil({ ...base, status: 'grace_period', end: NOW + 2 * DAY }, NOW, 30), NOW + 2 * DAY);
  });
  it('is capped at plan.cacheDays', () => {
    assert.equal(computeCacheUntil({ ...base, end: NOW + 300 * DAY }, NOW, 30), NOW + 30 * DAY);
    assert.equal(computeCacheUntil({ ...base, end: NOW + 300 * DAY }, NOW, 7), NOW + 7 * DAY);
  });
  it('lifetime counts as checkedAt + cacheDays', () => {
    assert.equal(computeCacheUntil({ ...base, source: 'grant', willRenew: false, end: Infinity }, NOW, 30), NOW + 30 * DAY);
    assert.equal(computeCacheUntil({ ...base, end: LIFETIME_UNTIL }, NOW, 30), NOW + 30 * DAY);
  });
});
