import type { Bot } from 'grammy';

import type { Logger } from './logger.js';
import type { Action, Classification, LeadStatus } from './types.js';

// Per-action notification kind. Each one gets a different header and
// tone so the owner can triage at a glance.
const ACTIONS_TO_NOTIFY: ReadonlySet<Action> = new Set([
  'REPLY_AND_NOTIFY',
  'NOTIFY_ONLY',
  'DRAFT_FOR_OWNER',
]);

const HEADERS: Partial<Record<Action, string>> = {
  REPLY_AND_NOTIFY: '[LEAD] Горячий лид',
  NOTIFY_ONLY: '[OWNER] Просят тебя лично',
  DRAFT_FOR_OWNER: '[DRAFT] Низкая уверенность — нужен ручной ответ',
};

export interface NotifyContext {
  chatId: number;
  chatTitle: string | undefined;
  userId: number | undefined;
  username: string | undefined;
  firstName: string | undefined;
  messageId: number;
  text: string;
  classification: Classification;
  action: Action;
  reply: string | null;
  leadStatus: LeadStatus;
  leadStatusChanged: boolean;
}

export interface Notifier {
  notifyOwner(ctx: NotifyContext): Promise<void>;
}

export function createNotifier(
  bot: Bot,
  ownerTelegramId: number | undefined,
  logger: Logger,
): Notifier {
  if (ownerTelegramId === undefined) {
    logger.warn('OWNER_TELEGRAM_ID not set — owner notifications disabled');
    return { notifyOwner: async () => {} };
  }

  return {
    async notifyOwner(ctx): Promise<void> {
      if (!ACTIONS_TO_NOTIFY.has(ctx.action)) return;

      const text = formatNotification(ctx);
      try {
        await bot.api.sendMessage(ownerTelegramId, text, {
          link_preview_options: { is_disabled: true },
        });
      } catch (err) {
        logger.error('owner notification failed', {
          action: ctx.action,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  };
}

function formatNotification(ctx: NotifyContext): string {
  const header = HEADERS[ctx.action] ?? '[NOTIFY]';
  const author = formatAuthor(ctx);
  const chat = ctx.chatTitle ? `${ctx.chatTitle} (${ctx.chatId})` : String(ctx.chatId);
  const conf = ctx.classification.confidence.toFixed(2);

  const lines: string[] = [
    header,
    '',
    `Чат: ${chat}`,
    `От: ${author}`,
    `Класс: ${ctx.classification.class} (confidence ${conf})`,
    `Действие: ${ctx.action}`,
    `Лид: ${ctx.leadStatus}${ctx.leadStatusChanged ? ' (новый статус)' : ''}`,
    '',
    'Сообщение:',
    quote(ctx.text),
  ];

  if (ctx.reply) {
    lines.push('', 'Ответ бота:', quote(ctx.reply));
  } else if (ctx.action === 'DRAFT_FOR_OWNER') {
    lines.push('', 'Черновик не сгенерирован — ответь вручную.');
  }

  return lines.join('\n');
}

function formatAuthor(ctx: NotifyContext): string {
  const handle = ctx.username ? `@${ctx.username}` : undefined;
  const name = ctx.firstName;
  const id = ctx.userId !== undefined ? `id ${ctx.userId}` : 'id unknown';
  if (handle && name) return `${handle} (${name}, ${id})`;
  if (handle) return `${handle} (${id})`;
  if (name) return `${name} (${id})`;
  return id;
}

function quote(text: string): string {
  // Soft truncation for very long messages — keep the notification
  // readable on a phone.
  const trimmed = text.length > 600 ? `${text.slice(0, 599)}…` : text;
  return trimmed
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
}
