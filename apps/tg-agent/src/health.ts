import type { Bot } from 'grammy';

import type { Logger } from './logger.js';

// Channels we track independently — classifier and responder both hit
// Anthropic so they often fail together, but reporting separately
// helps the owner figure out whether a per-request retry would help.
export type HealthChannel = 'classifier' | 'responder' | 'telegram';

const HEADERS: Record<HealthChannel, string> = {
  classifier: 'Classifier (Anthropic)',
  responder: 'Responder (Anthropic)',
  telegram: 'Telegram API',
};

export interface HealthSnapshot {
  channel: HealthChannel;
  status: 'ok' | 'degraded';
  consecutive_failures: number;
  last_error: string | null;
  last_error_at: string | null;
  last_success_at: string | null;
  alerted: boolean;
}

export interface HealthMonitor {
  recordSuccess(channel: HealthChannel): void;
  recordFailure(channel: HealthChannel, err: unknown): void;
  snapshot(): HealthSnapshot[];
}

interface ChannelState {
  consecutive_failures: number;
  last_error: string | null;
  last_error_at: number;
  last_success_at: number;
  alerted: boolean;
  alertedAt: number;
}

export interface HealthDeps {
  bot: Bot;
  ownerTelegramId: number | undefined;
  failureThreshold: number;
  alertCooldownMs: number;
  logger: Logger;
}

export function createHealthMonitor(deps: HealthDeps): HealthMonitor {
  const { bot, ownerTelegramId, failureThreshold, alertCooldownMs, logger } = deps;

  const channels: Record<HealthChannel, ChannelState> = {
    classifier: blankState(),
    responder: blankState(),
    telegram: blankState(),
  };

  function tryAlert(channel: HealthChannel, body: string): void {
    if (ownerTelegramId === undefined) return;
    bot.api
      .sendMessage(ownerTelegramId, body, { link_preview_options: { is_disabled: true } })
      .catch((err) => {
        logger.warn('health alert DM failed', {
          channel,
          error: err instanceof Error ? err.message : String(err),
        });
      });
  }

  return {
    recordSuccess(channel): void {
      const state = channels[channel];
      const wasDegraded = state.alerted;
      state.consecutive_failures = 0;
      state.last_error = null;
      state.last_success_at = Date.now();
      state.alerted = false;
      if (wasDegraded) {
        logger.info('health recovered', { channel });
        tryAlert(
          channel,
          `[HEALTH] ${HEADERS[channel]} восстановлен. Запросы снова проходят.`,
        );
      }
    },

    recordFailure(channel, err): void {
      const state = channels[channel];
      state.consecutive_failures += 1;
      state.last_error = err instanceof Error ? err.message : String(err);
      state.last_error_at = Date.now();

      const aboveThreshold = state.consecutive_failures >= failureThreshold;
      const cooledDown = Date.now() - state.alertedAt > alertCooldownMs;

      if (aboveThreshold && (!state.alerted || cooledDown)) {
        state.alerted = true;
        state.alertedAt = Date.now();
        logger.warn('health degraded', {
          channel,
          consecutive: state.consecutive_failures,
          lastError: state.last_error,
        });
        tryAlert(
          channel,
          `[HEALTH] ${HEADERS[channel]} не отвечает.\n` +
            `Подряд ошибок: ${state.consecutive_failures}\n` +
            `Последняя: ${truncate(state.last_error, 300)}\n\n` +
            'Бот продолжает классифицировать, но не отвечает в чатах ' +
            'пока не восстановится. Проверьте API-ключ и статус Anthropic.',
        );
      }
    },

    snapshot(): HealthSnapshot[] {
      return (Object.keys(channels) as HealthChannel[]).map((channel) => {
        const s = channels[channel];
        return {
          channel,
          status: s.consecutive_failures >= failureThreshold ? 'degraded' : 'ok',
          consecutive_failures: s.consecutive_failures,
          last_error: s.last_error,
          last_error_at: s.last_error_at ? new Date(s.last_error_at).toISOString() : null,
          last_success_at: s.last_success_at
            ? new Date(s.last_success_at).toISOString()
            : null,
          alerted: s.alerted,
        };
      });
    },
  };
}

function blankState(): ChannelState {
  return {
    consecutive_failures: 0,
    last_error: null,
    last_error_at: 0,
    last_success_at: 0,
    alerted: false,
    alertedAt: 0,
  };
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}
