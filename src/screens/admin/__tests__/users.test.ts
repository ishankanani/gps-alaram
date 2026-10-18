import { describe, expect, it } from 'vitest';

import { COUNTRIES, countryName, flagEmoji, searchCountries } from '../lib/countries';
import { buildUserQuery, directUserRef, normalizePublicId, parseFilterParam, planName, userTitle } from '../lib/users';
import { t } from './t';

describe('finding users', () => {
  it('normalizes public ids like the server (backend-spec 1.1)', () => {
    expect(normalizePublicId('sw 7k3p 92qx')).toBe('SW-7K3P-92QX');
    expect(normalizePublicId('SW7K3P92QX')).toBe('SW-7K3P-92QX');
    expect(normalizePublicId('7K3P-92QX')).toBe('SW-7K3P-92QX');
    expect(normalizePublicId('sw-ap9m-o668')).toBe('SW-AP9M-0668');
    expect(normalizePublicId('SW-7K3P-92QU')).toBeNull();
    expect(normalizePublicId('swantje')).toBeNull();
  });

  it('opens a user directly only for complete ids', () => {
    expect(directUserRef('SW-7K3P-92QX')).toBe('SW-7K3P-92QX');
    expect(directUserRef('7k3p-92qx')).toBe('SW-7K3P-92QX');
    expect(directUserRef('E7128D10-9D8A-4240-B625-1C3BFD583EAE')).toBe('e7128d10-9d8a-4240-b625-1c3bfd583eae');
    expect(directUserRef('swantje')).toBeNull();
    expect(directUserRef('anna@example.com')).toBeNull();
    expect(directUserRef('7K3P92QX')).toBeNull();
  });

  it('maps each chip to exactly one query', () => {
    const base = { source: 'any' as const, country: null, sort: 'newest' as const, q: '' };
    expect(buildUserQuery({ ...base, filter: 'all' })).toEqual({ sort: 'created', order: 'desc' });
    expect(buildUserQuery({ ...base, filter: 'pro' }).plan).toBe('pro');
    expect(buildUserQuery({ ...base, filter: 'trial' }).plan).toBe('trial');
    expect(buildUserQuery({ ...base, filter: 'free' }).plan).toBe('free');
    expect(buildUserQuery({ ...base, filter: 'accounts' }).kind).toBe('account');
    expect(buildUserQuery({ ...base, filter: 'guests' }).kind).toBe('guest');
    expect(buildUserQuery({ ...base, filter: 'admins' }).role).toBe('admin');
    expect(buildUserQuery({ ...base, filter: 'disabled' }).status).toBe('disabled');
    expect(buildUserQuery({ ...base, filter: 'all', source: 'promo', country: 'DE', sort: 'email', q: ' anna ' })).toEqual({
      q: 'anna',
      source: 'promo',
      country: 'DE',
      sort: 'email',
      order: 'asc',
    });
    // Free with a source would always be empty: the source is dropped.
    expect(buildUserQuery({ ...base, filter: 'free', source: 'store' }).source).toBeUndefined();
    expect(buildUserQuery({ ...base, filter: 'all', sort: 'oldest' })).toMatchObject({ sort: 'created', order: 'asc' });
  });

  it('reads the filter route param', () => {
    expect(parseFilterParam(undefined)).toEqual({ filter: 'all', country: null, source: 'any' });
    expect(parseFilterParam('trial').filter).toBe('trial');
    expect(parseFilterParam('country:de')).toEqual({ filter: 'all', country: 'DE', source: 'any' });
    expect(parseFilterParam('source:grant')).toEqual({ filter: 'pro', country: null, source: 'grant' });
    expect(parseFilterParam('bogus').filter).toBe('all');
  });

  it('labels users and plans', () => {
    expect(userTitle({ email: null, displayName: null, kind: 'guest' }, t)).toBe('Guest');
    expect(userTitle({ email: 'a@b.de', displayName: 'A', kind: 'account' }, t)).toBe('a@b.de');
    expect(planName('yearly', t)).toBe('Pro · Yearly');
    expect(planName('free', t)).toBe('Free');
  });
});

describe('countries', () => {
  it('names countries and builds flags', () => {
    expect(countryName('de')).toBe('Germany');
    expect(countryName('XX')).toBe('XX');
    expect(flagEmoji('DE')).toBe('🇩🇪');
    expect(flagEmoji('EU')).toBe('🇪🇺');
    expect(flagEmoji('DEFAULT')).toBe('');
    expect(new Set(COUNTRIES.map((c) => c.code)).size).toBe(COUNTRIES.length);
    expect(COUNTRIES.length).toBeGreaterThan(240);
  });

  it('searches by code first, then by name without accents', () => {
    expect(searchCountries('ch')[0].code).toBe('CH');
    expect(searchCountries('reunion').map((c) => c.code)).toContain('RE');
    expect(searchCountries('united').map((c) => c.code)).toEqual(expect.arrayContaining(['GB', 'US', 'AE']));
    expect(searchCountries('').length).toBe(COUNTRIES.length);
  });
});
