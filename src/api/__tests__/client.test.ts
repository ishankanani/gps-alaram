import { describe, expect, it, vi } from 'vitest';

import { buildAcceptLanguage, buildQuery, buildXClient, createApiClient, type ApiClientOptions, type AuthErrorEvent, type ClientInfo } from '../client';
import { ApiError, errorKey, parseRetryAfter } from '../errors';

const INFO: ClientInfo = { platform: 'android', appVersion: '1.0.0', build: 12, osVersion: 34, language: 'en', region: 'DE' };

type Reply = { status: number; body?: string; headers?: Record<string, string> };

function reply({ status, body = '', headers = {} }: Reply): Response {
  return new Response(status === 204 || status === 304 ? null : body, { status, headers });
}

const json = (status: number, value: unknown, headers: Record<string, string> = {}): Reply => ({
  status,
  body: JSON.stringify(value),
  headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
});

function setup(replies: (Reply | Error | 'hang')[], over: Partial<ApiClientOptions> = {}) {
  const calls: { url: string; init: RequestInit }[] = [];
  const queue = [...replies];
  const fetchMock = vi.fn((url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = queue.shift();
    if (next === undefined) throw new Error('No more replies');
    if (next === 'hang') {
      return new Promise<Response>((_, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      });
    }
    if (next instanceof Error) return Promise.reject(next);
    return Promise.resolve(reply(next));
  });
  const authErrors: AuthErrorEvent[] = [];
  const sleeps: number[] = [];
  const client = createApiClient({
    baseUrl: 'https://api.example.com/',
    fetch: fetchMock as unknown as typeof fetch,
    getToken: () => 'sw_token',
    clientInfo: () => INFO,
    onAuthError: (e) => authErrors.push(e),
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    ...over,
  });
  const headers = (i = 0) => calls[i].init.headers as Record<string, string>;
  return { client, calls, headers, authErrors, sleeps, fetchMock };
}

async function failure(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (e) {
    expect(e).toBeInstanceOf(ApiError);
    return e as ApiError;
  }
  throw new Error('Expected the request to fail');
}

describe('headers', () => {
  it('sends the token, X-Client, Accept-Language and JSON', async () => {
    const { client, calls, headers } = setup([json(200, { ok: true })]);
    await client.request('POST', '/v1/promo/redeem', { body: { code: 'SPRING26' } });
    expect(calls[0].url).toBe('https://api.example.com/v1/promo/redeem');
    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].init.body).toBe('{"code":"SPRING26"}');
    expect(headers()).toMatchObject({
      Authorization: 'Bearer sw_token',
      'X-Client': 'android/1.0.0/12/34',
      'Accept-Language': 'en-DE',
      'Content-Type': 'application/json',
    });
  });

  it('leaves out the token and Content-Type when there are none', async () => {
    const { client, headers } = setup([json(200, {})], { getToken: () => null });
    await client.request('GET', '/v1/me');
    expect(headers()).not.toHaveProperty('Authorization');
    expect(headers()).not.toHaveProperty('Content-Type');
  });

  it('lets a request override the token and add headers', async () => {
    const { client, headers } = setup([json(200, {}), json(200, {})]);
    await client.request('GET', '/v1/config', { token: null, headers: { 'If-None-Match': '"abc"' } });
    expect(headers(0)).not.toHaveProperty('Authorization');
    expect(headers(0)['If-None-Match']).toBe('"abc"');
    await client.request('POST', '/v1/auth/sign-in', { token: 'sw_guest', body: {} });
    expect(headers(1).Authorization).toBe('Bearer sw_guest');
  });

  it('builds the query string without empty values', async () => {
    const { client, calls } = setup([json(200, {})]);
    await client.request('GET', '/v1/config', { query: { country: 'DE', lang: 'en', version: null, x: undefined, n: 2 } });
    expect(calls[0].url).toBe('https://api.example.com/v1/config?country=DE&lang=en&n=2');
    expect(buildQuery({ q: 'a b&c' })).toBe('?q=a%20b%26c');
    expect(buildQuery({})).toBe('');
  });

  it('formats X-Client and Accept-Language as the server expects', () => {
    expect(buildXClient({ platform: 'android', appVersion: '1.0', build: null, osVersion: null })).toBe('android/1.0.0/-/-');
    expect(buildXClient({ platform: 'android', appVersion: '0.1.0', build: '7', osVersion: '14' })).toBe('android/0.1.0/7/14');
    expect(buildXClient({ platform: 'ios', appVersion: 'weird', build: 'x1', osVersion: '17.4 beta' })).toBe('ios/0.0.0/-/-');
    expect(buildAcceptLanguage('hi', 'in')).toBe('hi-IN');
    expect(buildAcceptLanguage('nb', null)).toBe('nb');
    expect(buildAcceptLanguage('xx-YY', 'DE')).toBe('en-DE');
  });
});

describe('answers', () => {
  it('resolves JSON, 204 with undefined and 304 with null', async () => {
    const { client } = setup([json(200, { a: 1 }), { status: 204 }, { status: 304 }]);
    await expect(client.request('GET', '/v1/me')).resolves.toEqual({ a: 1 });
    await expect(client.request('POST', '/v1/auth/sign-out')).resolves.toBeUndefined();
    await expect(client.request('GET', '/v1/config')).resolves.toBeNull();
  });

  it('maps error bodies to ApiError', async () => {
    const { client } = setup([
      json(400, { error: { code: 'validation_failed', message: 'Invalid', fields: { email: 'invalid_email', password: 'nonsense' } } }),
      json(409, { error: { code: 'subscription_active', message: 'Active', details: { store: 'play_store' } } }),
      json(429, { error: { code: 'rate_limited', message: 'Slow down' } }, { 'Retry-After': '720' }),
      json(429, { error: { code: 'rate_limited', message: 'Slow down', retryAfterSeconds: 30 } }, { 'Retry-After': '720' }),
    ]);
    const validation = await failure(client.request('POST', '/v1/auth/sign-up', { body: {} }));
    expect(validation).toMatchObject({ status: 400, code: 'validation_failed', fields: { email: 'invalid_email', password: 'invalid' } });
    const active = await failure(client.request('DELETE', '/v1/me', { body: {} }));
    expect(active).toMatchObject({ status: 409, code: 'subscription_active', details: { store: 'play_store' } });
    expect((await failure(client.request('POST', '/v1/promo/redeem', { body: {} }))).retryAfterSeconds).toBe(720);
    expect((await failure(client.request('POST', '/v1/promo/redeem', { body: {} }))).retryAfterSeconds).toBe(30);
  });

  it('calls onAuthError for unauthorized, reauth_required and account_disabled only', async () => {
    const { client, authErrors } = setup([
      json(401, { error: { code: 'unauthorized', message: 'No' } }),
      json(401, { error: { code: 'reauth_required', message: 'Again' } }),
      json(403, { error: { code: 'account_disabled', message: 'Off', details: { publicId: 'SW-7K3P-92QX', supportEmail: 's@example.com' } } }),
      json(401, { error: { code: 'invalid_credentials', message: 'Wrong' } }),
      json(403, { error: { code: 'forbidden', message: 'Admins only' } }),
    ]);
    for (let i = 0; i < 5; i++) await failure(client.request('POST', '/v1/x', { body: {} }));
    expect(authErrors.map((e) => e.kind)).toEqual(['unauthorized', 'reauth_required', 'disabled']);
    expect(authErrors[0]).toMatchObject({ token: 'sw_token', path: '/v1/x' });
    expect(authErrors[2].error.details).toEqual({ publicId: 'SW-7K3P-92QX', supportEmail: 's@example.com' });
  });

  it('reports answers that are not JSON as bad_response (a gateway page as unavailable)', async () => {
    const { client } = setup([
      { status: 200, body: '<html>hello</html>' },
      { status: 400, body: 'Bad' },
      { status: 404, body: JSON.stringify({ error: { code: 'teleport_failed', message: '?' } }) },
      { status: 502, body: '<html>Bad gateway</html>' },
      { status: 502, body: '<html>Bad gateway</html>' },
      { status: 502, body: '<html>Bad gateway</html>' },
    ]);
    expect(await failure(client.request('POST', '/v1/a'))).toMatchObject({ status: 200, code: 'bad_response' });
    expect(await failure(client.request('POST', '/v1/b'))).toMatchObject({ status: 400, code: 'bad_response' });
    expect(await failure(client.request('POST', '/v1/c'))).toMatchObject({ status: 404, code: 'bad_response' });
    expect(await failure(client.request('GET', '/v1/d'))).toMatchObject({ status: 502, code: 'unavailable' });
  });

  it('resolves undefined for an empty 200', async () => {
    const { client } = setup([{ status: 200, body: '' }]);
    await expect(client.request('POST', '/v1/plan/sync')).resolves.toBeUndefined();
  });
});

describe('failures without an answer', () => {
  it('turns a fetch failure into network', async () => {
    const reach: boolean[] = [];
    const { client } = setup([new TypeError('Network request failed')], { onReachability: (r) => reach.push(r) });
    const e = await failure(client.request('POST', '/v1/auth/guest', { body: {} }));
    expect(e).toMatchObject({ status: 0, code: 'network' });
    expect(e.offline).toBe(true);
    expect(reach).toEqual([false]);
  });

  it('turns a timeout into timeout', async () => {
    vi.useFakeTimers();
    try {
      const { client } = setup(['hang']);
      const pending = failure(client.request('POST', '/v1/auth/sign-in', { body: {}, timeoutMs: 20_000 }));
      await vi.advanceTimersByTimeAsync(19_999);
      await vi.advanceTimersByTimeAsync(1);
      expect(await pending).toMatchObject({ status: 0, code: 'timeout' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('times out after 10 s by default', async () => {
    vi.useFakeTimers();
    try {
      const { client } = setup(['hang']);
      const pending = failure(client.request('POST', '/v1/me/export'));
      await vi.advanceTimersByTimeAsync(10_000);
      expect((await pending).code).toBe('timeout');
    } finally {
      vi.useRealTimers();
    }
  });

  it('retries GETs twice, after 1 s and 3 s', async () => {
    const { client, fetchMock, sleeps } = setup([new TypeError('offline'), json(503, { error: { code: 'unavailable', message: 'DB' } }), json(200, { ok: 1 })]);
    await expect(client.request('GET', '/v1/me')).resolves.toEqual({ ok: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(sleeps).toEqual([1000, 3000]);
  });

  it('gives up after the second retry', async () => {
    const { client, fetchMock } = setup([new TypeError('a'), new TypeError('b'), new TypeError('c')]);
    expect((await failure(client.request('GET', '/v1/me'))).code).toBe('network');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('never retries other methods or 4xx answers', async () => {
    const { client, fetchMock } = setup([new TypeError('offline'), json(404, { error: { code: 'not_found', message: 'No' } })]);
    expect((await failure(client.request('POST', '/v1/promo/redeem', { body: {} }))).code).toBe('network');
    expect((await failure(client.request('GET', '/v1/nothing'))).code).toBe('not_found');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('error helpers', () => {
  it('names the i18n key of a code', () => {
    expect(errorKey('promo_expired')).toBe('errors.promo_expired');
    expect(errorKey('network')).toBe('errors.network');
  });

  it('reads Retry-After as seconds or a date', () => {
    expect(parseRetryAfter('120')).toBe(120);
    expect(parseRetryAfter('Sat, 10 Oct 2026 08:02:00 GMT', Date.parse('2026-10-10T08:00:00Z'))).toBe(120);
    expect(parseRetryAfter('soon')).toBeUndefined();
    expect(parseRetryAfter(null)).toBeUndefined();
  });
});
