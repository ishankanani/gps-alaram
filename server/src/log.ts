/**
 * JSON-lines logger on stdout (spec 4.8): { t, lvl, msg, ...fields }.
 *
 * Logs never contain tokens, passwords, codes, request bodies or webhook payloads, and emails are
 * masked as l***@example.com. Callers are responsible for not passing secrets; as defence in depth
 * the logger also redacts fields with secret-looking names, masks email fields and any email
 * address or session token that appears inside a string.
 */
import { iso, systemClock, type Clock } from './clock.ts';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';
export const LOG_LEVELS: readonly LogLevel[] = ['debug', 'info', 'warn', 'error', 'silent'];
const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

export type LogFields = Record<string, unknown>;
export type Logger = {
  readonly level: LogLevel;
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
};
export type LogSink = (line: string) => void;

const stdoutSink: LogSink = (line) => {
  process.stdout.write(`${line}\n`);
};

/** "lena.weber@example.com" → "l***@example.com". Anything that is not an email becomes "***". */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 0) return '***';
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const first = [...local][0] ?? '';
  return `${first}***@${domain}`;
}

const EMAIL_IN_TEXT = /[^\s@<>"'(),;:]+@[^\s@<>"'(),;:]+\.[^\s@<>"'(),;:]+/g;
const TOKEN_IN_TEXT = /sw_[A-Za-z0-9_-]{43}/g;

/** Masks every email address and session token inside free text. */
export function scrubText(text: string): string {
  return text.replace(TOKEN_IN_TEXT, 'sw_[redacted]').replace(EMAIL_IN_TEXT, (m) => maskEmail(m));
}

const SECRET_KEYS = new Set([
  'password', 'newpassword', 'currentpassword', 'passwordhash', 'password_hash', 'token', 'tokenhash',
  'token_hash', 'authorization', 'cookie', 'secret', 'apikey', 'api_key', 'code', 'resetcode', 'codehash',
  'code_hash', 'installid', 'install_id', 'installidhash', 'install_id_hash', 'body', 'payload', 'smtpurl',
]);

function sanitize(value: unknown, key: string | null, depth: number): unknown {
  if (key !== null) {
    const k = key.toLowerCase();
    if (SECRET_KEYS.has(k)) return '[redacted]';
    if ((k === 'email' || k.endsWith('email')) && typeof value === 'string') return maskEmail(value);
  }
  if (typeof value === 'string') return scrubText(value);
  if (value instanceof Error) {
    return { name: value.name, message: scrubText(value.message), stack: value.stack ? scrubText(value.stack) : undefined };
  }
  if (value === null || typeof value !== 'object') return value;
  if (depth > 4) return '[…]';
  if (Array.isArray(value)) return value.map((v) => sanitize(v, null, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) out[k] = sanitize(v, k, depth + 1);
  return out;
}

export function createLogger(opts: { level?: LogLevel; sink?: LogSink; clock?: Clock } = {}): Logger {
  const level = opts.level ?? 'info';
  const sink = opts.sink ?? stdoutSink;
  const clock = opts.clock ?? systemClock;
  const write = (lvl: Exclude<LogLevel, 'silent'>, msg: string, fields?: LogFields): void => {
    if (ORDER[lvl] < ORDER[level]) return;
    const clean = fields ? (sanitize(fields, null, 0) as LogFields) : {};
    // Fixed keys first and never overwritten by fields.
    const line: LogFields = { t: iso(clock.now()), lvl, msg: scrubText(msg) };
    for (const [k, v] of Object.entries(clean)) if (!(k in line) && v !== undefined) line[k] = v;
    let text: string;
    try {
      text = JSON.stringify(line);
    } catch {
      text = JSON.stringify({ t: line.t, lvl, msg: line.msg, logError: 'unserializable fields' });
    }
    sink(text);
  };
  return {
    level,
    debug: (msg, fields) => write('debug', msg, fields),
    info: (msg, fields) => write('info', msg, fields),
    warn: (msg, fields) => write('warn', msg, fields),
    error: (msg, fields) => write('error', msg, fields),
  };
}
