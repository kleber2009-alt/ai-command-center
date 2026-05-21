import { InlineKeyboard, type Bot } from 'grammy';

import type { DraftService } from './db/drafts.js';
import type { Logger } from './logger.js';
import type { Action, Classification, LeadStatus } from './types.js';

// Per-action notification kind. Each one gets a different header.
const ACTIONS_TO_NOTIFY: ReadonlySet<Action> = new Set([
  'REPLY_AND_NOTIFY',
  'NOTIFY_ONLY',
  'DRAFT_FOR_OWNER',
]);

const HEADERS: Partial<Record<Action, string>> = {
  REPLY_AND_NOTIFY: '[LEAD] Горячий лид',
  NOTIFY_ONLY: '[OWNER] Просят тебя лично',
  DRAFT_FOR_OWNER: '[DRAFT] Черновик — подтвердите отправку',
};

const PAYMENT_HEADER = '💰 ПЛАТЁЖ ПОЛУЧЕН';

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
  // For ACTIONS_THAT_REPLY — the actual reply the bot posted.
  reply: string | null;
  // For DRAFT_FOR_OWNER — the generated draft awaiting approval.
  // Null when the responder failed (then the DM degrades to a
  // text-only "ответь вручную").
  draftText: string | null;
  leadStatus: LeadStatus;
  leadStatusChanged: boolean;
}

export interface Notifier {
  notifyOwner(ctx: NotifyContext): Promise<void>;
}

// Callback-data format: "d:<a|e|x>:<id>". Telegram caps callback_data
// at 64 bytes — this gives us room for draft ids well past a billion.
export const DRAFT_CALLBACK_PATTERN = /^d:(a|e|x):(\d+)$/;

function draftButtons(draftId: number): InlineKeyboard {
  return new InlineKeyboard()
    .text('✅ Отправить', `d:a:${draftId}`)
    .text('✏️ Изменить', `d:e:${draftId}`)
    .text('❌ Удалить', `d:x:${draftId}`);
}

export interface NotifierDeps {
  bot: Bot;
  ownerTelegramId: number | undefined;
  drafts: DraftService;
  logger: Logger;
}

export function createNotifier({
  bot,
  ownerTelegramId,
  drafts,
  logger,
}: NotifierDeps): Notifier {
  if (ownerTelegramId === undefined) {
    logger.warn('OWNER_TELEGRAM_ID not set — owner notifications disabled');
    return { notifyOwner: async () => {} };
  }

  return {
    async notifyOwner(ctx): Promise<void> {
      if (!ACTIONS_TO_NOTIFY.has(ctx.action)) return;

      // DRAFT path: persist draft, send DM with inline keyboard.
      if (ctx.action === 'DRAFT_FOR_OWNER' && ctx.draftText) {
        const draft = drafts.create({
          chatId: ctx.chatId,
          userId: ctx.userId,
          originalMessageId: ctx.messageId,
          messageClass: ctx.classification.class,
          draftText: ctx.draftText,
        });

        const body = formatDraftNotification(ctx, ctx.draftText);
        try {
          const sent = await bot.api.sendMessage(ownerTelegramId, body, {
            link_preview_options: { is_disabled: true },
            reply_markup: draftButtons(draft.id),
          });
          drafts.attachOwnerDm(draft.id, sent.message_id);
        } catch (err) {
          logger.error('draft DM failed', {
            draftId: draft.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        return;
      }

      // INFO path: plain DM, no buttons.
      const body = formatInfoNotification(ctx);
      try {
        await bot.api.sendMessage(ownerTelegramId, body, {
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

function commonHeader(ctx: NotifyContext): string[] {
  const author = formatAuthor(ctx);
  const chat = ctx.chatTitle ? `${ctx.chatTitle} (${ctx.chatId})` : String(ctx.chatId);
  const conf = ctx.classification.confidence.toFixed(2);
  return [
    `Чат: ${chat}`,
    `От: ${author}`,
    `Класс: ${ctx.classification.class} (confidence ${conf})`,
    `Действие: ${ctx.action}`,
    `Лид: ${ctx.leadStatus}${ctx.leadStatusChanged ? ' (новый статус)' : ''}`,
  ];
}

function formatInfoNotification(ctx: NotifyContext): string {
  const header = ctx.classification.class === 'PAYMENT_RECEIVED'
    ? PAYMENT_HEADER
    : HEADERS[ctx.action] ?? '[NOTIFY]';
  const lines = [header, '', ...commonHeader(ctx), '', 'Сообщение:', quote(ctx.text)];
  if (ctx.reply) {
    lines.push('', 'Ответ бота:', quote(ctx.reply));
  } else if (ctx.action === 'DRAFT_FOR_OWNER') {
    lines.push('', 'Черновик не сгенерирован — ответь вручную.');
  }
  return lines.join('\n');
}

function formatDraftNotification(ctx: NotifyContext, draftText: string): string {
  return [
    HEADERS.DRAFT_FOR_OWNER ?? '[DRAFT]',
    '',
    ...commonHeader(ctx),
    '',
    'Сообщение:',
    quote(ctx.text),
    '',
    'Черновик ответа:',
    quote(draftText),
  ].join('\n');
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
  const trimmed = text.length > 600 ? `${text.slice(0, 599)}…` : text;
  return trimmed
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
}

// Helpers for the bot handler to update the DM after a resolution.
// Kept here so the rendering stays in one file.
export function renderResolutionFooter(
  action: 'sent' | 'sent-edited' | 'deleted',
): string {
  switch (action) {
    case 'sent':
      return '\n\n✓ Отправлено в чат';
    case 'sent-edited':
      return '\n\n✓ Отправлено в чат (изменено)';
    case 'deleted':
      return '\n\n✗ Удалено, в чат не пошло';
  }
}
