import { describe, expect, it } from 'vitest';

import { createAdminEndpoints } from '../../../api/adminEndpoints';
import type { ApiRequester, HttpMethod, RequestOptions } from '../../../api/contract';

function recorder() {
  const calls: { method: HttpMethod; path: string; options?: RequestOptions }[] = [];
  const r: ApiRequester = {
    request: async (method, path, options) => {
      calls.push({ method, path, options });
      return null as never;
    },
  };
  return { api: createAdminEndpoints(r), calls };
}

describe('admin endpoints (backend-spec 2.4)', () => {
  it('reads with the right paths and queries', async () => {
    const { api, calls } = recorder();
    await api.dashboard(90);
    await api.users({ plan: 'pro', limit: 50, offset: 50 });
    await api.user('SW-7K3P-92QX');
    await api.audit({ action: 'grant.', before: 12, limit: 50 });
    await api.storeEvents({ status: 'error', before: 'CD3A-1' });
    await api.storeEvent('ID WITH/SLASH');
    await api.promoCodes({ status: 'all', q: 'BETA' });
    await api.promoCode(3);
    await api.prices();
    await api.settings();
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'GET /v1/admin/dashboard',
      'GET /v1/admin/users',
      'GET /v1/admin/users/SW-7K3P-92QX',
      'GET /v1/admin/audit',
      'GET /v1/admin/store-events',
      'GET /v1/admin/store-events/ID%20WITH%2FSLASH',
      'GET /v1/admin/promo-codes',
      'GET /v1/admin/promo-codes/3',
      'GET /v1/admin/prices',
      'GET /v1/admin/settings',
    ]);
    expect(calls[0].options?.query).toEqual({ days: 90 });
    expect(calls[1].options?.query).toEqual({ plan: 'pro', limit: 50, offset: 50 });
    expect(calls[3].options?.query).toEqual({ action: 'grant.', before: 12, limit: 50 });
  });

  it('sends every user mutation to its route with its body', async () => {
    const { api, calls } = recorder();
    const id = 'e7128d10-9d8a-4240-b625-1c3bfd583eae';
    await api.updateUser(id, { displayName: null });
    await api.deleteUser(id, { confirm: 'SW-7K3P-92QX', reason: 'GDPR request' });
    await api.grant(id, { plan: 'monthly', durationDays: 31, reason: 'Beta tester' });
    await api.revokeGrant(id, 7, { reason: 'Mistake' });
    await api.extend(id, { days: 30, grantId: 7, reason: 'Support' });
    await api.changePlan(id, { plan: 'free', reason: 'Refund' });
    await api.setRole(id, 'admin');
    await api.disable(id, { reason: 'Abuse' });
    await api.enable(id);
    await api.signOutAll(id);
    await api.resetCode(id);
    await api.sync(id);
    await api.addNote(id, { body: 'Hi' });
    await api.updateNote(5, { body: 'Hey' });
    await api.deleteNote(5);
    const base = `/v1/admin/users/${id}`;
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      `PATCH ${base}`,
      `DELETE ${base}`,
      `POST ${base}/grants`,
      `POST ${base}/grants/7/revoke`,
      `POST ${base}/extend`,
      `POST ${base}/plan`,
      `POST ${base}/role`,
      `POST ${base}/disable`,
      `POST ${base}/enable`,
      `POST ${base}/sign-out-all`,
      `POST ${base}/reset-code`,
      `POST ${base}/sync`,
      `POST ${base}/notes`,
      'PATCH /v1/admin/notes/5',
      'DELETE /v1/admin/notes/5',
    ]);
    expect(calls[1].options?.body).toEqual({ confirm: 'SW-7K3P-92QX', reason: 'GDPR request' });
    expect(calls[6].options?.body).toEqual({ role: 'admin' });
  });

  it('covers codes, prices, settings and store events', async () => {
    const { api, calls } = recorder();
    await api.createPromo({ plan: 'yearly', durationDays: 365 });
    await api.updatePromo(2, { active: false });
    await api.deletePromo(2);
    await api.putPrice('PL', { currency: 'PLN', monthly: 899, yearly: 4499, lifetime: 6499, trialDays: null, format: null });
    await api.deletePrice('PL');
    await api.resetPrices();
    await api.patchSettings({ 'limits.freeFavourites': 5, announcement: null });
    await api.retryStoreEvent('E1');
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'POST /v1/admin/promo-codes',
      'PATCH /v1/admin/promo-codes/2',
      'DELETE /v1/admin/promo-codes/2',
      'PUT /v1/admin/prices/PL',
      'DELETE /v1/admin/prices/PL',
      'POST /v1/admin/prices/reset',
      'PATCH /v1/admin/settings',
      'POST /v1/admin/store-events/E1/retry',
    ]);
    expect(calls[5].options?.body).toEqual({ confirm: true });
    expect(calls[6].options?.body).toEqual({ values: { 'limits.freeFavourites': 5, announcement: null } });
  });
});
