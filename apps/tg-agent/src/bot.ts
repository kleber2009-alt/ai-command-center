import { Bot } from 'grammy';

import type { Classifier } from './classifier.js';
import type { Config } from './config.js';
import type { ChatService } from './db/chats.js';
import type { LeadService } from './db/leads.js';
import type { MessageStore } from './db/messages.js';
import { decide } from './decision.js';
import type { Logger } from './logger.js';
import type { Notifier } from './notifier.js';
import type { Responder } from './responder.js';
import type { Action, IncomingMessage } from './types.js';

export interface BotDeps {
  config: Config;
  logger: Logger;
  classifier: Classifier;
  responder: Responder;
  chats: ChatService;
  leads: LeadService;
  messages: MessageStore;
}

const ACTIONS_THAT_REPLY: ReadonlySet<Action> = new Set([
  'REPLY',
  'REPLY_SOFT',
  'REPLY_AND_NOTIFY',
]);

export interface CreateBotResult {
  bot: Bot;
  // Notifier needs `bot.api.sendMessage`, so it's created post-bot and
  // wired back in via this setter. Cleaner than circular imports.
  attachNotifier(notifier: Notifier): void;
}

export function createBot(deps: BotDeps): CreateBotResult {
  const { config, logger, classifier, responder, chats, leads, messages } = deps;
  const bot = new Bot(config.telegramBotToken);
  let notifier: Notifier | null = null;

  bot.on('message:text', async (ctx) => {
    const text = ctx.message.text;
    const chatId = ctx.chat.id;
    const chatTitle = 'title' in ctx.chat ? ctx.chat.title : undefined;

    if (config.allowedChatIds.size > 0 && !config.allowedChatIds.has(chatId)) {
      logger.debug('skip: chat not in allowlist', { chatId, chatTitle });
      return;
    }

    const incoming: IncomingMessage = {
      chatId,
      chatTitle,
      userId: ctx.from?.id,
      username: ctx.from?.username,
      firstName: ctx.from?.first_name,
      lastName: ctx.from?.last_name,
      messageId: ctx.message.message_id,
      text,
    };

    const baseLog = {
      chatId: incoming.chatId,
      userId: incoming.userId,
      username: incoming.username,
      messageId: incoming.messageId,
      text: truncate(incoming.text, 200),
    };

    try {
      const chatState = await chats.touch(chatId, chatTitle);
      const classification = await classifier.classify(text);
      const decision = decide(classification, config.confidenceThreshold);

      const lead = incoming.userId !== undefined
        ? await leads.touchAndClassify(
            {
              chatId,
              userId: incoming.userId,
              username: incoming.username,
              firstName: incoming.firstName,
              lastName: incoming.lastName,
            },
            classification.class,
          )
        : null;

      logger.info('classified', {
        ...baseLog,
        class: classification.class,
        confidence: Number(classification.confidence.toFixed(3)),
        reasoning: classification.reasoning,
        action: decision.action,
        rationale: decision.rationale,
        leadStatus: lead?.status ?? null,
        leadChanged: lead?.changed ?? false,
        autoReply: chatState.autoReply,
      });

      let reply: string | null = null;
      const wantsReply = ACTIONS_THAT_REPLY.has(decision.action);

      if (wantsReply && chatState.autoReply) {
        const authorDisplay =
          ctx.from?.username ??
          ctx.from?.first_name ??
          (incoming.userId !== undefined ? `user${incoming.userId}` : undefined);

        reply = await responder.generate({
          messageClass: classification.class,
          text,
          authorDisplay,
        });

        await ctx.reply(reply, {
          reply_parameters: { message_id: incoming.messageId },
        });

        logger.info('replied', {
          ...baseLog,
          class: classification.class,
          action: decision.action,
          replyChars: reply.length,
          reply: truncate(reply, 200),
        });
      } else if (wantsReply && !chatState.autoReply) {
        logger.info('reply suppressed: auto_reply is OFF for this chat', baseLog);
      }

      await messages.log({
        chatId,
        userId: incoming.userId,
        telegramMessageId: incoming.messageId,
        text,
        class: classification.class,
        confidence: classification.confidence,
        action: decision.action,
        reasoning: classification.reasoning,
        response: reply,
      });

      // Owner notifications run only when the chat hasn't been muted.
      if (chatState.autoReply && notifier && lead) {
        await notifier.notifyOwner({
          chatId,
          chatTitle,
          userId: incoming.userId,
          username: incoming.username,
          firstName: incoming.firstName,
          messageId: incoming.messageId,
          text,
          classification,
          action: decision.action,
          reply,
          leadStatus: lead.status,
          leadStatusChanged: lead.changed,
        });
      }
    } catch (err) {
      logger.error('handler failed', {
        ...baseLog,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  bot.catch((err) => {
    logger.error('bot runtime error', {
      error: err.error instanceof Error ? err.error.message : String(err.error),
    });
  });

  return {
    bot,
    attachNotifier(n: Notifier) {
      notifier = n;
    },
  };
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}
