/**
 * In-process jobs (spec 6.3), every timer unref()ed:
 * - rate-limit sweep every minute;
 * - prune (1.5) hourly;
 * - backup check every 10 minutes (daily at BACKUP_HOUR_UTC, and whenever the newest backup is
 *   older than 26 h, which includes the start) when backups are on;
 * - PRAGMA optimize daily.
 */
import { DAY, HOUR, MINUTE } from './clock.ts';
import type { AppContext } from './context.ts';
import { backupDue, runBackup } from './domain/backup.ts';
import { prune } from './domain/prune.ts';

export type Jobs = { stop(): void };

export function startJobs(app: AppContext): Jobs {
  const { db, config, log, clock } = app;
  const timers: NodeJS.Timeout[] = [];
  const every = (ms: number, name: string, fn: () => void): void => {
    const t = setInterval(() => {
      try {
        fn();
      } catch (err) {
        log.error(`job ${name} failed`, { error: err });
      }
    }, ms);
    t.unref();
    timers.push(t);
  };

  every(MINUTE, 'rate-limit sweep', () => app.limiter.sweep());

  const runPrune = (): void => {
    const r = prune(db, clock.now());
    if (Object.values(r).some((n) => n > 0)) log.info('prune', r);
  };
  every(HOUR, 'prune', runPrune);

  if (config.backups) {
    const check = (): void => {
      const now = clock.now();
      if (!backupDue(config.backupDir, now, config.backupHourUtc)) return;
      const r = runBackup(db, { dir: config.backupDir, now, keepDaily: config.backupKeepDaily, keepWeekly: config.backupKeepWeekly });
      log.info('backup written', { file: r.file, removed: r.removed.length });
    };
    every(10 * MINUTE, 'backup', check);
    try {
      check();
    } catch (err) {
      log.error('job backup failed', { error: err });
    }
  }

  every(DAY, 'optimize', () => db.exec('PRAGMA optimize'));

  return {
    stop: () => {
      for (const t of timers) clearInterval(t);
      timers.length = 0;
    },
  };
}
