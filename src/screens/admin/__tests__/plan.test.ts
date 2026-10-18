import { describe, expect, it } from 'vitest';

import type { AdminGrant, AdminStoreSubscription } from '../../../api/types';
import {
  best,
  candidatesOf,
  hasActiveStoreSubscription,
  latestExtendableGrant,
  previewChangePlan,
  previewExtend,
  previewGrant,
  previewRevoke,
} from '../lib/plan';
import { t } from './t';

const NOW = new Date(2026, 9, 11, 12).getTime();
const day = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();

function grant(id: number, patch: Partial<AdminGrant> = {}): AdminGrant {
  return {
    kind: 'grant', id, source: 'admin', plan: 'monthly', status: 'active', startsAt: iso(NOW - day), endsAt: iso(NOW + 30 * day),
    reason: 'Beta tester', promoCode: null, createdBy: null, createdAt: iso(NOW - day), updatedAt: iso(NOW - day),
    revokedAt: null, revokedBy: null, revokeReason: null, ...patch,
  };
}

function sub(patch: Partial<AdminStoreSubscription> = {}): AdminStoreSubscription {
  return {
    kind: 'store', id: 1, store: 'play_store', environment: 'production', productId: 'stopwake_pro:yearly', plan: 'yearly',
    status: 'active', periodType: 'normal', willRenew: true, purchasedAt: iso(NOW - 100 * day), expiresAt: iso(NOW + 200 * day),
    graceUntil: null, cancelReason: null, originalTransactionId: 'GPA.1', country: 'DE', currency: 'EUR', priceLocal: 9.99,
    priceUsd: 11.59, lastEventType: 'INITIAL_PURCHASE', lastEventAt: iso(NOW - 100 * day), ...patch,
  };
}

const user = { status: 'active' };

describe('plan previews', () => {
  it('collects what counts now', () => {
    const detail = {
      grants: [grant(1), grant(2, { status: 'revoked', revokedAt: iso(NOW) }), grant(3, { status: 'expired', endsAt: iso(NOW - day) })],
      storeSubscriptions: [sub(), sub({ id: 2, environment: 'sandbox' }), sub({ id: 3, status: 'expired' })],
    };
    const c = candidatesOf(detail, NOW);
    expect(c).toHaveLength(2);
    expect(best(c)?.source).toBe('store');
    expect(hasActiveStoreSubscription(detail, NOW)).toBe(true);
  });

  it('a gift shorter than the store plan changes nothing', () => {
    const p = previewGrant({ user, grants: [], storeSubscriptions: [sub()] }, { plan: 'monthly', end: NOW + 30 * day }, t, NOW);
    expect(p.unchanged).toBe(true);
    expect(p.after).toBe('Unchanged: their store plan runs longer');
    expect(p.before).toMatch(/^Pro · Yearly \(Google Play\) until /);
  });

  it('a gift to a Free user makes them Pro', () => {
    const p = previewGrant({ user, grants: [], storeSubscriptions: [] }, { plan: 'yearly', end: NOW + 365 * day }, t, NOW);
    expect(p.before).toBe('Free');
    expect(p.after).toMatch(/^Pro · Yearly \(gift\) until /);
    expect(p.unchanged).toBe(false);
    const life = previewGrant({ user, grants: [], storeSubscriptions: [] }, { plan: 'lifetime', end: Infinity }, t, NOW);
    expect(life.after).toBe('Pro · Lifetime (gift)');
  });

  it('a disabled user stays Free', () => {
    const p = previewGrant({ user: { status: 'disabled' }, grants: [], storeSubscriptions: [] }, { plan: 'monthly', end: NOW + 30 * day }, t, NOW);
    expect(p.after).toBe('Free while the account is disabled');
  });

  it('change plan keeps store subscriptions and drops gifts', () => {
    const detail = { user, grants: [grant(1, { plan: 'lifetime', endsAt: null })], storeSubscriptions: [] };
    expect(previewChangePlan(detail, null, t, NOW).after).toBe('Free');
    const withStore = { user, grants: [grant(1)], storeSubscriptions: [sub()] };
    expect(previewChangePlan(withStore, null, t, NOW).after).toBe('Unchanged: their store plan runs longer');
  });

  it('revoke shows what is left', () => {
    const detail = { user, grants: [grant(1), grant(2, { plan: 'yearly', endsAt: iso(NOW + 10 * day) })], storeSubscriptions: [] };
    expect(previewRevoke(detail, 1, t, NOW).after).toMatch(/^Pro · Yearly \(gift\) until /);
    expect(previewRevoke({ user, grants: [grant(1)], storeSubscriptions: [] }, 1, t, NOW).after).toBe('Free');
  });

  it('add time moves the target gift', () => {
    const g = grant(1);
    const detail = { user, grants: [g], storeSubscriptions: [] };
    const p = previewExtend(detail, g, NOW + 60 * day, 'monthly', t, NOW);
    expect(p.unchanged).toBe(false);
    expect(latestExtendableGrant([g, grant(2, { endsAt: iso(NOW + 90 * day) }), grant(3, { endsAt: null })], NOW)?.id).toBe(2);
    expect(latestExtendableGrant([grant(3, { endsAt: null })], NOW)).toBeNull();
  });
});
