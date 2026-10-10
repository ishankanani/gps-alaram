/**
 * Outgoing mail (spec 6.6). Requests never wait for delivery: queue() returns immediately.
 *
 * Modes: smtp (send, 3 retries after 1, 5 and 15 minutes), log (write
 * ${DATA_DIR}/outbox/<ts>-<kind>.json; for CI and local runs), off (nothing is sent; forgot-password
 * answers 503), memory (tests read `sent`).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { ApiLang } from '../../../src/api/types.ts';
import type { MailMode } from '../config.ts';
import { iso, MINUTE, type Clock } from '../clock.ts';
import { maskEmail, type Logger } from '../log.ts';
import { renderMail, type MailKind, type MailVars } from './templates.ts';

export type OutgoingMail = {
  kind: MailKind;
  to: string;
  lang: ApiLang | null;
  subject: string;
  text: string;
  queuedAt: number;
};

/** Delivers one message; rejects on any failure. */
export type MailTransport = (msg: { from: string; to: string; subject: string; text: string }) => Promise<void>;

export type Mailer = {
  readonly mode: MailMode;
  /** Mail can reach people (smtp or log): RemoteConfig auth.passwordReset. */
  readonly delivers: boolean;
  queue(input: { kind: MailKind; to: string; lang: ApiLang | null; vars: MailVars }): void;
  /** memory mode: every queued message, oldest first. */
  readonly sent: OutgoingMail[];
  /** Resolves when no delivery attempt is in flight (tests, shutdown). */
  idle(): Promise<void>;
  /** Cancels scheduled retries. */
  close(): void;
};

export function createMailer(opts: {
  mode: MailMode;
  from: string;
  outboxDir?: string;
  transport?: MailTransport;
  log: Logger;
  clock: Clock;
  retryDelaysMs?: readonly number[];
}): Mailer {
  const { mode, log, clock } = opts;
  const retryDelays = opts.retryDelaysMs ?? [1 * MINUTE, 5 * MINUTE, 15 * MINUTE];
  const sent: OutgoingMail[] = [];
  const inFlight = new Set<Promise<void>>();
  const timers = new Set<NodeJS.Timeout>();
  let closed = false;
  let lastStamp = '';
  let stampSeq = 0;

  if (mode === 'smtp' && !opts.transport) throw new Error('MAIL_MODE=smtp needs an SMTP transport');

  const track = (p: Promise<void>): void => {
    inFlight.add(p);
    void p.finally(() => inFlight.delete(p));
  };

  const deliver = (mail: OutgoingMail, attempt: number): void => {
    if (closed) return;
    const p = opts.transport!({ from: opts.from, to: mail.to, subject: mail.subject, text: mail.text }).then(
      () => log.info('mail sent', { kind: mail.kind, to: maskEmail(mail.to), attempt: attempt + 1 }),
      (err: unknown) => {
        const delay = retryDelays[attempt];
        if (delay === undefined || closed) {
          log.error('mail failed', { kind: mail.kind, to: maskEmail(mail.to), attempts: attempt + 1, error: (err as Error).message });
          return;
        }
        log.warn('mail failed, will retry', { kind: mail.kind, to: maskEmail(mail.to), attempt: attempt + 1, error: (err as Error).message });
        const timer = setTimeout(() => {
          timers.delete(timer);
          deliver(mail, attempt + 1);
        }, delay);
        timer.unref();
        timers.add(timer);
      },
    );
    track(p);
  };

  const writeOutbox = (mail: OutgoingMail): void => {
    const dir = opts.outboxDir;
    if (!dir) return;
    let stamp = iso(mail.queuedAt).replace(/:/g, '');
    if (stamp === lastStamp) stamp = `${stamp}-${++stampSeq}`;
    else {
      lastStamp = stamp;
      stampSeq = 0;
    }
    const file = join(dir, `${stamp}-${mail.kind}.json`);
    const p = mkdir(dir, { recursive: true })
      .then(() => writeFile(file, `${JSON.stringify({ ...mail, from: opts.from, queuedAt: iso(mail.queuedAt) }, null, 2)}\n`, { mode: 0o600 }))
      .then(
        () => log.info('mail written to outbox', { kind: mail.kind, to: maskEmail(mail.to) }),
        (err: unknown) => log.error('mail outbox write failed', { kind: mail.kind, error: (err as Error).message }),
      );
    track(p);
  };

  return {
    mode,
    delivers: mode === 'smtp' || mode === 'log',
    sent,
    queue({ kind, to, lang, vars }) {
      if (mode === 'off' || closed) return;
      const { subject, text } = renderMail(kind, lang, vars);
      const mail: OutgoingMail = { kind, to, lang, subject, text, queuedAt: clock.now() };
      if (mode === 'memory') sent.push(mail);
      else if (mode === 'log') writeOutbox(mail);
      else deliver(mail, 0);
    },
    async idle() {
      while (inFlight.size > 0) await Promise.allSettled([...inFlight]);
    },
    close() {
      closed = true;
      for (const t of timers) clearTimeout(t);
      timers.clear();
    },
  };
}
