/**
 * Retention (spec 1.5), run hourly and by `cli.ts prune`.
 *
 * | sessions               | expires_at < now                                                     |
 * | password_reset_tokens  | 24 h after expires_at or used_at                                     |
 * | webhook_events         | received_at < now − 90 d                                             |
 * | merged guests          | 30 days after the merge (updated_at)                                 |
 * | abandoned guests       | no email, active, last seen > 400 d ago, no grants, store            |
 * |                        | subscriptions, redemptions or notes                                  |
 * | audit_log              | at < now − 730 d                                                     |
 */
import { DAY, HOUR } from '../clock.ts';
import { run, tx, type Db } from '../db/database.ts';

export type PruneResult = {
  sessions: number;
  resetTokens: number;
  webhookEvents: number;
  mergedGuests: number;
  abandonedGuests: number;
  auditEntries: number;
};

export function prune(db: Db, now: number): PruneResult {
  return tx(db, () => ({
    sessions: run(db, 'DELETE FROM sessions WHERE expires_at < ?', now).changes,
    resetTokens: run(
      db,
      'DELETE FROM password_reset_tokens WHERE expires_at < ? OR (used_at IS NOT NULL AND used_at < ?)',
      now - 24 * HOUR, now - 24 * HOUR,
    ).changes,
    webhookEvents: run(db, 'DELETE FROM webhook_events WHERE received_at < ?', now - 90 * DAY).changes,
    mergedGuests: run(db, "DELETE FROM users WHERE status = 'merged' AND updated_at < ?", now - 30 * DAY).changes,
    abandonedGuests: run(
      db,
      `DELETE FROM users WHERE email IS NULL AND status = 'active' AND coalesce(last_seen_at, created_at) < ?
         AND NOT EXISTS (SELECT 1 FROM grants g WHERE g.user_id = users.id)
         AND NOT EXISTS (SELECT 1 FROM store_subscriptions s WHERE s.user_id = users.id)
         AND NOT EXISTS (SELECT 1 FROM promo_redemptions r WHERE r.user_id = users.id)
         AND NOT EXISTS (SELECT 1 FROM notes n WHERE n.user_id = users.id)
         AND NOT EXISTS (SELECT 1 FROM users m WHERE m.merged_into = users.id)`,
      now - 400 * DAY,
    ).changes,
    auditEntries: run(db, 'DELETE FROM audit_log WHERE at < ?', now - 730 * DAY).changes,
  }));
}
