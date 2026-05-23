// Owner DM channel. Reuses the existing tg-agent Telegram bot — same
// TELEGRAM_BOT_TOKEN and OWNER_TELEGRAM_ID — so both bots write to one
// inbox. Implemented as a thin REST call to the Telegram Bot API to avoid
// pulling grammy into this app.

import type { Logger } from './logger.js';

export interface Notifier {
  send(text: string, opts?: { silent?: boolean }): Promise<void>;
}

export interface NotifierOptions {
  botToken: string;
  ownerTelegramId: number;
  logger: Logger;
}

export function createNotifier({ botToken, ownerTelegramId, logger }: NotifierOptions): Notifier {
  return {
    async send(text, options = {}) {
      try {
        const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            chat_id: ownerTelegramId,
            text,
            disable_notification: options.silent === true,
            // Avoid HTML/Markdown parsing surprises — plain text only.
            parse_mode: undefined,
          }),
        });
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          logger.warn('notifier send failed', { status: res.status, body });
        }
      } catch (err) {
        logger.warn('notifier send threw', {
          err: err instanceof Error ? err.message : String(err),
        });
      }
    },
  };
}
