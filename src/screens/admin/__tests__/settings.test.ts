import { describe, expect, it } from 'vitest';

import type { AdminSetting } from '../../../api/types';
import {
  announcementId,
  changedKeys,
  checkSettings,
  cleanAnnouncement,
  FALLBACK_VALUES,
  isHttpsUrl,
  lastChange,
  newAnnouncement,
  settingsPatch,
  valuesFrom,
} from '../lib/settings';

const item = (key: AdminSetting['key'], value: unknown, def: unknown = value, updatedAt: string | null = null): AdminSetting => ({
  key, value, default: def, overridden: updatedAt !== null, updatedAt, updatedBy: null,
});

const items: AdminSetting[] = [
  item('limits.freeFavourites', 5, 3, '2026-10-01T10:00:00.000Z'),
  item('support.email', 'support@example.com', 'help@example.com', '2026-06-13T16:34:41.350Z'),
  item('links.privacy', 'https://stopwake.example/privacy'),
  item('links.terms', 'https://stopwake.example/terms'),
];

describe('app settings', () => {
  it('reads values and defaults', () => {
    const { values, defaults } = valuesFrom(items);
    expect(values['limits.freeFavourites']).toBe(5);
    expect(defaults['limits.freeFavourites']).toBe(3);
    expect(values['plan.cacheDays']).toBe(FALLBACK_VALUES['plan.cacheDays']);
    expect(lastChange(items)?.key).toBe('limits.freeFavourites');
  });

  it('patches only what changed; back to the default means null (reset)', () => {
    const { values, defaults } = valuesFrom(items);
    const next = { ...values, 'limits.freeFavourites': 3, 'plan.cacheDays': 14 };
    expect(changedKeys(values, next)).toEqual(['limits.freeFavourites', 'plan.cacheDays']);
    expect(settingsPatch(values, next, defaults)).toEqual({ 'limits.freeFavourites': null, 'plan.cacheDays': 14 });
    expect(settingsPatch(values, values, defaults)).toEqual({});
  });

  it('checks values like the server schemas', () => {
    const { values } = valuesFrom(items);
    expect(checkSettings(values)).toEqual({});
    const bad = {
      ...values,
      'limits.freeFavourites': 101,
      'plan.cacheDays': 0,
      'support.email': 'nope',
      'links.terms': 'http://insecure.example',
      'app.minVersion': '1.0',
      'app.latestVersion': '0.9.0',
    };
    expect(Object.keys(checkSettings(bad)).sort()).toEqual(
      ['app.minVersion', 'limits.freeFavourites', 'links.terms', 'plan.cacheDays', 'support.email'].sort(),
    );
    expect(checkSettings({ ...values, 'app.minVersion': '1.2.0', 'app.latestVersion': '1.1.0' })['app.latestVersion']).toBe(
      'admin.settings.error.latestBelowMin',
    );
    expect(isHttpsUrl('https://stopwake.example/privacy?x=1')).toBe(true);
    expect(isHttpsUrl('https://user@host.example')).toBe(false);
  });

  it('drafts and checks announcements', () => {
    const now = new Date(2026, 9, 11, 16, 42);
    expect(announcementId(now)).toBe('ann-2026-10-11-1642');
    const draft = newAnnouncement(now);
    const { values } = valuesFrom(items);
    expect(checkSettings({ ...values, announcement: draft })['announcement.body.en']).toBe('admin.ann.error.bodyRequired');
    const ok = { ...draft, texts: { en: { title: '  ', body: ' New stops for France ' } }, url: ' ', countries: [] };
    const clean = cleanAnnouncement(ok);
    expect(clean.texts.en).toEqual({ title: null, body: 'New stops for France' });
    expect(clean.url).toBeNull();
    expect(clean.countries).toBeNull();
    expect(checkSettings({ ...values, announcement: clean })).toEqual({});
    const order = { ...clean, minAppVersion: '2.0.0', maxAppVersion: '1.0.0', startsAt: '2026-10-12T00:00:00.000Z', endsAt: '2026-10-11T00:00:00.000Z' };
    expect(Object.keys(checkSettings({ ...values, announcement: order })).sort()).toEqual(['announcement.endsAt', 'announcement.maxAppVersion']);
  });
});
