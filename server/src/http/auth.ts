/**
 * Authentication and auth levels (spec 2.1, 4.2, 4.5).
 *
 * The role and status are read from the database on every request, never cached in the token.
 * On each authenticated request where now − last_used_at ≥ 15 min, one write slides the session
 * (expires_at = now + SESSION_DAYS), sets users.last_seen_at and refreshes device and user
 * metadata from X-Client and Accept-Language.
 */
import type { IncomingMessage } from 'node:http';

import type { AuthState } from '../context.ts';
import { DAY, MINUTE } from '../clock.ts';
import { run, tx, type Db } from '../db/database.ts';
import { touchDevice } from '../domain/devices.ts';
import { digestEqual } from '../domain/ids.ts';
import { findSessionByToken, slideSession } from '../domain/sessions.ts';
import { getUser } from '../domain/users.ts';
import { accountDisabled, ApiError, forbidden, unauthorized } from './errors.ts';
import type { ClientInfo, LocaleInfo } from './request.ts';
import type { AuthLevel } from './router.ts';

export const TOUCH_INTERVAL = 15 * MINUTE;

/** `Authorization: Bearer sw_…` → the token, or null. */
export function bearerToken(req: IncomingMessage): string | null {
  const h = req.headers.authorization;
  if (typeof h !== 'string' || h.length > 200) return null;
  const m = /^Bearer[ \t]+(\S+)[ \t]*$/i.exec(h);
  return m?.[1] ?? null;
}

/** A valid, unexpired session and its user (any status), or null. */
export function resolveAuth(db: Db, token: string, now: number): AuthState | null {
  const session = findSessionByToken(db, token);
  if (!session || session.expires_at <= now) return null;
  const user = getUser(db, session.user_id);
  if (!user) return null;
  return { session, user };
}

/** Applies an auth level; throws the matching ApiError. */
export function authorize(
  level: Exclude<AuthLevel, 'none' | 'webhook'>,
  state: AuthState | null,
  opts: { allowDisabled?: boolean; now: number; adminSessionDays: number; supportEmail: () => string },
): AuthState {
  if (!state || state.user.status === 'merged') throw unauthorized();
  const { user, session } = state;
  if (user.status === 'disabled' && !opts.allowDisabled) throw accountDisabled(user.public_id, opts.supportEmail());
  if (level === 'guest' && user.email !== null) {
    throw new ApiError(409, 'already_signed_up', 'This session already belongs to an account');
  }
  if (level === 'account' && user.email === null) {
    throw new ApiError(409, 'not_an_account', 'Sign up first: this is a guest session');
  }
  if (level === 'admin') {
    if (user.role !== 'admin' || user.email === null) throw forbidden();
    if (opts.now - session.created_at > opts.adminSessionDays * DAY) {
      throw new ApiError(401, 'reauth_required', 'Confirm your password to continue');
    }
  }
  return state;
}

/** Sliding expiry and metadata refresh, at most once per 15 minutes per session. */
export function touchSession(
  db: Db,
  state: AuthState,
  input: { now: number; sessionDays: number; client: ClientInfo | null; locale: LocaleInfo },
): void {
  const { now } = input;
  if (now - state.session.last_used_at < TOUCH_INTERVAL) return;
  tx(db, () => {
    slideSession(db, state.session.id, now, input.sessionDays);
    run(
      db,
      'UPDATE users SET last_seen_at = ?, country = coalesce(?, country), language = coalesce(?, language) WHERE id = ?',
      now, input.locale.country, input.locale.language, state.user.id,
    );
    if (state.session.device_id !== null) touchDevice(db, state.session.device_id, input);
  });
}

/**
 * Webhook auth: Authorization equals `Bearer ${REVENUECAT_WEBHOOK_SECRET}` (or the previous secret
 * during rotation), compared as SHA-256 digests with timingSafeEqual. Without a secret: 503.
 */
export function checkWebhookAuth(header: string | undefined, secret: string | null, previous: string | null): void {
  if (!secret) throw new ApiError(503, 'not_configured', 'The webhook secret is not configured');
  const got = typeof header === 'string' ? header : '';
  // Both comparisons always run.
  const current = digestEqual(got, `Bearer ${secret}`);
  const old = digestEqual(got, `Bearer ${previous ?? secret}`) && previous !== null;
  if (!current && !old) throw unauthorized();
}
