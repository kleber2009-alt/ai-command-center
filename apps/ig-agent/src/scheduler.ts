// Daily digest scheduler. Wakes once a minute, fires the sweep when
// wall clock crosses the configured UTC hour. Same approach as
// tg-agent's digest scheduler (no node-cron dependency) — single
// process, single replica, idempotent within a calendar day via
// `lastFiredYmd` guard.
//
// Default: 03:00 UTC = 10:00 Jakarta (UTC+7). Override via
// DIGEST_DAILY_HOUR_UTC env var.

import { buildDigest, type DigestGenerator } from './digest.js';
import type { DigestStore } from './db/digests.js';
import type { Notifier } from './notifier.js';
import type { Logger } from './logger.js';

export interface DigestSchedulerDeps {
  store: DigestStore;
  generator: DigestGenerator;
  notifier: Notifier;
  logger: Logger;
  // 0..23 — UTC hour at which to run the daily sweep.
  dailyHourUtc: number;
  // Window each digest covers. 24 by default.
  windowHours: number;
}

export interface DigestSchedulerHandle {
  stop(): void;
  runOnce(): Promise<RunResult>;
}

export interface RunResult {
  contactsConsidered: number;
  digestsGenerated: number;
  failed: number;
  ranAt: string;
}

export function startDigestScheduler(
  deps: DigestSchedulerDeps,
): DigestSchedulerHandle {
  const { logger, dailyHourUtc, windowHours } = deps;
  let lastFiredYmd = '';
  let stopped = false;
  let running = false;

  const runOnce = async (): Promise<RunResult> => {
    if (running) {
      logger.warn('ig-digest: sweep already running, skipping');
      return { contactsConsidered: 0, digestsGenerated: 0, failed: 0, ranAt: new Date().toISOString() };
    }
    running = true;
    const startedAt = new Date().toISOString();
    let generated = 0;
    let failed = 0;
    try {
      const sinceIso = new Date(
        Date.now() - windowHours * 60 * 60 * 1000,
      ).toISOString();
      const contacts = await deps.store.listActiveContacts(sinceIso);
      logger.info('ig-digest: daily sweep start', {
        contactCount: contacts.length,
        windowHours,
      });

      for (const contact of contacts) {
        try {
          const result = await buildDigest(
            { store: deps.store, generator: deps.generator, logger: deps.logger },
            { contact, windowHours },
          );
          if (result.digest) generated += 1;
        } catch (err) {
          failed += 1;
          logger.error('ig-digest: contact failed', {
            contactId: contact.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // One DM at end of sweep — the owner doesn't want N notifications,
      // they want one "morning briefing is ready" ping with a deep link.
      if (generated > 0) {
        try {
          await deps.notifier.send(
            `🧠 Утренняя сводка по Instagram готова: ${generated} ${
              generated === 1 ? 'диалог' : generated < 5 ? 'диалога' : 'диалогов'
            } за последние ${windowHours}ч. Открыть в кабинете → раздел «Сводки 24ч».`,
            { silent: false },
          );
        } catch (err) {
          logger.warn('ig-digest: notify owner failed', {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      return {
        contactsConsidered: contacts.length,
        digestsGenerated: generated,
        failed,
        ranAt: startedAt,
      };
    } finally {
      running = false;
    }
  };

  const tick = async (): Promise<void> => {
    if (stopped) return;
    const now = new Date();
    const ymd = now.toISOString().slice(0, 10);
    if (now.getUTCHours() === dailyHourUtc && lastFiredYmd !== ymd) {
      lastFiredYmd = ymd;
      try {
        await runOnce();
      } catch (err) {
        logger.error('ig-digest: sweep crashed', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  };

  const interval = setInterval(() => void tick(), 60_000);
  logger.info('ig-digest scheduler armed', {
    dailyHourUtc,
    windowHours,
    note: 'UTC hour; 03 UTC = 10:00 Asia/Jakarta',
  });

  return {
    stop() {
      stopped = true;
      clearInterval(interval);
    },
    runOnce,
  };
}
