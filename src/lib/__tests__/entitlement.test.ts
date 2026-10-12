import { describe, expect, it } from 'vitest';

import type { EffectivePlan } from '../../api/types';
import {
  buildModeFor,
  CLOCK_SKEW_MS,
  hasBillingProblem,
  isProFrom,
  NO_STORE,
  planFromProductId,
  resolveProView,
  serverPlanValid,
  serverPlanValidUntil,
  storeCounts,
  type CachedPlan,
  type StoreEntitlement,
} from '../entitlement';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const USER = '2f6c1c0e-8a7b-4c1e-9d3f-2b5a7c9e1f04';
const OTHER = '9d3f1c0e-8a7b-4c1e-9d3f-2b5a7c9e1f04';
// The server's clock (checkedAt) and the phone's clock (receivedAt) need not agree.
const SERVER_NOW = Date.parse('2026-10-10T08:00:00.000Z');
const PHONE_NOW = Date.parse('2026-10-10T09:13:00.000Z');

function plan(over: Partial<EffectivePlan> = {}): EffectivePlan {
  return {
    plan: 'yearly',
    isPro: true,
    source: 'grant',
    status: 'active',
    expiresAt: new Date(SERVER_NOW + 60 * DAY).toISOString(),
    willRenew: false,
    trial: false,
    store: null,
    productId: null,
    promoCode: null,
    checkedAt: new Date(SERVER_NOW).toISOString(),
    cacheUntil: new Date(SERVER_NOW + 30 * DAY).toISOString(),
    ...over,
  };
}

const cached = (over: Partial<EffectivePlan> = {}, userId = USER): CachedPlan => ({ userId, receivedAt: PHONE_NOW, plan: plan(over) });
const store = (over: Partial<StoreEntitlement> = {}): StoreEntitlement => ({ ...NO_STORE, ...over });

describe('build modes', () => {
  it('unlocks test builds without a server or a store', () => {
    expect(buildModeFor(false, false)).toBe('unlocked');
    expect(buildModeFor(false, true)).toBe('store');
    expect(buildModeFor(true, false)).toBe('server');
    expect(buildModeFor(true, true)).toBe('server');
    expect(isProFrom(null, null, NO_STORE, 'unlocked', PHONE_NOW)).toBe(true);
    expect(resolveProView({ mode: 'unlocked', cached: null, sessionUserId: null, store: NO_STORE, deviceNow: PHONE_NOW })).toMatchObject({
      isPro: true,
      origin: 'build',
    });
  });

  it('never unlocks a server build by itself', () => {
    expect(isProFrom(null, USER, NO_STORE, 'server', PHONE_NOW)).toBe(false);
  });

  it('ignores the server in a store-only build', () => {
    expect(isProFrom(cached(), USER, NO_STORE, 'store', PHONE_NOW)).toBe(false);
    expect(isProFrom(cached(), USER, store({ active: true, appUserId: USER }), 'store', PHONE_NOW)).toBe(true);
  });
});

describe('cache validity (3.7)', () => {
  it('trusts the plan for cacheUntil − checkedAt after it arrived, on the phone clock', () => {
    const c = cached();
    expect(serverPlanValid(c, USER, PHONE_NOW)).toBe(true);
    expect(serverPlanValid(c, USER, PHONE_NOW + 30 * DAY - 1)).toBe(true);
    expect(serverPlanValid(c, USER, PHONE_NOW + 30 * DAY)).toBe(false);
    expect(serverPlanValidUntil(c)).toBe(PHONE_NOW + 30 * DAY);
  });

  it('uses a short window for a renewing store plan (+72 h after the end)', () => {
    const c = cached({ source: 'store', willRenew: true, cacheUntil: new Date(SERVER_NOW + 3 * DAY).toISOString() });
    expect(serverPlanValid(c, USER, PHONE_NOW + 2 * DAY)).toBe(true);
    expect(serverPlanValid(c, USER, PHONE_NOW + 3 * DAY + 1)).toBe(false);
  });

  it('never trusts a free answer', () => {
    expect(serverPlanValid(cached({ isPro: false, plan: 'free', cacheUntil: new Date(SERVER_NOW).toISOString() }), USER, PHONE_NOW)).toBe(false);
  });

  it('allows a clock that moved back a little, not a lot', () => {
    const c = cached();
    expect(serverPlanValid(c, USER, PHONE_NOW - 5 * 60_000)).toBe(true);
    expect(serverPlanValid(c, USER, PHONE_NOW - CLOCK_SKEW_MS)).toBe(true);
    expect(serverPlanValid(c, USER, PHONE_NOW - CLOCK_SKEW_MS - 1)).toBe(false);
    expect(serverPlanValid(c, USER, PHONE_NOW - 2 * DAY)).toBe(false);
  });

  it('ignores a snapshot of another user, or without a session', () => {
    expect(serverPlanValid(cached({}, OTHER), USER, PHONE_NOW)).toBe(false);
    expect(serverPlanValid(cached(), null, PHONE_NOW)).toBe(false);
    expect(serverPlanValid(null, USER, PHONE_NOW)).toBe(false);
  });

  it('treats broken dates as not trustworthy', () => {
    expect(serverPlanValid(cached({ cacheUntil: 'soon' }), USER, PHONE_NOW)).toBe(false);
    expect(serverPlanValid(cached({ cacheUntil: new Date(SERVER_NOW - DAY).toISOString() }), USER, PHONE_NOW)).toBe(false);
  });
});

describe('the union of server and store', () => {
  it('is Pro from either side', () => {
    const active = store({ active: true, appUserId: USER, plan: 'monthly' });
    expect(isProFrom(cached(), USER, NO_STORE, 'server', PHONE_NOW)).toBe(true);
    expect(isProFrom(null, USER, active, 'server', PHONE_NOW)).toBe(true);
    expect(isProFrom(cached({}, OTHER), USER, active, 'server', PHONE_NOW)).toBe(true);
    expect(isProFrom(cached(), USER, NO_STORE, 'server', PHONE_NOW + 31 * DAY)).toBe(false);
  });

  it('counts the store only while its user is ours or still anonymous', () => {
    expect(storeCounts(store({ active: true, appUserId: USER }), USER)).toBe(true);
    expect(storeCounts(store({ active: true, appUserId: '$RCAnonymousID:abc' }), USER)).toBe(true);
    expect(storeCounts(store({ active: true, appUserId: null }), USER)).toBe(true);
    expect(storeCounts(store({ active: true, appUserId: OTHER }), USER)).toBe(false);
    expect(storeCounts(store({ active: false, appUserId: USER }), USER)).toBe(false);
    // Signed out, the next guest not there yet: the old account's purchases stay with the old account.
    expect(storeCounts(store({ active: true, appUserId: OTHER }), null)).toBe(false);
    expect(storeCounts(store({ active: true, appUserId: '$RCAnonymousID:abc' }), null)).toBe(true);
  });

  it('makes a disabled account Free', () => {
    const active = store({ active: true, appUserId: USER });
    expect(isProFrom(cached(), USER, active, 'server', PHONE_NOW, true)).toBe(false);
    expect(resolveProView({ mode: 'server', cached: cached(), sessionUserId: USER, store: active, deviceNow: PHONE_NOW, disabled: true }).isPro).toBe(
      false,
    );
  });

  it('shows the server plan while it counts, the store plan otherwise', () => {
    const gift = cached({ plan: 'lifetime', source: 'grant', expiresAt: null });
    const active = store({
      active: true,
      appUserId: USER,
      productId: 'stopwake_pro:yearly',
      expiresAt: '2027-10-10T08:00:00.000Z',
      willRenew: true,
      trial: true,
    });
    expect(resolveProView({ mode: 'server', cached: gift, sessionUserId: USER, store: active, deviceNow: PHONE_NOW })).toMatchObject({
      plan: 'lifetime',
      source: 'grant',
      origin: 'server',
    });
    const view = resolveProView({ mode: 'server', cached: null, sessionUserId: USER, store: active, deviceNow: PHONE_NOW });
    expect(view).toMatchObject({ isPro: true, plan: 'yearly', source: 'store', status: 'trialing', trial: true, willRenew: true, origin: 'store' });
    expect(resolveProView({ mode: 'server', cached: null, sessionUserId: USER, store: NO_STORE, deviceNow: PHONE_NOW })).toMatchObject({
      isPro: false,
      plan: 'free',
      origin: 'none',
    });
  });

  it('flags billing problems of store plans only', () => {
    expect(hasBillingProblem({ source: 'store', status: 'grace_period' })).toBe(true);
    expect(hasBillingProblem({ source: 'store', status: 'billing_issue' })).toBe(true);
    expect(hasBillingProblem({ source: 'store', status: 'active' })).toBe(false);
    expect(hasBillingProblem({ source: 'grant', status: 'billing_issue' })).toBe(false);
  });
});

describe('store products', () => {
  it('maps product ids to plans like the server', () => {
    expect(planFromProductId('stopwake_pro:monthly')).toBe('monthly');
    expect(planFromProductId('stopwake_pro:yearly')).toBe('yearly');
    expect(planFromProductId('pro_annual')).toBe('yearly');
    expect(planFromProductId('stopwake_lifetime')).toBe('lifetime');
    expect(planFromProductId('mystery', null)).toBe('lifetime');
    expect(planFromProductId('mystery', '2027-01-01T00:00:00.000Z')).toBe('monthly');
  });
});
