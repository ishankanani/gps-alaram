/**
 * Environment configuration (spec 6.2): parsing, defaults, production checks and a redacted
 * summary for the startup log. Secrets come only from the environment and never leave this
 * object except where they are used (4.8).
 */
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { LOG_LEVELS, maskEmail, type LogLevel } from './log.ts';

export type MailMode = 'smtp' | 'log' | 'off' | 'memory';

export type Config = {
  nodeEnv: string;
  production: boolean;
  host: string;
  port: number;
  dataDir: string;
  databasePath: string;
  backups: boolean;
  backupDir: string;
  backupHourUtc: number;
  backupKeepDaily: number;
  backupKeepWeekly: number;
  /** No trailing slash, e.g. https://api.example.com */
  publicUrl: string;
  publicUrlIsHttps: boolean;
  allowHttp: boolean;
  trustProxy: number;
  adminEmail: string | null;
  adminPassword: string | null;
  adminPasswordReset: boolean;
  revenuecatWebhookSecret: string | null;
  revenuecatWebhookSecretPrevious: string | null;
  revenuecatApiKey: string | null;
  revenuecatEntitlement: string;
  storeSandboxGrantsPro: boolean;
  appPackage: string;
  /** Default of the setting support.email. */
  supportEmail: string;
  mailMode: MailMode;
  smtpUrl: string | null;
  mailFrom: string;
  sessionDays: number;
  adminSessionDays: number;
  scryptN: number;
  scryptP: number;
  rateLimits: boolean;
  logLevel: LogLevel;
  gitCommit: string | null;
  /** Non-fatal findings for the startup log. */
  warnings: string[];
};

export class ConfigError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(`Invalid configuration:\n- ${problems.join('\n- ')}`);
    this.name = 'ConfigError';
    this.problems = problems;
  }
}

type Env = Readonly<Record<string, string | undefined>>;

/** server/data, independent of the working directory. */
export const DEFAULT_DATA_DIR = fileURLToPath(new URL('../data', import.meta.url));

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;
const PACKAGE_RE = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/;

export function loadConfig(env: Env = process.env, opts: { cwd?: string } = {}): Config {
  const problems: string[] = [];
  const warnings: string[] = [];
  const cwd = opts.cwd ?? process.cwd();

  /** Trimmed value, or undefined when unset or blank. */
  const str = (name: string): string | undefined => {
    const v = env[name]?.trim();
    return v ? v : undefined;
  };
  /** Raw value (secrets and passwords are never trimmed), or undefined when unset or empty. */
  const raw = (name: string): string | undefined => {
    const v = env[name];
    return v === undefined || v === '' ? undefined : v;
  };
  const int = (name: string, def: number, min: number, max: number): number => {
    const v = str(name);
    if (v === undefined) return def;
    if (!/^\d+$/.test(v) || Number(v) < min || Number(v) > max) {
      problems.push(`${name} must be an integer between ${min} and ${max}`);
      return def;
    }
    return Number(v);
  };
  const bool = (name: string, def: boolean): boolean => {
    const v = str(name)?.toLowerCase();
    if (v === undefined) return def;
    if (['true', '1', 'yes', 'on'].includes(v)) return true;
    if (['false', '0', 'no', 'off'].includes(v)) return false;
    problems.push(`${name} must be true or false`);
    return def;
  };
  const pathFrom = (v: string): string => (isAbsolute(v) ? v : resolve(cwd, v));

  const nodeEnv = str('NODE_ENV') ?? 'development';
  const production = nodeEnv === 'production';

  const host = str('HOST') ?? '127.0.0.1';
  const port = int('PORT', 8787, 0, 65535);

  const dataDirEnv = str('DATA_DIR');
  const dataDir = dataDirEnv ? pathFrom(dataDirEnv) : DEFAULT_DATA_DIR;
  const dbEnv = str('DATABASE_PATH');
  const databasePath = dbEnv === ':memory:' ? ':memory:' : dbEnv ? pathFrom(dbEnv) : join(dataDir, 'stopwake.db');

  const backups = bool('BACKUPS', production);
  const backupDirEnv = str('BACKUP_DIR');
  const backupDir = backupDirEnv ? pathFrom(backupDirEnv) : join(dataDir, 'backups');
  const backupHourUtc = int('BACKUP_HOUR_UTC', 3, 0, 23);
  const backupKeepDaily = int('BACKUP_KEEP_DAILY', 14, 1, 1000);
  const backupKeepWeekly = int('BACKUP_KEEP_WEEKLY', 8, 0, 1000);

  const allowHttp = bool('ALLOW_HTTP', false);
  let publicUrl = `http://localhost:${port}`;
  const publicUrlEnv = str('PUBLIC_URL');
  if (publicUrlEnv) {
    let parsed: URL | null = null;
    try {
      parsed = new URL(publicUrlEnv);
    } catch {
      problems.push('PUBLIC_URL must be an absolute URL');
    }
    if (parsed) {
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') problems.push('PUBLIC_URL must be http(s)');
      else if (parsed.username || parsed.password || parsed.search || parsed.hash) {
        problems.push('PUBLIC_URL must not contain credentials, a query or a fragment');
      } else publicUrl = `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`;
    }
  }
  const publicUrlIsHttps = publicUrl.startsWith('https://');
  if (production && !publicUrlIsHttps && !allowHttp) {
    problems.push('PUBLIC_URL must be https:// in production (ALLOW_HTTP=true is only for the CI smoke test)');
  }

  const trustProxy = int('TRUST_PROXY', 0, 0, 10);

  let adminEmail: string | null = null;
  const adminEmailEnv = str('ADMIN_EMAIL');
  if (adminEmailEnv) {
    const e = adminEmailEnv.normalize('NFC').toLowerCase();
    if (e.length > 254 || !EMAIL_RE.test(e)) problems.push('ADMIN_EMAIL is not a valid email address');
    else adminEmail = e;
  }
  const adminPassword = raw('ADMIN_PASSWORD') ?? null;
  const adminPasswordReset = bool('ADMIN_PASSWORD_RESET', false);
  if (adminPassword && !adminEmail && !adminEmailEnv) warnings.push('ADMIN_PASSWORD is set without ADMIN_EMAIL; it is ignored');

  const revenuecatWebhookSecret = raw('REVENUECAT_WEBHOOK_SECRET') ?? null;
  const revenuecatWebhookSecretPrevious = raw('REVENUECAT_WEBHOOK_SECRET_PREVIOUS') ?? null;
  if (!revenuecatWebhookSecret) {
    warnings.push('REVENUECAT_WEBHOOK_SECRET is not set; POST /v1/webhooks/revenuecat answers 503');
  } else if (production && revenuecatWebhookSecret.length < 16) {
    warnings.push('REVENUECAT_WEBHOOK_SECRET is short; use at least 32 random characters (openssl rand -hex 32)');
  }
  const revenuecatApiKey = raw('REVENUECAT_API_KEY') ?? null;
  const revenuecatEntitlement = str('REVENUECAT_ENTITLEMENT') ?? 'pro';
  const storeSandboxGrantsPro = bool('STORE_SANDBOX_GRANTS_PRO', true);

  const appPackage = str('APP_PACKAGE') ?? 'com.ishankanani.gpsalarm';
  if (!PACKAGE_RE.test(appPackage)) problems.push('APP_PACKAGE is not a valid application id');

  const supportEnv = str('SUPPORT_EMAIL');
  let supportEmail = 'support@example.com';
  if (supportEnv) {
    const e = supportEnv.toLowerCase();
    if (e.length > 254 || !EMAIL_RE.test(e)) problems.push('SUPPORT_EMAIL is not a valid email address');
    else supportEmail = e;
  } else if (production) {
    warnings.push('SUPPORT_EMAIL is not set; support@example.com is shown to users');
  }

  const smtpUrl = raw('SMTP_URL') ?? null;
  const mailModeEnv = str('MAIL_MODE')?.toLowerCase();
  let mailMode: MailMode = smtpUrl ? 'smtp' : 'off';
  if (mailModeEnv) {
    if (mailModeEnv === 'smtp' || mailModeEnv === 'log' || mailModeEnv === 'off' || mailModeEnv === 'memory') {
      mailMode = mailModeEnv;
    } else problems.push('MAIL_MODE must be smtp, log, off or memory');
  }
  if (mailMode === 'smtp') {
    if (!smtpUrl) problems.push('MAIL_MODE=smtp needs SMTP_URL');
    else {
      try {
        const u = new URL(smtpUrl);
        if (u.protocol !== 'smtp:' && u.protocol !== 'smtps:') problems.push('SMTP_URL must start with smtp:// or smtps://');
        if (!u.hostname) problems.push('SMTP_URL needs a host');
      } catch {
        problems.push('SMTP_URL is not a valid URL');
      }
    }
    if (!str('MAIL_FROM')) problems.push('MAIL_FROM is required with MAIL_MODE=smtp');
  }
  if (production && mailMode === 'log') warnings.push('MAIL_MODE=log writes mails (including reset codes) to the outbox folder');
  if (production && mailMode === 'memory') warnings.push('MAIL_MODE=memory keeps mails in memory only; nothing is sent');
  const mailFrom = str('MAIL_FROM') ?? 'StopWake <no-reply@localhost>';
  // A header value: CR/LF would allow header injection.
  if (/[\r\n]/.test(mailFrom) || !/[^\s@<>]+@[^\s@<>]+/.test(mailFrom)) problems.push('MAIL_FROM must be an address like "StopWake <no-reply@example.com>"');

  const sessionDays = int('SESSION_DAYS', 180, 1, 3650);
  const adminSessionDays = int('ADMIN_SESSION_DAYS', 30, 1, 365);

  const scryptN = int('SCRYPT_N', 32768, 2, 65536);
  if ((scryptN & (scryptN - 1)) !== 0) problems.push('SCRYPT_N must be a power of two');
  if (production && scryptN < 16384) problems.push('SCRYPT_N below 16384 is refused in production');
  const scryptP = int('SCRYPT_P', 3, 1, 16);

  const rateLimits = bool('RATE_LIMITS', true);
  if (production && !rateLimits) problems.push('RATE_LIMITS=off is refused in production');

  const logLevelEnv = str('LOG_LEVEL')?.toLowerCase() ?? 'info';
  let logLevel: LogLevel = 'info';
  if ((LOG_LEVELS as readonly string[]).includes(logLevelEnv)) logLevel = logLevelEnv as LogLevel;
  else problems.push(`LOG_LEVEL must be one of ${LOG_LEVELS.join(', ')}`);

  const gitCommitEnv = str('GIT_COMMIT');
  const gitCommit = gitCommitEnv && /^[0-9A-Za-z._-]{1,64}$/.test(gitCommitEnv) ? gitCommitEnv : null;

  if (problems.length > 0) throw new ConfigError(problems);

  return {
    nodeEnv, production, host, port, dataDir, databasePath,
    backups, backupDir, backupHourUtc, backupKeepDaily, backupKeepWeekly,
    publicUrl, publicUrlIsHttps, allowHttp, trustProxy,
    adminEmail, adminPassword, adminPasswordReset,
    revenuecatWebhookSecret, revenuecatWebhookSecretPrevious, revenuecatApiKey, revenuecatEntitlement,
    storeSandboxGrantsPro, appPackage, supportEmail,
    mailMode, smtpUrl, mailFrom,
    sessionDays, adminSessionDays, scryptN, scryptP, rateLimits, logLevel, gitCommit,
    warnings,
  };
}

/** The configuration for the startup log: secrets replaced, emails masked. */
export function redactedSummary(config: Config): Record<string, unknown> {
  let smtp: string | null = null;
  if (config.smtpUrl) {
    try {
      const u = new URL(config.smtpUrl);
      smtp = `${u.protocol}//${u.username ? '***@' : ''}${u.host}`;
    } catch {
      smtp = '[invalid]';
    }
  }
  const set = (v: string | null): string | null => (v ? '[set]' : null);
  return {
    nodeEnv: config.nodeEnv,
    host: config.host,
    port: config.port,
    dataDir: config.dataDir,
    databasePath: config.databasePath,
    backups: config.backups,
    backupDir: config.backupDir,
    backupHourUtc: config.backupHourUtc,
    publicUrl: config.publicUrl,
    allowHttp: config.allowHttp,
    trustProxy: config.trustProxy,
    adminEmail: config.adminEmail ? maskEmail(config.adminEmail) : null,
    adminPassword: set(config.adminPassword),
    adminPasswordReset: config.adminPasswordReset,
    revenuecatWebhookSecret: set(config.revenuecatWebhookSecret),
    revenuecatWebhookSecretPrevious: set(config.revenuecatWebhookSecretPrevious),
    revenuecatApiKey: set(config.revenuecatApiKey),
    revenuecatEntitlement: config.revenuecatEntitlement,
    storeSandboxGrantsPro: config.storeSandboxGrantsPro,
    appPackage: config.appPackage,
    supportEmail: maskEmail(config.supportEmail),
    mailMode: config.mailMode,
    smtp,
    sessionDays: config.sessionDays,
    adminSessionDays: config.adminSessionDays,
    scryptN: config.scryptN,
    scryptP: config.scryptP,
    rateLimits: config.rateLimits,
    logLevel: config.logLevel,
    gitCommit: config.gitCommit,
  };
}
