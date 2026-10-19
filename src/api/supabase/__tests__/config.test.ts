import { describe, expect, it } from 'vitest';

import { BUILTIN_PRICES } from '../../../lib/pricing';
import { adminPricesFrom, adminSettingsFrom, buildRemoteConfig, defaultFormat, visibleAnnouncement } from '../config';

const announcement = {
  id: 'maint', enabled: true, level: 'warning', dismissible: true, url: null, countries: ['DE'],
  minAppVersion: '1.0.0', maxAppVersion: null, startsAt: null, endsAt: '2030-01-01T00:00:00.000Z',
  texts: { en: { title: 'Heads up', body: 'Maintenance tonight' }, de: { title: null, body: 'Wartung heute Nacht' } },
};

describe('buildRemoteConfig', () => {
  it('uses the defaults without any stored values', () => {
    const c = buildRemoteConfig({ settings: {}, prices: [], version: 'abc' }, { country: 'de', lang: 'de', version: '1.0.0' });
    expect(c.country).toBe('DE');
    expect(c.limits.freeFavourites).toBe(3);
    expect(c.prices.country).toBe('DE');
    expect(c.configVersion).toBe('sb-abc');
    expect(c.auth.signUpEnabled).toBe(true);
  });

  it('applies settings, price overrides and the announcement', () => {
    const c = buildRemoteConfig(
      {
        settings: { 'limits.freeFavourites': 5, 'promo.redeemEnabled': false, announcement },
        prices: [{ country: 'DE', currency: 'EUR', monthly: 299, yearly: 1999, lifetime: 4999, trialDays: 3, format: null }],
        version: 'v2',
      },
      { country: 'DE', lang: 'de', version: '1.2.0' },
      Date.parse('2026-10-19T00:00:00Z'),
    );
    expect(c.limits.freeFavourites).toBe(5);
    expect(c.features.redeemCodes).toBe(false);
    expect(c.prices.monthly).toBe(299);
    expect(c.trialDays).toBe(3);
    expect(c.prices.format).toEqual(defaultFormat('DE', 'EUR'));
    expect(c.announcement).toEqual({ id: 'maint', level: 'warning', title: null, body: 'Wartung heute Nacht', url: null, dismissible: true });
  });

  it('hides announcements outside their country, version or window', () => {
    const q = { country: 'DE', lang: 'en' as const, version: '1.0.0' };
    expect(visibleAnnouncement(announcement, { ...q, country: 'FR' }, 0)).toBeNull();
    expect(visibleAnnouncement(announcement, { ...q, version: '0.9.0' }, 0)).toBeNull();
    expect(visibleAnnouncement(announcement, q, Date.parse('2031-01-01'))).toBeNull();
    expect(visibleAnnouncement({ ...announcement, enabled: false }, q, 0)).toBeNull();
    expect(visibleAnnouncement(announcement, q, 0)?.title).toBe('Heads up');
  });
});

describe('admin settings and prices', () => {
  it('lists every setting with its default and marks overrides', () => {
    const { items } = adminSettingsFrom({ items: [{ key: 'plan.cacheDays', value: 14, updatedAt: '2026-01-01T00:00:00.000Z', updatedBy: null }] });
    expect(items).toHaveLength(13);
    const cache = items.find((i) => i.key === 'plan.cacheDays')!;
    expect(cache).toMatchObject({ value: 14, default: 30, overridden: true });
    expect(items.find((i) => i.key === 'limits.freeFavourites')).toMatchObject({ value: 3, overridden: false, updatedAt: null });
  });

  it('merges overrides with the built-in rows, EU and DEFAULT last', () => {
    const res = adminPricesFrom({
      items: [{ country: 'US', currency: 'USD', monthly: 199, yearly: 1499, lifetime: 2999, trialDays: null, format: null }],
      defaultTrialDays: 7,
    });
    const keys = res.items.map((r) => r.country);
    expect(keys.slice(-2)).toEqual(['EU', 'DEFAULT']);
    expect(keys).toContain('US');
    expect(res.items.find((r) => r.country === 'US')).toMatchObject({ overridden: true, builtin: BUILTIN_PRICES.find((b) => b.country === 'US') ?? null });
    expect(res.items.filter((r) => r.overridden)).toHaveLength(1);
    expect(res.defaultTrialDays).toBe(7);
  });
});
