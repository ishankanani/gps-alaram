/**
 * StopWake Cloud entry point (spec 6.1): config → db → migrate → bootstrap admin → jobs → listen.
 * SIGTERM / SIGINT: stop accepting connections, wait up to 10 s for in-flight requests, checkpoint,
 * close and exit 0.
 *
 *   node --disable-warning=ExperimentalWarning server/main.ts
 */
import { createServer } from 'node:http';
import { join } from 'node:path';

import { createApp, SERVER_VERSION } from './src/app.ts';
import { systemClock } from './src/clock.ts';
import { ConfigError, loadConfig, redactedSummary } from './src/config.ts';
import { closeDatabase, openDatabase } from './src/db/database.ts';
import { migrate } from './src/db/migrate.ts';
import { bootstrapAdmin } from './src/domain/bootstrap.ts';
import { createRevenueCatApi } from './src/domain/revenuecat-api.ts';
import { startJobs } from './src/jobs.ts';
import { createLogger } from './src/log.ts';
import { createMailer } from './src/mail/mailer.ts';
import { createSmtpTransport } from './src/mail/smtp.ts';

const SHUTDOWN_GRACE_MS = 10_000;

async function main(): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      process.stderr.write(`${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }
  const log = createLogger({ level: config.logLevel });
  log.info('StopWake Cloud starting', { version: SERVER_VERSION, commit: config.gitCommit, config: redactedSummary(config) });
  for (const w of config.warnings) log.warn(w);

  const db = openDatabase(config.databasePath);
  const migration = migrate(db, { backupDir: config.backupDir, now: systemClock.now(), log });
  log.info('database ready', { schemaVersion: migration.to, applied: migration.applied });

  const mailer = createMailer({
    mode: config.mailMode,
    from: config.mailFrom,
    outboxDir: join(config.dataDir, 'outbox'),
    transport: config.mailMode === 'smtp' && config.smtpUrl
      ? createSmtpTransport({ url: config.smtpUrl, heloHost: new URL(config.publicUrl).hostname })
      : undefined,
    log,
    clock: systemClock,
  });
  const revenuecat = config.revenuecatApiKey ? createRevenueCatApi({ apiKey: config.revenuecatApiKey }) : null;
  const app = createApp({ db, clock: systemClock, config, mailer, revenuecat, log });

  await bootstrapAdmin({ db, config, hasher: app.context.hasher, log, now: () => systemClock.now() });
  const jobs = startJobs(app.context);

  const server = createServer({ requestTimeout: 15_000, headersTimeout: 10_000 }, app);
  server.keepAliveTimeout = 65_000;
  server.on('clientError', (_err, socket) => {
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
    else socket.destroy();
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, config.host, () => {
      server.off('error', reject);
      resolve();
    });
  });
  log.info('listening', { host: config.host, port: config.port, publicUrl: config.publicUrl });

  let stopping = false;
  const shutdown = (signal: string): void => {
    if (stopping) return;
    stopping = true;
    log.info('shutting down', { signal });
    jobs.stop();
    server.close();
    const deadline = Date.now() + SHUTDOWN_GRACE_MS;
    const finish = async (): Promise<void> => {
      while (app.inFlight() > 0 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
      server.closeAllConnections();
      await Promise.race([mailer.idle(), new Promise((r) => setTimeout(r, Math.max(0, deadline - Date.now())))]);
      mailer.close();
      try {
        closeDatabase(db);
      } catch (err) {
        log.error('closing the database failed', { error: err });
      }
      log.info('stopped');
      process.exit(0);
    };
    void finish();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => log.error('unhandled rejection', { error: reason }));
}

main().catch((err: unknown) => {
  process.stderr.write(`StopWake Cloud failed to start: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
  process.exit(1);
});
