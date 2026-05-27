// Lightweight health monitor — counts consecutive failures in the
// SendPulse → pipeline path. After HEALTH_FAILURE_THRESHOLD failures
// in a row, DMs the owner once (cooldown via HEALTH_ALERT_COOLDOWN_MINUTES).
// Resets and sends a recovery DM on the next success.
//
// MVP scope: one channel only (`pipeline`). Anthropic / SendPulse
// API failures bubble up here too — they're the most common cause of
// pipeline-handler exceptions in prod.

import type { Logger } from './logger.js';
import type { Notifier } from './notifier.js';

export interface HealthMonitor {
  recordSuccess(): void;
  recordFailure(err: unknown): void;
  snapshot(): {
    consecutive_failures: number;
    last_error: string | null;
    last_error_at: string | null;
    last_success_at: string | null;
    alerted: boolean;
  };
}

export interface HealthMonitorOptions {
  notifier: Notifier;
  logger: Logger;
  failureThreshold: number;
  alertCooldownMinutes: number;
}

export function createHealthMonitor(opts: HealthMonitorOptions): HealthMonitor {
  const { notifier, logger, failureThreshold, alertCooldownMinutes } = opts;
  let consecutive = 0;
  let lastError: string | null = null;
  let lastErrorAt: string | null = null;
  let lastSuccessAt: string | null = null;
  let alerted = false;
  let lastAlertAt = 0;

  return {
    recordSuccess() {
      lastSuccessAt = new Date().toISOString();
      if (alerted) {
        // Recovery DM — owner needs to know the bot is back online.
        void notifier
          .send(
            `✅ ig-agent восстановился. Pipeline снова обрабатывает webhook'и. Было подряд ошибок: ${consecutive}.`,
          )
          .catch((err) =>
            logger.warn('health recovery notify failed', {
              err: err instanceof Error ? err.message : String(err),
            }),
          );
      }
      consecutive = 0;
      alerted = false;
    },

    recordFailure(err) {
      consecutive += 1;
      lastError = err instanceof Error ? err.message : String(err);
      lastErrorAt = new Date().toISOString();
      logger.warn('health: pipeline failure recorded', {
        consecutive,
        error: lastError,
      });
      const now = Date.now();
      const cooledDown = now - lastAlertAt >= alertCooldownMinutes * 60 * 1000;
      if (consecutive >= failureThreshold && cooledDown) {
        alerted = true;
        lastAlertAt = now;
        void notifier
          .send(
            `🚨 ig-agent: ${consecutive} ошибок подряд в pipeline.\n` +
              `Последняя: ${lastError}\n` +
              'SendPulse webhooks могут падать. Логи: docker logs --tail=200 ig-agent',
          )
          .catch((notifyErr) =>
            logger.warn('health alert notify failed', {
              err: notifyErr instanceof Error ? notifyErr.message : String(notifyErr),
            }),
          );
      }
    },

    snapshot() {
      return {
        consecutive_failures: consecutive,
        last_error: lastError,
        last_error_at: lastErrorAt,
        last_success_at: lastSuccessAt,
        alerted,
      };
    },
  };
}
