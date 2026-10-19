/**
 * The Supabase client and the SupabaseBackend the router (./router.ts) runs on. Configured from
 * EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY (inlined at build time). Without
 * them `supabaseConfigured` is false, no client is created and the app works offline without
 * accounts, as before. Only the anon (publishable) key ever belongs in the app: Row Level
 * Security and the SECURITY DEFINER functions decide what it may do.
 */
import 'react-native-url-polyfill/auto';

import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { AppState } from 'react-native';

import { ApiError } from '../errors';
import { fromAuthError, fromPostgrestError } from './errors';
import type { BackendSession, DeviceInfo, SupabaseBackend } from './router';
import { createChunkedStorage } from './storage';

export const SUPABASE_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
const SUPABASE_ANON_KEY = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();

export const supabaseConfigured = /^https?:\/\/\S+$/.test(SUPABASE_URL) && SUPABASE_ANON_KEY.length > 20;

const storage = createChunkedStorage({
  getItem: (key) => SecureStore.getItem(key),
  setItem: (key, value) => SecureStore.setItem(key, value),
  deleteItem: (key) => {
    void SecureStore.deleteItemAsync(key).catch(() => {});
  },
});

let client: SupabaseClient | null = null;

/** The Supabase client, or null in a build without Supabase. */
export function getSupabase(): SupabaseClient | null {
  if (!supabaseConfigured) return null;
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage,
        storageKey: 'stopwake.sb',
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
    // Refresh tokens only while the app is in front (Supabase's React Native advice).
    AppState.addEventListener('change', (state) => {
      if (state === 'active') void client?.auth.startAutoRefresh();
      else void client?.auth.stopAutoRefresh();
    });
    void client.auth.startAutoRefresh();
  }
  return client;
}

function required(): SupabaseClient {
  const c = getSupabase();
  if (!c) throw new ApiError({ status: 0, code: 'not_configured', message: 'This build has no Supabase project' });
  return c;
}

export function toBackendSession(s: Session): BackendSession {
  return {
    accessToken: s.access_token,
    userId: s.user.id,
    email: s.user.email ?? null,
    expiresAt: (s.expires_at ?? Math.floor(Date.now() / 1000) + 3600) * 1000,
  };
}

/** Builds the backend; device/language/region come from the app (src/api/index.ts). */
export function createSupabaseBackend(context: {
  device: () => DeviceInfo | null;
  language: () => string;
  region: () => string | null;
}): SupabaseBackend {
  return {
    url: SUPABASE_URL,
    device: context.device,
    language: context.language,
    region: context.region,
    async rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
      let result;
      try {
        result = await required().rpc(fn, args ?? {});
      } catch (e) {
        throw fromPostgrestError(e);
      }
      if (result.error) throw fromPostgrestError(result.error);
      return result.data as T;
    },
    async session() {
      const { data } = await required().auth.getSession();
      return data.session ? toBackendSession(data.session) : null;
    },
    async signUp({ email, password, data }) {
      const res = await required().auth.signUp({ email, password, options: { data } });
      if (res.error) throw fromAuthError(res.error);
      // An existing, confirmed address comes back without identities (Supabase hides that it exists).
      if (res.data.user && Array.isArray(res.data.user.identities) && res.data.user.identities.length === 0) {
        throw new ApiError({ status: 409, code: 'email_taken', message: 'An account with this email exists' });
      }
      return res.data.session ? toBackendSession(res.data.session) : null;
    },
    async signIn(email, password) {
      const res = await required().auth.signInWithPassword({ email, password });
      if (res.error || !res.data.session) throw fromAuthError(res.error ?? { code: 'invalid_credentials' });
      return toBackendSession(res.data.session);
    },
    async signOut() {
      const res = await required().auth.signOut({ scope: 'local' });
      if (res.error) throw fromAuthError(res.error);
    },
    async resetPasswordForEmail(email) {
      const res = await required().auth.resetPasswordForEmail(email);
      if (res.error) throw fromAuthError(res.error);
    },
    async verifyRecovery(email, code) {
      const res = await required().auth.verifyOtp({ email, token: code, type: 'recovery' });
      if (res.error || !res.data.session) throw fromAuthError(res.error ?? { code: 'otp_expired' });
      return toBackendSession(res.data.session);
    },
    async updateUser(change) {
      const res = await required().auth.updateUser(change);
      if (res.error) throw fromAuthError(res.error, change.password ? 'newPassword' : 'password');
    },
  };
}
