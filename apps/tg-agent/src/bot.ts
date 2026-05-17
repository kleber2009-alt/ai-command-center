import { Bot } from 'grammy';

import type { Classifier } from './classifier.js';
import type { Config } from './config.js';
import { decide } from './decision.js';
import type { Logger } from './logger.js';
import type { Responder } from './responder.js';
import type { Action, IncomingMessage } from './types.js';

export interface BotDeps {
  config: Config;
  logger: Logger;
  classifier: Classifier;
  responder: Responder;
}

const ACTIONS_THAT_REPLY: ReadonlySet<Action> = new Set([
  'REPLY',
  'REPLY_SOFT',
  'REPLY_AND_NOTIFY',
]);

export function createBot({ config, logger, classifier, responder }: BotDeps): Bot {
  const bot = new Bot(config.telegramBotToken);

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
      const classification = await classifier.classify(text);
      const decision = decide(classification, config.confidenceThreshold);

      logger.info('classified', {
        ...baseLog,
        class: classification.class,
        confidence: Number(classification.confidence.toFixed(3)),
        reasoning: classification.reasoning,
        action: decision.action,
        rationale: decision.rationale,
      });

      if (!ACTIONS_THAT_REPLY.has(decision.action)) {
        return;
      }

      const authorDisplay =
        ctx.from?.username ??
        ctx.from?.first_name ??
        (incoming.userId !== undefined ? `user${incoming.userId}` : undefined);

      const reply = await responder.generate({
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

  return bot;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}
