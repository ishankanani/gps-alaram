import { describe, expect, it } from 'vitest';

import { buildLinking } from '../linking';
import { createRequest, resolveRequest } from '../results';
import { ADMIN_ROUTES, isAdminRoute } from '../types';

describe('navigation', () => {
  it('links stopwake:// paths, admin ones only for admins', () => {
    const user = buildLinking({ enabled: true, admin: false });
    const admin = buildLinking({ enabled: true, admin: true });
    expect(user.prefixes).toEqual(['stopwake://']);
    const screens = user.config?.screens ?? {};
    expect(screens.Paywall).toBe('pro');
    expect(screens.Redeem).toBe('redeem/:code?');
    expect(screens.Trip).toBe('trip');
    expect(screens).not.toHaveProperty('AdminUser');
    expect(admin.config?.screens).toHaveProperty('AdminUser', 'admin/user/:userId');
    expect(buildLinking({ enabled: false, admin: false }).enabled).toBe(false);
  });

  it('knows the admin routes', () => {
    expect(ADMIN_ROUTES).toContain('AdminStoreEvents');
    expect(isAdminRoute('AdminUser')).toBe(true);
    expect(isAdminRoute('Settings')).toBe(false);
    expect(isAdminRoute(undefined)).toBe(false);
  });

  it('answers a picker request once', async () => {
    const { requestId, result } = createRequest<string>();
    resolveRequest(requestId, 'km');
    resolveRequest(requestId, 'mi');
    await expect(result).resolves.toBe('km');
    const closed = createRequest<string[]>();
    resolveRequest(closed.requestId, null);
    await expect(closed.result).resolves.toBeNull();
  });
});
