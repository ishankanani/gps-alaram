/**
 * Admin bootstrap at start (spec 6.4):
 * - ADMIN_EMAIL + ADMIN_PASSWORD: no account yet → create it as admin and audit
 *   admin.bootstrap {created: true}; the account exists → make sure role = admin (audited only
 *   when it changed). The password is never touched unless ADMIN_PASSWORD_RESET=true.
 * - ADMIN_EMAIL alone only promotes an existing account.
 * In production the password must pass the admin policy (at least 12 characters).
 */
import type { Config } from '../config.ts';
import { run, tx, type Db } from '../db/database.ts';
import type { Logger } from '../log.ts';
import { maskEmail } from '../log.ts';
import { ENV_ACTOR, writeAudit } from './audit.ts';
import { passwordPolicyError, type PasswordHasher } from './passwords.ts';
import { createAccount, getUserByEmail } from './users.ts';

export type BootstrapResult = 'none' | 'created' | 'promoted' | 'unchanged' | 'missing';

export async function bootstrapAdmin(
  deps: { db: Db; config: Pick<Config, 'adminEmail' | 'adminPassword' | 'adminPasswordReset' | 'production'>; hasher: PasswordHasher; log: Logger; now: () => number },
): Promise<BootstrapResult> {
  const { db, config, log } = deps;
  const email = config.adminEmail;
  if (!email) return 'none';
  const password = config.adminPassword;
  if (password) {
    const policy = passwordPolicyError(password, email, { admin: true });
    if (policy) {
      if (config.production) throw new Error(`ADMIN_PASSWORD is not acceptable for an admin (${policy}); use at least 12 characters`);
      log.warn('ADMIN_PASSWORD would be refused in production', { problem: policy });
    }
  }
  const existing = getUserByEmail(db, email);
  if (!existing && !password) {
    log.warn('ADMIN_EMAIL has no account yet and ADMIN_PASSWORD is not set; nothing to promote', { email: maskEmail(email) });
    return 'missing';
  }
  const newHash = password && (!existing || config.adminPasswordReset) ? await deps.hasher.hash(password) : null;
  const now = deps.now();
  return tx(db, (): BootstrapResult => {
    const current = getUserByEmail(db, email);
    if (!current) {
      const u = createAccount(db, { email, passwordHash: newHash!, role: 'admin', now });
      writeAudit(db, { at: now, actor: ENV_ACTOR, action: 'admin.bootstrap', target: { type: 'user', id: u.id, userId: u.id, label: u.public_id }, details: { created: true } });
      log.info('bootstrap admin created', { email: maskEmail(email), publicId: u.public_id });
      return 'created';
    }
    if (current.status === 'merged') throw new Error('ADMIN_EMAIL belongs to a merged account');
    let result: BootstrapResult = 'unchanged';
    if (current.role !== 'admin') {
      run(db, "UPDATE users SET role = 'admin', updated_at = ? WHERE id = ?", now, current.id);
      writeAudit(db, {
        at: now, actor: ENV_ACTOR, action: 'admin.bootstrap', target: { type: 'user', id: current.id, userId: current.id, label: current.public_id },
        details: { created: false },
      });
      log.info('bootstrap admin promoted', { email: maskEmail(email), publicId: current.public_id });
      result = 'promoted';
    }
    if (newHash && config.adminPasswordReset) {
      run(db, 'UPDATE users SET password_hash = ?, password_changed_at = ?, updated_at = ? WHERE id = ?', newHash, now, now, current.id);
      log.warn('ADMIN_PASSWORD_RESET: the bootstrap admin password was replaced; unset ADMIN_PASSWORD_RESET now', { publicId: current.public_id });
    }
    if (current.status === 'disabled') log.warn('the bootstrap admin account is disabled', { publicId: current.public_id });
    return result;
  });
}
