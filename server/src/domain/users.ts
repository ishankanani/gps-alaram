/**
 * Users (spec 1.2, 2.6, 3.6, 4.10): guests, accounts, the guest → account merge and deletion.
 * Every function here is synchronous and expects to run inside the caller's transaction.
 */
import type { AdminRef, ApiLang, MergeSummary, Role, User } from '../../../src/api/types.ts';
import { iso, isoOrNull } from '../clock.ts';
import { isUniqueViolation, many, one, placeholders, run, type Db } from '../db/database.ts';
import { scrubAuditForUsers, writeAudit, SYSTEM_ACTOR, type AuditActor } from './audit.ts';
import { newPublicId, newUserId } from './ids.ts';
import { recomputePlan, storeEnd, type PlanOptions, type StoreSubscriptionRow, type UserStatus } from './plans.ts';

export type UserRow = {
  id: string;
  public_id: string;
  email: string | null;
  email_verified_at: number | null;
  password_hash: string | null;
  password_changed_at: number | null;
  display_name: string | null;
  role: Role;
  status: UserStatus;
  disabled_at: number | null;
  disabled_reason: string | null;
  merged_into: string | null;
  country: string | null;
  language: ApiLang | null;
  plan: 'free' | 'monthly' | 'yearly' | 'lifetime';
  plan_source: 'store' | 'grant' | 'promo' | null;
  plan_until: number | null;
  plan_will_renew: 0 | 1;
  plan_trial: 0 | 1;
  plan_ref: string | null;
  created_at: number;
  updated_at: number;
  signed_up_at: number | null;
  last_seen_at: number | null;
};

export const getUser = (db: Db, id: string): UserRow | undefined => one<UserRow>(db, 'SELECT * FROM users WHERE id = ?', id);

export const getUserByEmail = (db: Db, email: string): UserRow | undefined =>
  one<UserRow>(db, 'SELECT * FROM users WHERE email = ?', email);

export const getUserByPublicId = (db: Db, publicId: string): UserRow | undefined =>
  one<UserRow>(db, 'SELECT * FROM users WHERE public_id = ?', publicId);

export function toUser(row: UserRow): User {
  return {
    id: row.id,
    publicId: row.public_id,
    kind: row.email === null ? 'guest' : 'account',
    email: row.email,
    emailVerified: row.email_verified_at !== null,
    displayName: row.display_name,
    role: row.role,
    country: row.country,
    language: row.language,
    createdAt: iso(row.created_at),
    signedUpAt: isoOrNull(row.signed_up_at),
  };
}

export function adminRef(db: Db, userId: string | null): AdminRef | null {
  if (!userId) return null;
  const r = one<{ id: string; public_id: string; display_name: string | null }>(
    db, 'SELECT id, public_id, display_name FROM users WHERE id = ?', userId,
  );
  return r ? { id: r.id, publicId: r.public_id, displayName: r.display_name } : null;
}

/** Inserts a user with a fresh public id, retrying up to 5 times on a public-id collision. */
function insertUser(db: Db, fields: Omit<Partial<UserRow>, 'id' | 'public_id'> & { created_at: number }): UserRow {
  const id = newUserId();
  const columns = ['id', 'public_id', ...Object.keys(fields)];
  const values = Object.values(fields) as Array<string | number | null>;
  for (let attempt = 0; ; attempt++) {
    const publicId = newPublicId();
    try {
      run(db, `INSERT INTO users (${columns.join(', ')}) VALUES (${placeholders(columns.length)})`, id, publicId, ...values);
      return getUser(db, id)!;
    } catch (err) {
      if (attempt < 5 && isUniqueViolation(err, 'users.public_id')) continue;
      throw err;
    }
  }
}

export function createGuest(db: Db, input: { country: string | null; language: ApiLang | null; now: number }): UserRow {
  return insertUser(db, {
    country: input.country,
    language: input.language,
    created_at: input.now,
    updated_at: input.now,
    last_seen_at: input.now,
  });
}

/** An account created directly (admin bootstrap, CLI, tests). */
export function createAccount(
  db: Db,
  input: { email: string; passwordHash: string; role?: Role; displayName?: string | null; now: number },
): UserRow {
  return insertUser(db, {
    email: input.email,
    password_hash: input.passwordHash,
    password_changed_at: input.now,
    display_name: input.displayName ?? null,
    role: input.role ?? 'user',
    created_at: input.now,
    updated_at: input.now,
    signed_up_at: input.now,
  });
}

export function countActiveAdmins(db: Db): number {
  return one<{ n: number }>(db, "SELECT count(*) AS n FROM users WHERE role = 'admin' AND status = 'active'")?.n ?? 0;
}

/** A store subscription that will renew and whose access has not ended (DELETE /v1/me guard). */
export function renewingStoreSubscription(db: Db, userId: string, now: number): StoreSubscriptionRow | undefined {
  return many<StoreSubscriptionRow>(
    db,
    "SELECT * FROM store_subscriptions WHERE user_id = ? AND will_renew = 1 AND status NOT IN ('expired', 'refunded') ORDER BY id",
    userId,
  ).find((s) => storeEnd(s) > now);
}

/**
 * Merges guest G into account U (3.6), inside the sign-in transaction:
 * store subscriptions and grants move; redemptions move unless U already redeemed the same code
 * (then G's grant from it is revoked and G's redemption deleted); notes, devices and webhook
 * events move; G's sessions are deleted; G is marked merged with a free plan; U is recomputed
 * and audited (`user.merge`, actor system). Returns the summary, or null when nothing moved.
 */
export function mergeGuestIntoAccount(
  db: Db,
  input: { guestId: string; accountId: string; now: number; plan: PlanOptions; requestId?: string | null },
): MergeSummary | null {
  const { guestId: g, accountId: u, now } = input;
  const guest = getUser(db, g);
  const account = getUser(db, u);
  if (!guest || !account || guest.email !== null || account.email === null || g === u) {
    throw new Error('mergeGuestIntoAccount: needs a guest and a different account');
  }

  const storeSubscriptions = run(db, 'UPDATE store_subscriptions SET user_id = ?, updated_at = ? WHERE user_id = ?', u, now, g).changes;
  const grants = run(db, 'UPDATE grants SET user_id = ?, updated_at = ? WHERE user_id = ?', u, now, g).changes;

  let promoRedemptions = 0;
  const redemptions = many<{ id: number; promo_code_id: number; grant_id: number | null }>(
    db, 'SELECT id, promo_code_id, grant_id FROM promo_redemptions WHERE user_id = ? ORDER BY id', g,
  );
  for (const r of redemptions) {
    const duplicate = one(db, 'SELECT 1 AS x FROM promo_redemptions WHERE user_id = ? AND promo_code_id = ?', u, r.promo_code_id);
    if (duplicate) {
      if (r.grant_id !== null) {
        run(
          db,
          `UPDATE grants SET revoked_at = ?, revoked_by = NULL, revoke_reason = 'Duplicate promo code after account merge', updated_at = ?
           WHERE id = ? AND revoked_at IS NULL`,
          now, now, r.grant_id,
        );
      }
      run(db, 'DELETE FROM promo_redemptions WHERE id = ?', r.id);
    } else {
      run(db, 'UPDATE promo_redemptions SET user_id = ? WHERE id = ?', u, r.id);
      promoRedemptions++;
    }
  }

  run(db, 'UPDATE notes SET user_id = ? WHERE user_id = ?', u, g);
  run(db, 'UPDATE devices SET user_id = ? WHERE user_id = ?', u, g);
  run(db, 'UPDATE webhook_events SET user_id = ? WHERE user_id = ?', u, g);
  run(db, 'DELETE FROM sessions WHERE user_id = ?', g);

  run(
    db,
    `UPDATE users SET status = 'merged', merged_into = ?, plan = 'free', plan_source = NULL, plan_until = NULL,
       plan_will_renew = 0, plan_trial = 0, plan_ref = NULL, updated_at = ?
     WHERE id = ?`,
    u, now, g,
  );
  run(db, 'UPDATE users SET merged_into = ?, updated_at = ? WHERE merged_into = ?', u, now, g);

  recomputePlan(db, u, now, input.plan);
  const summary: MergeSummary = { fromPublicId: guest.public_id, grants, storeSubscriptions, promoRedemptions };
  writeAudit(db, {
    at: now,
    actor: SYSTEM_ACTOR,
    action: 'user.merge',
    target: { type: 'user', id: u, userId: u, label: account.public_id },
    details: summary,
    requestId: input.requestId ?? null,
  });
  return grants + storeSubscriptions + promoRedemptions > 0 ? summary : null;
}

export type DeleteResult = {
  publicId: string;
  hadStoreSubscription: boolean;
  /** RevenueCat app user ids to delete after the commit: the user and the guests merged into it. */
  subscriberIds: string[];
};

/**
 * deleteUser (4.10), one transaction: delete webhook events of the user and its merged guests,
 * scrub their audit details, delete the user row (cascading to sessions, devices, grants, store
 * subscriptions, redemptions, notes, reset tokens and merged guests), then audit `user.delete`.
 * Promo capacity is not freed: redemption_count keeps counting deleted users.
 */
export function deleteUser(
  db: Db,
  userId: string,
  input: { by: 'self' | 'admin'; reason?: string; actor: AuditActor; now: number; ip?: string | null; requestId?: string | null },
): DeleteResult {
  const user = getUser(db, userId);
  if (!user) throw new Error('deleteUser: unknown user');
  const merged = many<{ id: string }>(db, 'SELECT id FROM users WHERE merged_into = ?', userId).map((r) => r.id);
  const ids = [userId, ...merged];
  const hadStoreSubscription = many<StoreSubscriptionRow>(
    db, `SELECT * FROM store_subscriptions WHERE user_id = ? AND status NOT IN ('expired', 'refunded')`, userId,
  ).some((s) => storeEnd(s) > input.now);

  const list = placeholders(ids.length);
  run(db, `DELETE FROM webhook_events WHERE user_id IN (${list}) OR app_user_id IN (${list})`, ...ids, ...ids);
  scrubAuditForUsers(db, ids);
  run(db, 'DELETE FROM users WHERE id = ?', userId);

  const details: Record<string, unknown> = { by: input.by, hadStoreSubscription };
  if (input.reason) details.reason = input.reason;
  writeAudit(db, {
    at: input.now,
    actor: input.actor,
    action: 'user.delete',
    target: { type: 'user', id: userId, userId, label: user.public_id },
    details,
    ip: input.ip ?? null,
    requestId: input.requestId ?? null,
  });
  return { publicId: user.public_id, hadStoreSubscription, subscriberIds: ids };
}
