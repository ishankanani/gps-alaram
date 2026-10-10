/**
 * Minimal SMTP client (spec 6.6), node:net / node:tls only.
 *
 * 1. Connect (TLS for smtps:) and read the 220 greeting. 2. EHLO <PUBLIC_URL host>; upgrade with
 * STARTTLS when advertised, then EHLO again. 3. AUTH PLAIN. 4. MAIL FROM, RCPT TO, DATA.
 * 5. Headers incl. an RFC 2047 UTF-8 subject; the body is base64 in 76-character lines (no
 * dot-stuffing needed). 6. QUIT. 15 s timeouts; any reply other than 2xx/3xx is an error.
 *
 * Without TLS the client refuses to continue on port 587 (spec), and also whenever it would send
 * credentials to a host that is not loopback (stricter than the spec: no plaintext passwords).
 */
import { randomBytes } from 'node:crypto';
import { connect as netConnect, type Socket } from 'node:net';
import { connect as tlsConnect, type ConnectionOptions, type TLSSocket } from 'node:tls';

import type { MailTransport } from './mailer.ts';

export type SmtpOptions = {
  url: string;
  /** EHLO name: the PUBLIC_URL host. */
  heloHost: string;
  timeoutMs?: number;
  /** Extra TLS options (tests pass a CA). */
  tls?: ConnectionOptions;
};

export class SmtpError extends Error {
  readonly replyCode: number | null;
  constructor(message: string, replyCode: number | null = null) {
    super(message);
    this.name = 'SmtpError';
    this.replyCode = replyCode;
  }
}

type Reply = { code: number; lines: string[] };

/** Reads SMTP replies (multi-line `250-…` up to `250 …`) from a socket. */
class ReplyReader {
  private buffer = '';
  private readonly replies: Reply[] = [];
  private current: string[] = [];
  private waiter: { resolve: (r: Reply) => void; reject: (e: Error) => void } | null = null;
  private failure: Error | null = null;
  private socket: Socket | TLSSocket;
  private readonly onData = (chunk: Buffer): void => this.push(chunk.toString('utf8'));
  private readonly onError = (err: Error): void => this.fail(err);
  private readonly onClose = (): void => this.fail(new SmtpError('Connection closed by the server'));

  constructor(socket: Socket | TLSSocket) {
    this.socket = socket;
    this.attach(socket);
  }

  attach(socket: Socket | TLSSocket): void {
    this.socket.off('data', this.onData).off('error', this.onError).off('close', this.onClose);
    this.socket = socket;
    socket.on('data', this.onData).on('error', this.onError).on('close', this.onClose);
  }

  detach(): void {
    this.socket.off('data', this.onData).off('error', this.onError).off('close', this.onClose);
  }

  private push(text: string): void {
    this.buffer += text;
    if (this.buffer.length > 64 * 1024) {
      this.fail(new SmtpError('Reply too long'));
      return;
    }
    let i: number;
    while ((i = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, i).replace(/\r$/, '');
      this.buffer = this.buffer.slice(i + 1);
      const m = /^(\d{3})([ -])(.*)$/.exec(line);
      if (!m) {
        this.fail(new SmtpError('Malformed reply from the server'));
        return;
      }
      this.current.push(m[3] ?? '');
      if (m[2] === ' ') {
        this.replies.push({ code: Number(m[1]), lines: this.current });
        this.current = [];
      }
    }
    this.flush();
  }

  private flush(): void {
    if (this.waiter && this.replies.length > 0) {
      const w = this.waiter;
      this.waiter = null;
      w.resolve(this.replies.shift()!);
    }
  }

  private fail(err: Error): void {
    if (this.failure) return;
    this.failure = err;
    if (this.waiter) {
      const w = this.waiter;
      this.waiter = null;
      w.reject(err);
    }
  }

  next(): Promise<Reply> {
    if (this.replies.length > 0) return Promise.resolve(this.replies.shift()!);
    if (this.failure) return Promise.reject(this.failure);
    return new Promise((resolve, reject) => {
      this.waiter = { resolve, reject };
    });
  }
}

const isLoopback = (host: string): boolean => host === 'localhost' || host === '::1' || host === '[::1]' || /^127\./.test(host);

/** `StopWake <no-reply@example.com>` → `no-reply@example.com`. */
export function addressOf(mailbox: string): string {
  const m = /<([^<>\s]+@[^<>\s]+)>\s*$/.exec(mailbox);
  return (m?.[1] ?? mailbox).trim();
}

/** RFC 2047 encoded words (UTF-8, base64), ≤ 75 characters each, folded with CRLF SP. */
export function encodeHeaderWord(value: string): string {
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  const words: string[] = [];
  let chunk = '';
  for (const ch of value) {
    if (Buffer.byteLength(chunk + ch) > 45) {
      words.push(chunk);
      chunk = '';
    }
    chunk += ch;
  }
  if (chunk) words.push(chunk);
  return words.map((w) => `=?UTF-8?B?${Buffer.from(w, 'utf8').toString('base64')}?=`).join('\r\n ');
}

function encodeMailbox(mailbox: string): string {
  const m = /^(.*?)\s*<([^<>]+)>\s*$/.exec(mailbox);
  if (!m) return mailbox;
  const name = (m[1] ?? '').replace(/^"|"$/g, '');
  if (!name) return `<${m[2]}>`;
  return /^[\x20-\x7E]*$/.test(name) ? `"${name.replace(/["\\]/g, '')}" <${m[2]}>` : `${encodeHeaderWord(name)} <${m[2]}>`;
}

/** The full message (headers + base64 body), CRLF line endings, without the terminating dot. */
export function buildMessage(input: { from: string; to: string; subject: string; text: string; date?: Date; messageIdHost?: string }): string {
  const date = (input.date ?? new Date()).toUTCString().replace(/GMT$/, '+0000');
  const host = input.messageIdHost ?? (addressOf(input.from).split('@')[1] || 'localhost');
  const body = (Buffer.from(input.text.replace(/\r?\n/g, '\r\n'), 'utf8').toString('base64').match(/.{1,76}/g) ?? []).join('\r\n');
  return [
    `From: ${encodeMailbox(input.from)}`,
    `To: <${input.to}>`,
    `Subject: ${encodeHeaderWord(input.subject)}`,
    `Date: ${date}`,
    `Message-ID: <${randomBytes(16).toString('hex')}@${host}>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    body,
  ].join('\r\n');
}

function assertSafe(value: string, what: string): void {
  if (/[\r\n<>\s]/.test(value) || !value.includes('@')) throw new SmtpError(`Invalid ${what} address`);
}

export async function sendMail(opts: SmtpOptions, msg: { from: string; to: string; subject: string; text: string }): Promise<void> {
  const url = new URL(opts.url);
  const implicitTls = url.protocol === 'smtps:';
  if (!implicitTls && url.protocol !== 'smtp:') throw new SmtpError('SMTP_URL must use smtp: or smtps:');
  const host = url.hostname;
  const port = url.port ? Number(url.port) : implicitTls ? 465 : 587;
  const user = decodeURIComponent(url.username);
  const pass = decodeURIComponent(url.password);
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const fromAddr = addressOf(msg.from);
  assertSafe(fromAddr, 'sender');
  assertSafe(msg.to, 'recipient');

  let socket: Socket | TLSSocket = await new Promise<Socket | TLSSocket>((resolve, reject) => {
    const s = implicitTls
      ? tlsConnect({ host, port, servername: host, ...opts.tls }, () => resolve(s))
      : netConnect({ host, port }, () => resolve(s));
    s.once('error', reject);
    s.setTimeout(timeoutMs, () => s.destroy(new SmtpError('SMTP timeout')));
  });
  let secure = implicitTls;
  const reader = new ReplyReader(socket);

  const expect = async (ok: (code: number) => boolean, what: string): Promise<Reply> => {
    const r = await reader.next();
    if (!ok(r.code) || r.code >= 400) throw new SmtpError(`SMTP ${what} failed: ${r.code} ${r.lines.join(' ').slice(0, 200)}`, r.code);
    return r;
  };
  const send = (line: string): void => {
    socket.write(`${line}\r\n`);
  };
  const is2xx = (c: number): boolean => c >= 200 && c < 300;

  try {
    await expect((c) => c === 220, 'greeting');
    send(`EHLO ${opts.heloHost}`);
    let ehlo = await expect(is2xx, 'EHLO');
    const has = (r: Reply, ext: string): boolean => r.lines.slice(1).some((l) => l.toUpperCase().split(' ')[0] === ext);

    if (!secure && has(ehlo, 'STARTTLS')) {
      send('STARTTLS');
      await expect((c) => c === 220, 'STARTTLS');
      reader.detach();
      const plain = socket;
      socket = await new Promise<TLSSocket>((resolve, reject) => {
        const t = tlsConnect({ socket: plain, servername: host, ...opts.tls }, () => resolve(t));
        t.once('error', reject);
        t.setTimeout(timeoutMs, () => t.destroy(new SmtpError('SMTP timeout')));
      });
      reader.attach(socket);
      secure = true;
      send(`EHLO ${opts.heloHost}`);
      ehlo = await expect(is2xx, 'EHLO');
    }
    if (!secure && (port === 587 || (user && !isLoopback(host)))) {
      throw new SmtpError('The SMTP server does not offer STARTTLS; refusing to continue without TLS');
    }
    if (user) {
      send(`AUTH PLAIN ${Buffer.from(`\u0000${user}\u0000${pass}`, 'utf8').toString('base64')}`);
      await expect(is2xx, 'AUTH');
    }
    send(`MAIL FROM:<${fromAddr}>`);
    await expect(is2xx, 'MAIL FROM');
    send(`RCPT TO:<${msg.to}>`);
    await expect(is2xx, 'RCPT TO');
    send('DATA');
    await expect((c) => c === 354, 'DATA');
    socket.write(`${buildMessage({ ...msg, messageIdHost: fromAddr.split('@')[1] })}\r\n.\r\n`);
    await expect(is2xx, 'message');
    send('QUIT');
    await reader.next().catch(() => undefined);
  } finally {
    reader.detach();
    socket.destroy();
  }
}

export function createSmtpTransport(opts: SmtpOptions): MailTransport {
  return (msg) => sendMail(opts, msg);
}
