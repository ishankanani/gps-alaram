import { describe, expect, it, vi } from 'vitest';

import { createAdminEndpoints } from '../../adminEndpoints';
import { createEndpoints } from '../../endpoints';
import { ApiError } from '../../errors';
import { createSupabaseRouter, type BackendSession, type SupabaseBackend } from '../router';

const session: BackendSession = { accessToken: 'jwt', userId: 'u1', email: 'a@example.com', expiresAt: Date.parse('2030-01-01') };

function fake(overrides: Partial<SupabaseBackend> = {}) {
  const calls: { fn: string; args?: Record<string, unknown> }[] = [];
  const b: SupabaseBackend = {
    url: 'https://x.supabase.co',
    rpc: vi.fn(async (fn: string, args?: Record<string, unknown>) => {
      calls.push({ fn, args });
      if (fn === 'me') return { user: { id: 'u1' }, plan: { plan: 'free' }, entitlements: [] };
      if (fn === 'my_plan') return { plan: { plan: 'free' }, entitlements: [] };
      if (fn === 'admin_reset_email') return { email: 'b@example.com' };
      if (fn === 'admin_put_price') return { item: { ...(args?.p_body as object), country: args?.p_country }, warnings: [] };
      if (fn === 'admin_settings' || fn === 'admin_patch_settings') return { items: [] };
      if (fn === 'admin_prices') return { items: [], defaultTrialDays: 7 };
      return {};
    }) as SupabaseBackend['rpc'],
    session: vi.fn(async () => session),
    signUp: vi.fn(async () => session),
    signIn: vi.fn(async () => session),
    signOut: vi.fn(async () => {}),
    resetPasswordForEmail: vi.fn(async () => {}),
    verifyRecovery: vi.fn(async () => session),
    updateUser: vi.fn(async () => {}),
    device: () => null,
    language: () => 'de',
    region: () => 'DE',
    ...overrides,
  };
  const router = createSupabaseRouter(b);
  return { b, calls, router, endpoints: createEndpoints(router), admin: createAdminEndpoints(router) };
}

describe('account routes', () => {
  it('signs up with the profile metadata and answers an AuthResponse', async () => {
    const { b, endpoints } = fake();
    const res = await endpoints.auth.signUp({ email: ' A@Example.com ', password: 'secret123', displayName: 'Ann' });
    expect(b.signUp).toHaveBeenCalledWith({ email: 'a@example.com', password: 'secret123', data: { display_name: 'Ann', language: 'de', country: 'DE' } });
    expect(res.token).toBe('jwt');
    expect(res.user.id).toBe('u1');
  });

  it('says confirmation_sent when the project confirms emails first', async () => {
    const { endpoints } = fake({ signUp: vi.fn(async () => null) });
    await expect(endpoints.auth.signUp({ email: 'a@example.com', password: 'secret123' })).rejects.toMatchObject({ code: 'confirmation_sent' });
  });

  it('resets the password with the emailed code', async () => {
    const { b, endpoints } = fake();
    await endpoints.auth.resetPassword({ email: 'a@example.com', code: '1234-5678', newPassword: 'newsecret', installId: '' });
    expect(b.verifyRecovery).toHaveBeenCalledWith('a@example.com', '12345678');
    expect(b.updateUser).toHaveBeenCalledWith({ password: 'newsecret' });
  });

  it('checks the current password before changing it or deleting the account', async () => {
    const { b, calls, endpoints } = fake();
    await endpoints.me.changePassword({ currentPassword: 'old', newPassword: 'newer123' });
    expect(b.signIn).toHaveBeenCalledWith('a@example.com', 'old');
    await endpoints.me.delete({ password: 'old', acknowledgeSubscription: true });
    expect(calls.at(-1)).toEqual({ fn: 'delete_my_account', args: { p_acknowledge_subscription: true } });
    expect(b.signOut).toHaveBeenCalled();
  });

  it('refuses a wrong password without deleting', async () => {
    const { calls, endpoints } = fake({ signIn: vi.fn(async () => { throw new ApiError({ status: 400, code: 'invalid_credentials', message: 'no' }); }) });
    await expect(endpoints.me.delete({ password: 'bad' })).rejects.toMatchObject({ code: 'invalid_credentials' });
    expect(calls.some((c) => c.fn === 'delete_my_account')).toBe(false);
  });

  it('answers /me with the session and the plan sync as not synced', async () => {
    const { endpoints } = fake();
    expect((await endpoints.me.get()).session.expiresAt).toBe('2030-01-01T00:00:00.000Z');
    expect((await endpoints.plan.sync()).synced).toBe(false);
  });

  it('builds the remote config from public_config', async () => {
    const { endpoints } = fake({ rpc: (async () => ({ settings: { 'limits.freeFavourites': 9 }, prices: [], version: 'x' })) as SupabaseBackend['rpc'] });
    const c = await endpoints.config({ country: 'AT', lang: 'de', version: '1.0.0' });
    expect(c?.limits.freeFavourites).toBe(9);
    expect(c?.country).toBe('AT');
  });

  it('has no server guests', async () => {
    const { endpoints } = fake();
    await expect(endpoints.auth.guest({ installId: 'x' })).rejects.toMatchObject({ code: 'not_configured' });
  });
});

describe('admin routes', () => {
  it('maps every admin call to its RPC and arguments', async () => {
    const { calls, admin } = fake();
    await admin.dashboard(7);
    await admin.users({ q: 'bob', limit: 20, offset: 40, sort: 'email' });
    await admin.user('SW-AAAA-BBBB');
    await admin.grant('SW-AAAA-BBBB', { plan: 'monthly', reason: 'x' });
    await admin.revokeGrant('SW-AAAA-BBBB', 12, { reason: 'y' });
    await admin.setRole('SW-AAAA-BBBB', 'admin');
    await admin.deleteUser('SW-AAAA-BBBB', { confirm: 'SW-AAAA-BBBB', reason: 'z' });
    await admin.updateNote(5, { body: 'b' });
    await admin.promoCodes({ status: 'active', limit: 10 });
    await admin.audit({ user: 'SW-AAAA-BBBB', before: 99 });
    expect(calls.map((c) => c.fn)).toEqual([
      'admin_dashboard', 'admin_users', 'admin_user', 'admin_grant', 'admin_revoke_grant', 'admin_set_role',
      'admin_delete_user', 'admin_update_note', 'admin_promo_codes', 'admin_audit',
    ]);
    expect(calls[1].args).toEqual({ p_query: { q: 'bob', limit: 20, offset: 40, sort: 'email' } });
    expect(calls[4].args).toEqual({ p_ref: 'SW-AAAA-BBBB', p_grant_id: 12, p_reason: 'y' });
    expect(calls[6].args).toEqual({ p_ref: 'SW-AAAA-BBBB', p_confirm: 'SW-AAAA-BBBB', p_reason: 'z' });
    expect(calls[9].args).toMatchObject({ p_user: 'SW-AAAA-BBBB', p_before: 99, p_limit: 50 });
  });

  it('fills the default price format and stores it only when given', async () => {
    const { calls, admin } = fake();
    const res = await admin.putPrice('DE', { currency: 'EUR', monthly: 199, yearly: 999, lifetime: 1499 });
    const args = calls[0].args!;
    expect(args.p_explicit_format).toBe(false);
    expect((args.p_body as { format: unknown }).format).not.toBeNull();
    expect(res.item.overridden).toBe(true);
  });

  it('emails the reset code instead of showing one', async () => {
    const { b, admin } = fake();
    const res = await admin.resetCode('SW-AAAA-BBBB');
    expect(b.resetPasswordForEmail).toHaveBeenCalledWith('b@example.com');
    expect(res.code).toBe('b@example.com');
  });

  it('keeps settings, prices and store events working', async () => {
    const { admin } = fake();
    expect((await admin.settings()).items).toHaveLength(13);
    expect((await admin.prices()).items.length).toBeGreaterThan(2);
    await expect(admin.retryStoreEvent('evt')).rejects.toMatchObject({ code: 'unavailable' });
    expect((await admin.health()).version).toBe('supabase');
  });

  it('answers unknown routes with not_found', async () => {
    const { router } = fake();
    await expect(router.request('GET', '/v1/nope')).rejects.toMatchObject({ code: 'not_found' });
  });
});
