// Daily Postgres backup → owner DM. Ports the tg-agent backup pattern,
// substituting SQLite's online .backup() with pg_dump --format=custom
// against the shared aisales-postgres cluster (db: ig_agent).
//
// Telegram caches uploads forever — the owner's DM thread is the
// storage target. Same 45 MB soft cap as tg-agent (server-side hard
// cap is 50 MB for bot uploads).
//
// Set BACKUP_INTERVAL_HOURS=0 in env to disable.

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Logger } from './logger.js';
import type { Notifier } from './notifier.js';

const SOFT_MAX_BYTES = 45 * 1024 * 1024;
const FIRST_RUN_DELAY_MS = 5 * 60 * 1000;

export interface BackupDeps {
  databaseUrl: string;
  notifier: Notifier;
  intervalHours: number;
  logger: Logger;
}

export interface BackupHandle {
  stop(): void;
  runOnce(): Promise<void>;
}

export function startBackupScheduler(deps: BackupDeps): BackupHandle {
  const { logger, intervalHours } = deps;
  if (intervalHours <= 0) {
    logger.info('backup scheduler disabled (BACKUP_INTERVAL_HOURS=0)');
    return { stop() {}, async runOnce() {} };
  }

  const intervalMs = intervalHours * 60 * 60 * 1000;
  let timer: NodeJS.Timeout | null = null;
  let running = false;

  const tick = async () => {
    if (running) {
      logger.warn('backup already running, skipping tick');
      return;
    }
    running = true;
    try {
      await runBackup(deps);
    } catch (err) {
      logger.error('backup failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      // Best-effort notify — don't loop on a flaky notifier.
      try {
        await deps.notifier.send(
          `⚠️ ig-agent backup упал: ${err instanceof Error ? err.message : String(err)}`,
        );
      } catch (_) { /* swallow */ }
    } finally {
      running = false;
    }
  };

  let firstTimer: NodeJS.Timeout | null = setTimeout(() => {
    firstTimer = null;
    void tick();
    timer = setInterval(() => void tick(), intervalMs);
  }, FIRST_RUN_DELAY_MS);

  logger.info('backup scheduler armed', {
    intervalHours,
    firstRunInMinutes: Math.round(FIRST_RUN_DELAY_MS / 60000),
  });

  return {
    stop() {
      if (firstTimer) clearTimeout(firstTimer);
      if (timer) clearInterval(timer);
    },
    async runOnce() {
      if (!running) await tick();
    },
  };
}

async function runBackup({ databaseUrl, notifier, logger }: BackupDeps): Promise<void> {
  const stamp = isoStampForFile(new Date());
  const work = mkdtempSync(join(tmpdir(), 'ig-agent-backup-'));
  const gzPath = join(work, `ig-agent-${stamp}.dump.gz`);

  try {
    // pg_dump --format=custom is already compressed (zlib level 6 by
    // default), but we pipe through gzip --best for the extra few %
    // and to keep the file extension predictable for owner restore.
    await pgDumpToGz(databaseUrl, gzPath);

    const gzBytes = statSync(gzPath).size;
    if (gzBytes > SOFT_MAX_BYTES) {
      logger.warn('backup exceeds Telegram soft limit', { gzBytes, softMax: SOFT_MAX_BYTES });
    }

    const caption =
      `Бэкап ig-agent · ${new Date().toLocaleString('ru-RU', { timeZone: 'UTC' })} UTC\n` +
      `Размер: ${human(gzBytes)}\n` +
      'Восстановить: gunzip + pg_restore --format=custom --dbname=ig_agent file.dump';

    await notifier.sendDocument(gzPath, {
      caption,
      filename: `ig-agent-${stamp}.dump.gz`,
    });
    logger.info('backup sent', { gzBytes });
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

function pgDumpToGz(databaseUrl: string, outPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // -Fc = custom (compressed). Stdout → gzip --best → outPath. We
    // shell out instead of node:zlib so we can stream pg_dump's
    // stdout through gzip without buffering the whole dump in memory.
    const dump = spawn('pg_dump', ['--no-owner', '--no-privileges', '-Fc', '-d', databaseUrl], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const gzip = spawn('gzip', ['-9', '-c'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Pipe dump → gzip → file
    dump.stdout.pipe(gzip.stdin);

    let dumpErr = '';
    let gzipErr = '';
    dump.stderr.on('data', (b) => { dumpErr += b.toString(); });
    gzip.stderr.on('data', (b) => { gzipErr += b.toString(); });

    // Write gzip stdout to file via node fs stream.
    import('node:fs').then(({ createWriteStream }) => {
      const sink = createWriteStream(outPath);
      gzip.stdout.pipe(sink);

      let dumpDone = false;
      let gzipDone = false;
      let sinkDone = false;
      let settled = false;

      const tryResolve = () => {
        if (settled) return;
        if (dumpDone && gzipDone && sinkDone) {
          settled = true;
          resolve();
        }
      };

      dump.on('error', (err) => { if (!settled) { settled = true; reject(err); } });
      gzip.on('error', (err) => { if (!settled) { settled = true; reject(err); } });
      sink.on('error', (err) => { if (!settled) { settled = true; reject(err); } });

      dump.on('close', (code) => {
        if (code !== 0) {
          if (!settled) { settled = true; reject(new Error(`pg_dump exit ${code}: ${dumpErr.trim()}`)); }
          return;
        }
        dumpDone = true;
        tryResolve();
      });
      gzip.on('close', (code) => {
        if (code !== 0) {
          if (!settled) { settled = true; reject(new Error(`gzip exit ${code}: ${gzipErr.trim()}`)); }
          return;
        }
        gzipDone = true;
        tryResolve();
      });
      sink.on('close', () => { sinkDone = true; tryResolve(); });
    }).catch(reject);
  });
}

function isoStampForFile(d: Date): string {
  return d.toISOString().replace(/:/g, '-').replace(/\..+$/, 'Z');
}

function human(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
