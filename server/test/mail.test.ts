/**
 * Mail (spec 6.6): the SMTP client against a fake `net` server (EHLO, AUTH PLAIN, MAIL/RCPT/DATA,
 * base64 body, encoded UTF-8 subject, error replies, STARTTLS, and the refusal to continue on port
 * 587 without TLS), plus the mailer queue (modes, retries, outbox) and the templates.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import net, { createServer, type AddressInfo, type Server, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { createServer as createTlsServer, TLSSocket } from 'node:tls';

import { createTestClock } from '../src/clock.ts';
import { createLogger } from '../src/log.ts';
import { createMailer, type MailTransport } from '../src/mail/mailer.ts';
import { buildMessage, encodeHeaderWord, sendMail, SmtpError } from '../src/mail/smtp.ts';
import { renderMail } from '../src/mail/templates.ts';

// ---- A scriptable fake SMTP server ----

type Replies = Partial<Record<'greeting' | 'EHLO' | 'AUTH' | 'MAIL' | 'RCPT' | 'DATA' | 'message' | 'QUIT', string>>;
type FakeOptions = { replies?: Replies; starttls?: { key: string; cert: string }; implicitTls?: { key: string; cert: string }; silent?: boolean };
type Fake = { port: number; commands: string[]; secureCommands: string[]; messages: string[]; close(): Promise<void> };

async function fakeSmtp(opts: FakeOptions = {}): Promise<Fake> {
  const commands: string[] = [];
  const secureCommands: string[] = [];
  const messages: string[] = [];
  const replies: Required<Replies> = {
    greeting: '220-mail.test ESMTP fake\r\n220 ready\r\n',
    EHLO: '',
    AUTH: '235 2.7.0 Authentication successful\r\n',
    MAIL: '250 2.1.0 Ok\r\n',
    RCPT: '250 2.1.5 Ok\r\n',
    DATA: '354 End data with <CR><LF>.<CR><LF>\r\n',
    message: '250 2.0.0 Ok: queued as FAKE1\r\n',
    QUIT: '221 2.0.0 Bye\r\n',
    ...opts.replies,
  };

  const session = (socket: Socket, secure: boolean): void => {
    let buffer = '';
    let data: string[] | null = null;
    const write = (s: string) => socket.write(s);
    const onLine = (line: string): void => {
      if (data) {
        if (line === '.') {
          messages.push(data.join('\r\n'));
          data = null;
          write(replies.message);
        } else data.push(line);
        return;
      }
      commands.push(line);
      if (secure) secureCommands.push(line);
      const verb = line.split(' ')[0]!.toUpperCase();
      if (verb === 'EHLO') {
        write(replies.EHLO || `250-mail.test\r\n250-AUTH PLAIN LOGIN\r\n${opts.starttls && !secure ? '250-STARTTLS\r\n' : ''}250 8BITMIME\r\n`);
      } else if (verb === 'STARTTLS' && opts.starttls) {
        write('220 2.0.0 Ready to start TLS\r\n');
        socket.removeAllListeners('data');
        const upgraded = new TLSSocket(socket, { isServer: true, key: opts.starttls.key, cert: opts.starttls.cert });
        upgraded.on('error', () => undefined);
        session(upgraded, true);
      } else if (verb === 'AUTH') write(replies.AUTH);
      else if (verb === 'MAIL') write(replies.MAIL);
      else if (verb === 'RCPT') write(replies.RCPT);
      else if (verb === 'DATA') {
        write(replies.DATA);
        if (replies.DATA.startsWith('354')) data = [];
      } else if (verb === 'QUIT') {
        write(replies.QUIT);
        socket.end();
      } else write('502 5.5.2 Command not recognized\r\n');
    };
    socket.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      let i: number;
      while ((i = buffer.indexOf('\r\n')) >= 0) {
        const line = buffer.slice(0, i);
        buffer = buffer.slice(i + 2);
        onLine(line);
      }
    });
    socket.on('error', () => undefined);
  };

  const sockets = new Set<Socket>();
  const onConnection = (socket: Socket, secure: boolean) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    if (!opts.silent) socket.write(replies.greeting);
    session(socket, secure);
  };
  const server: Server = opts.implicitTls
    ? createTlsServer({ key: opts.implicitTls.key, cert: opts.implicitTls.cert }, (s) => onConnection(s, true))
    : createServer((s) => onConnection(s, false));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    port: (server.address() as AddressInfo).port,
    commands,
    secureCommands,
    messages,
    close: () =>
      new Promise<void>((resolve) => {
        for (const s of sockets) s.destroy();
        server.close(() => resolve());
      }),
  };
}

/** Routes every net.connect of the SMTP client to the fake server (to test ports and hosts we cannot bind). */
async function withConnectRedirect<T>(port: number, fn: () => Promise<T>): Promise<T> {
  const original = net.connect;
  const redirected = ((options: net.NetConnectOpts, cb?: () => void) =>
    original({ ...(options as net.TcpNetConnectOpts), host: '127.0.0.1', port }, cb)) as typeof net.connect;
  net.connect = redirected;
  syncBuiltinESMExports();
  try {
    return await fn();
  } finally {
    net.connect = original;
    syncBuiltinESMExports();
  }
}

/** A throwaway self-signed certificate for localhost (null when openssl is not installed). */
function selfSignedCert(dir: string): { key: string; cert: string } | null {
  try {
    execFileSync('openssl', [
      'req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-days', '2', '-subj', '/CN=localhost',
      '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1', '-keyout', join(dir, 'key.pem'), '-out', join(dir, 'cert.pem'),
    ], { stdio: 'ignore' });
    return { key: readFileSync(join(dir, 'key.pem'), 'utf8'), cert: readFileSync(join(dir, 'cert.pem'), 'utf8') };
  } catch {
    return null;
  }
}

// ---- Parsing what the fake server received ----

function parseMessage(raw: string): { headers: Record<string, string>; rawHeaders: string; body: string; bodyLines: string[] } {
  const split = raw.indexOf('\r\n\r\n');
  const rawHeaders = raw.slice(0, split);
  const headers: Record<string, string> = {};
  for (const line of rawHeaders.replace(/\r\n[ \t]/g, ' \u0000').split('\r\n')) {
    const i = line.indexOf(':');
    headers[line.slice(0, i)] = line.slice(i + 1).trim();
  }
  const bodyLines = raw.slice(split + 4).split('\r\n');
  return { headers, rawHeaders, body: Buffer.from(bodyLines.join(''), 'base64').toString('utf8'), bodyLines };
}

const decodeWords = (value: string): string =>
  value.split(' \u0000').map((w) => {
    const m = /^=\?UTF-8\?B\?([A-Za-z0-9+/=]+)\?=$/.exec(w.trim());
    assert.ok(m, `an RFC 2047 encoded word: ${w}`);
    return Buffer.from(m[1]!, 'base64').toString('utf8');
  }).join('');

const MSG = {
  from: 'StopWake <no-reply@example.com>',
  to: 'lena.weber@example.com',
  subject: 'Dein StopWake-Code: K3P9-7XQ2 – schöne Grüße',
  text: 'Hallo Lena,\nder Code lautet K3P9-7XQ2.\n.\nEine Zeile mit einem Punkt davor: .Punkt\nÄÖÜ ß € 日本語',
};

let tmp: string;
before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'stopwake-mail-'));
});
after(() => rmSync(tmp, { recursive: true, force: true }));

describe('the SMTP client', () => {
  it('EHLO, AUTH PLAIN, MAIL FROM, RCPT TO, DATA, QUIT', async () => {
    const fake = await fakeSmtp();
    try {
      await sendMail({ url: `smtp://mailer%40example.com:p%C3%A4ss%20word@127.0.0.1:${fake.port}`, heloHost: 'api.example.com', timeoutMs: 2000 }, MSG);
      assert.equal(fake.commands.length, 6, fake.commands.join(' | '));
      assert.equal(fake.commands[0], 'EHLO api.example.com');
      const auth = /^AUTH PLAIN ([A-Za-z0-9+/=]+)$/.exec(fake.commands[1]!);
      assert.ok(auth, fake.commands[1]);
      assert.equal(Buffer.from(auth[1]!, 'base64').toString('utf8'), '\u0000mailer@example.com\u0000päss word');
      assert.deepEqual(fake.commands.slice(2), ['MAIL FROM:<no-reply@example.com>', 'RCPT TO:<lena.weber@example.com>', 'DATA', 'QUIT']);
      assert.equal(fake.messages.length, 1);
    } finally {
      await fake.close();
    }
  });

  it('sends the headers of 6.6, an encoded UTF-8 subject and a base64 body in 76-character lines', async () => {
    const fake = await fakeSmtp();
    try {
      await sendMail({ url: `smtp://127.0.0.1:${fake.port}`, heloHost: 'api.example.com', timeoutMs: 2000 }, MSG);
      assert.ok(!fake.commands.some((c) => c.startsWith('AUTH')), 'no credentials, no AUTH');
      const m = parseMessage(fake.messages[0]!);
      assert.equal(m.headers.From, '"StopWake" <no-reply@example.com>');
      assert.equal(m.headers.To, '<lena.weber@example.com>');
      assert.equal(decodeWords(m.headers.Subject!), MSG.subject);
      for (const word of m.rawHeaders.match(/=\?UTF-8\?B\?[^?]*\?=/g) ?? []) assert.ok(word.length <= 75, word);
      assert.match(m.headers.Date!, /^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} \+0000$/);
      assert.match(m.headers['Message-ID']!, /^<[0-9a-f]{32}@example\.com>$/);
      assert.equal(m.headers['MIME-Version'], '1.0');
      assert.equal(m.headers['Content-Type'], 'text/plain; charset=utf-8');
      assert.equal(m.headers['Content-Transfer-Encoding'], 'base64');
      assert.ok(m.bodyLines.every((l) => l.length <= 76 && /^[A-Za-z0-9+/=]*$/.test(l)), 'base64 lines of at most 76 characters');
      assert.ok(m.bodyLines.length > 1);
      assert.equal(m.body, MSG.text.replace(/\n/g, '\r\n'));
      assert.ok(!fake.messages[0]!.split('\r\n').includes('.'), 'no dot-stuffing needed');
    } finally {
      await fake.close();
    }
  });

  it('turns any reply other than 2xx/3xx into an error', async () => {
    const cases: [Replies, number, RegExp, string | null][] = [
      [{ greeting: '554 5.3.2 Go away\r\n' }, 554, /greeting failed: 554/, null],
      [{ AUTH: '535 5.7.8 Authentication credentials invalid\r\n' }, 535, /AUTH failed: 535/, 'MAIL'],
      [{ MAIL: '421 4.3.0 Try later\r\n' }, 421, /MAIL FROM failed: 421/, 'RCPT'],
      [{ RCPT: '550 5.1.1 No such user\r\n' }, 550, /RCPT TO failed: 550/, 'DATA'],
      [{ DATA: '503 5.5.1 Bad sequence\r\n' }, 503, /DATA failed: 503/, null],
      [{ message: '452 4.3.1 Insufficient storage\r\n' }, 452, /message failed: 452/, 'QUIT'],
      [{ EHLO: '500 5.5.1 What?\r\n' }, 500, /EHLO failed: 500/, 'AUTH'],
    ];
    for (const [replies, code, message, neverSent] of cases) {
      const fake = await fakeSmtp({ replies });
      try {
        await assert.rejects(
          sendMail({ url: `smtp://user:pass@127.0.0.1:${fake.port}`, heloHost: 'api.example.com', timeoutMs: 2000 }, MSG),
          (err: unknown) => err instanceof SmtpError && err.replyCode === code && message.test(err.message),
          JSON.stringify(replies),
        );
        if (neverSent) assert.ok(!fake.commands.some((c) => c.startsWith(neverSent)), `${neverSent} is never sent after ${code}`);
      } finally {
        await fake.close();
      }
    }
  });

  it('fails on malformed replies, a closed connection and a silent server (timeout)', async () => {
    const malformed = await fakeSmtp({ replies: { greeting: 'hello there\r\n' } });
    await assert.rejects(sendMail({ url: `smtp://127.0.0.1:${malformed.port}`, heloHost: 'h', timeoutMs: 2000 }, MSG), /Malformed reply/);
    await malformed.close();
    const closing = createServer((socket) => {
      socket.resume();
      socket.end('220 hi\r\n');
    });
    await new Promise<void>((r) => closing.listen(0, '127.0.0.1', r));
    await assert.rejects(
      sendMail({ url: `smtp://127.0.0.1:${(closing.address() as AddressInfo).port}`, heloHost: 'h', timeoutMs: 2000 }, MSG),
      /Connection closed/,
    );
    await new Promise<void>((r) => closing.close(() => r()));
    const silent = await fakeSmtp({ silent: true });
    await assert.rejects(sendMail({ url: `smtp://127.0.0.1:${silent.port}`, heloHost: 'h', timeoutMs: 150 }, MSG), /SMTP timeout/);
    await silent.close();
  });

  it('refuses unsafe addresses (header injection) and non-SMTP URLs', async () => {
    await assert.rejects(sendMail({ url: 'smtp://127.0.0.1:1', heloHost: 'h' }, { ...MSG, to: 'a@example.com\r\nBcc: x@example.com' }), /Invalid recipient/);
    await assert.rejects(sendMail({ url: 'smtp://127.0.0.1:1', heloHost: 'h' }, { ...MSG, from: 'no address' }), /Invalid sender/);
    await assert.rejects(sendMail({ url: 'http://127.0.0.1:1', heloHost: 'h' }, MSG), /smtp: or smtps:/);
  });

  it('refuses to continue on port 587 without STARTTLS (and never sends the password in clear text)', async () => {
    const fake = await fakeSmtp();
    try {
      await withConnectRedirect(fake.port, async () => {
        await assert.rejects(
          sendMail({ url: 'smtp://user:secret@127.0.0.1:587', heloHost: 'api.example.com', timeoutMs: 2000 }, MSG),
          /does not offer STARTTLS; refusing to continue without TLS/,
        );
        await assert.rejects(
          sendMail({ url: 'smtp://127.0.0.1:587', heloHost: 'api.example.com', timeoutMs: 2000 }, MSG),
          /refusing to continue without TLS/,
          'even without credentials',
        );
        // Stricter than the spec: credentials never go to a remote host in clear text, whatever the port.
        await assert.rejects(
          sendMail({ url: 'smtp://user:secret@mail.example.com:2525', heloHost: 'api.example.com', timeoutMs: 2000 }, MSG),
          /refusing to continue without TLS/,
        );
      });
      assert.deepEqual(fake.commands, ['EHLO api.example.com', 'EHLO api.example.com', 'EHLO api.example.com']);
    } finally {
      await fake.close();
    }
  });

  describe('with TLS', () => {
    let cert: { key: string; cert: string } | null = null;
    before(() => {
      cert = selfSignedCert(tmp);
    });

    it('upgrades with STARTTLS, says EHLO again and authenticates inside TLS (also on port 587)', async (t) => {
      if (!cert) return t.skip('openssl is not installed');
      const fake = await fakeSmtp({ starttls: cert });
      try {
        await sendMail({ url: `smtp://user:pass@localhost:${fake.port}`, heloHost: 'api.example.com', timeoutMs: 3000, tls: { ca: cert.cert } }, MSG);
        assert.deepEqual(fake.commands.slice(0, 3), ['EHLO api.example.com', 'STARTTLS', 'EHLO api.example.com']);
        assert.deepEqual(fake.secureCommands.map((c) => c.split(' ')[0]), ['EHLO', 'AUTH', 'MAIL', 'RCPT', 'DATA', 'QUIT']);
        assert.equal(fake.messages.length, 1);
        fake.commands.length = 0;
        await withConnectRedirect(fake.port, () =>
          sendMail({ url: 'smtp://user:pass@localhost:587', heloHost: 'api.example.com', timeoutMs: 3000, tls: { ca: cert!.cert } }, MSG));
        assert.equal(fake.messages.length, 2);
        assert.ok(fake.commands.includes('STARTTLS'));
      } finally {
        await fake.close();
      }
    });

    it('verifies the certificate', async (t) => {
      if (!cert) return t.skip('openssl is not installed');
      const fake = await fakeSmtp({ starttls: cert });
      try {
        await assert.rejects(sendMail({ url: `smtp://user:pass@localhost:${fake.port}`, heloHost: 'h', timeoutMs: 3000 }, MSG));
        assert.ok(!fake.commands.some((c) => c.startsWith('AUTH')));
      } finally {
        await fake.close();
      }
    });

    it('smtps: uses implicit TLS', async (t) => {
      if (!cert) return t.skip('openssl is not installed');
      const fake = await fakeSmtp({ implicitTls: cert });
      try {
        await sendMail({ url: `smtps://user:pass@localhost:${fake.port}`, heloHost: 'api.example.com', timeoutMs: 3000, tls: { ca: cert.cert } }, MSG);
        assert.deepEqual(fake.commands.map((c) => c.split(' ')[0]), ['EHLO', 'AUTH', 'MAIL', 'RCPT', 'DATA', 'QUIT']);
      } finally {
        await fake.close();
      }
    });
  });
});

describe('message building', () => {
  it('leaves ASCII headers alone, encodes UTF-8 in words of at most 75 characters', () => {
    assert.equal(encodeHeaderWord('Your StopWake reset code: K3P9-7XQ2'), 'Your StopWake reset code: K3P9-7XQ2');
    const long = 'Ä'.repeat(100);
    const words = encodeHeaderWord(long).split('\r\n ');
    assert.ok(words.length > 1);
    assert.ok(words.every((w) => w.length <= 75));
    assert.equal(words.map((w) => Buffer.from(/\?B\?(.*)\?=$/.exec(w)![1]!, 'base64').toString('utf8')).join(''), long);
    const msg = buildMessage({ from: 'Ünïcode Sender <a@example.com>', to: 'b@example.com', subject: 'x', text: 'y', date: new Date(Date.UTC(2026, 9, 10, 8)) });
    assert.match(msg, /^From: =\?UTF-8\?B\?[^?]+\?= <a@example\.com>\r\n/);
    assert.match(msg, /\r\nDate: Sat, 10 Oct 2026 08:00:00 \+0000\r\n/);
  });
});

describe('the mailer queue', () => {
  const log = createLogger({ level: 'silent' });
  const clock = createTestClock();

  it('memory mode records rendered mails; off mode sends nothing', () => {
    const memory = createMailer({ mode: 'memory', from: 'StopWake <no-reply@example.com>', log, clock });
    assert.equal(memory.delivers, false);
    memory.queue({ kind: 'reset_code', to: 'lena@example.com', lang: 'de', vars: { supportEmail: 'help@example.com', code: 'K3P9-7XQ2', minutes: 30 } });
    assert.equal(memory.sent.length, 1);
    const mail = memory.sent[0]!;
    assert.equal(mail.kind, 'reset_code');
    assert.equal(mail.lang, 'de');
    assert.equal(mail.subject, 'Your StopWake reset code: K3P9-7XQ2', 'English is the fallback');
    assert.match(mail.text, /K3P9-7XQ2/);
    assert.match(mail.text, /expires in 30 minutes/);
    assert.match(mail.text, /ignore this email/);
    assert.match(mail.text, /help@example\.com/);
    const off = createMailer({ mode: 'off', from: 'x <a@example.com>', log, clock });
    off.queue({ kind: 'password_changed', to: 'lena@example.com', lang: null, vars: { supportEmail: 's@example.com' } });
    assert.equal(off.sent.length, 0);
    assert.equal(off.delivers, false);
  });

  it('templates: password_changed and email_changed (masked new address)', () => {
    assert.equal(renderMail('password_changed', null, { supportEmail: 's@example.com' }).subject, 'Your StopWake password was changed');
    const changed = renderMail('email_changed', 'sv', { supportEmail: 's@example.com', newEmailMasked: 'n***@example.com' });
    assert.match(changed.text, /n\*\*\*@example\.com/);
  });

  it('log mode writes one outbox file per mail', async () => {
    const outboxDir = join(tmp, 'outbox');
    const mailer = createMailer({ mode: 'log', from: 'StopWake <no-reply@example.com>', outboxDir, log, clock });
    assert.equal(mailer.delivers, true);
    for (let i = 0; i < 2; i++) {
      mailer.queue({ kind: 'reset_code', to: 'lena@example.com', lang: null, vars: { supportEmail: 's@example.com', code: `AAAA-000${i}` } });
    }
    await mailer.idle();
    const files = readdirSync(outboxDir).sort();
    assert.deepEqual(files, ['2026-10-10T080000.000Z-1-reset_code.json', '2026-10-10T080000.000Z-reset_code.json'].sort());
    const content = JSON.parse(readFileSync(join(outboxDir, files[1]!), 'utf8'));
    assert.equal(content.to, 'lena@example.com');
    assert.equal(content.from, 'StopWake <no-reply@example.com>');
    assert.equal(statSync(join(outboxDir, files[1]!)).mode & 0o777, 0o600);
  });

  it('smtp mode retries a failed delivery three times, then gives up', async () => {
    const until = async (cond: () => boolean) => {
      for (let i = 0; i < 200 && !cond(); i++) await new Promise((r) => setTimeout(r, 5));
      assert.ok(cond());
    };
    let attempts = 0;
    const failing: MailTransport = async () => {
      attempts++;
      throw new Error('connection refused');
    };
    const mailer = createMailer({ mode: 'smtp', from: 'x <a@example.com>', transport: failing, log, clock, retryDelaysMs: [1, 1, 1] });
    mailer.queue({ kind: 'password_changed', to: 'lena@example.com', lang: null, vars: { supportEmail: 's@example.com' } });
    await until(() => attempts === 4);
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(attempts, 4);

    let calls = 0;
    const flaky: MailTransport = async (msg) => {
      calls++;
      assert.equal(msg.to, 'lena@example.com');
      if (calls === 1) throw new Error('temporary');
    };
    const second = createMailer({ mode: 'smtp', from: 'x <a@example.com>', transport: flaky, log, clock, retryDelaysMs: [1, 1, 1] });
    second.queue({ kind: 'password_changed', to: 'lena@example.com', lang: null, vars: { supportEmail: 's@example.com' } });
    await until(() => calls === 2);
    await second.idle();
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(calls, 2);

    let closedCalls = 0;
    const closed = createMailer({
      mode: 'smtp', from: 'x <a@example.com>', log, clock, retryDelaysMs: [50, 50, 50],
      transport: async () => {
        closedCalls++;
        throw new Error('down');
      },
    });
    closed.queue({ kind: 'password_changed', to: 'lena@example.com', lang: null, vars: { supportEmail: 's@example.com' } });
    await closed.idle();
    closed.close();
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(closedCalls, 1, 'close() cancels scheduled retries');

    assert.throws(() => createMailer({ mode: 'smtp', from: 'x <a@example.com>', log, clock }), /needs an SMTP transport/);
  });
});
