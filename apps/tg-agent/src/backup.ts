import { createReadStream, createWriteStream, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';

import { InputFile, type Bot } from 'grammy';

import type { Db } from './db/index.js';
import type { Logger } from './logger.js';

// Telegram bot API caps server-side uploads at 50 MB. We warn well
// before that so the owner has time to think about retention.
const SOFT_MAX_BYTES = 45 * 1024 * 1024;

// Don't fire the first backup right at boot — if the container is
// stuck in a restart loop, the owner shouldn't drown in DMs.
const FIRST_RUN_DELAY_MS = 5 * 60 * 1000;

export interface BackupDeps {
  db: Db;
  bot: Bot;
  ownerTelegramId: number;
  intervalHours: number;
  logger: Logger;
}

export interface BackupHandle {
  // Stops the scheduler. Does not wait for an in-flight backup to
  // finish — those run to completion on their own goroutine.
  stop(): void;
  // Manual trigger, returns when the upload (or its failure) is done.
  // Useful for tests and for a future "Run backup now" admin button.
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
    } finally {
      running = false;
    }
  };

  // setTimeout for the first run, then a setInterval for the rest.
  // We don't persist the last-run-at to disk — restart-spam is
  // mitigated by FIRST_RUN_DELAY_MS, and one extra backup on a real
  // restart is a feature, not a bug.
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

async function runBackup({ db, bot, ownerTelegramId, logger }: BackupDeps): Promise<void> {
  const stamp = isoStampForFile(new Date());
  const work = mkdtempSync(join(tmpdir(), 'tg-agent-backup-'));
  const dbCopyPath = join(work, `tg-agent-${stamp}.db`);
  const gzPath = `${dbCopyPath}.gz`;

  try {
    // Online backup — no locks held against the live bot writes.
    // better-sqlite3 returns a thenable from `.backup`.
    await db.backup(dbCopyPath);

    const rawBytes = statSync(dbCopyPath).size;
    await pipeline(
      createReadStream(dbCopyPath),
      createGzip({ level: 9 }),
      createWriteStream(gzPath),
    );
    const gzBytes = statSync(gzPath).size;

    if (gzBytes > SOFT_MAX_BYTES) {
      logger.warn('backup exceeds Telegram soft limit', { gzBytes, softMax: SOFT_MAX_BYTES });
    }

    const caption =
      `Бэкап tg-agent · ${new Date().toLocaleString('ru-RU', { timeZone: 'UTC' })} UTC\n` +
      `Размер: ${human(gzBytes)} (исходник ${human(rawBytes)})\n` +
      'Восстановить: gunzip + положить файл в data/tg-agent.db и перезапустить контейнер.';

    await bot.api.sendDocument(
      ownerTelegramId,
      new InputFile(gzPath, `tg-agent-${stamp}.db.gz`),
      { caption },
    );
    logger.info('backup sent', { rawBytes, gzBytes });
  } finally {
    // Always tidy up — both the .db and the .gz live in the same
    // mkdtemp dir, so one rmSync cleans both.
    rmSync(work, { recursive: true, force: true });
  }
}

function isoStampForFile(d: Date): string {
  // YYYY-MM-DDTHH-MM-SSZ — colons aren't great in filenames.
  return d.toISOString().replace(/:/g, '-').replace(/\..+$/, 'Z');
}

function human(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
