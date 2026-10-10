/**
 * Optional RevenueCat REST v1 client (spec 3.5, 4.10), used only with REVENUECAT_API_KEY (the v1
 * secret key): getSubscriber for /v1/plan/sync, deleteSubscriber after an account deletion.
 * 10 s timeout. The key is sent only to the RevenueCat API and never logged.
 */
import type { Logger } from '../log.ts';

export type RevenueCatApi = {
  getSubscriber(appUserId: string): Promise<unknown>;
  deleteSubscriber(appUserId: string): Promise<void>;
};

export class RevenueCatError extends Error {
  readonly status: number | null;
  constructor(message: string, status: number | null) {
    super(message);
    this.name = 'RevenueCatError';
    this.status = status;
  }
}

export function createRevenueCatApi(opts: {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}): RevenueCatApi {
  const base = (opts.baseUrl ?? 'https://api.revenuecat.com').replace(/\/+$/, '');
  const doFetch = opts.fetch ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const call = async (method: 'GET' | 'DELETE', appUserId: string): Promise<Response> => {
    const res = await doFetch(`${base}/v1/subscribers/${encodeURIComponent(appUserId)}`, {
      method,
      headers: { Authorization: `Bearer ${opts.apiKey}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res;
  };
  return {
    async getSubscriber(appUserId) {
      const res = await call('GET', appUserId);
      if (!res.ok) throw new RevenueCatError(`RevenueCat GET subscriber failed with ${res.status}`, res.status);
      return (await res.json()) as unknown;
    },
    async deleteSubscriber(appUserId) {
      const res = await call('DELETE', appUserId);
      // 404: nothing to delete.
      if (!res.ok && res.status !== 404) throw new RevenueCatError(`RevenueCat DELETE subscriber failed with ${res.status}`, res.status);
      await res.body?.cancel();
    },
  };
}

/** After an account deletion: up to 3 retries (1 s, 5 s, 15 s), failures logged, never thrown. */
export async function deleteSubscribersWithRetry(
  api: RevenueCatApi,
  appUserIds: readonly string[],
  log: Logger,
  delaysMs: readonly number[] = [1_000, 5_000, 15_000],
): Promise<void> {
  for (const id of appUserIds) {
    for (let attempt = 0; ; attempt++) {
      try {
        await api.deleteSubscriber(id);
        break;
      } catch (err) {
        if (attempt >= delaysMs.length) {
          log.error('revenuecat subscriber deletion failed', { attempts: attempt + 1, error: (err as Error).message });
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, delaysMs[attempt]).unref());
      }
    }
  }
}
