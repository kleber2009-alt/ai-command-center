import { Bot } from 'grammy';

import type { Classifier } from './classifier.js';
import type { Config } from './config.js';
import { decide } from './decision.js';
import type { Logger } from './logger.js';
import type { IncomingMessage } from './types.js';

export interface BotDeps {
  config: Config;
  logger: Logger;
  classifier: Classifier;
}

export function createBot({ config, logger, classifier }: BotDeps): Bot {
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

    try {
      const classification = await classifier.classify(text);
      const decision = decide(classification, config.confidenceThreshold);

      logger.info('classified', {
        chatId: incoming.chatId,
        userId: incoming.userId,
        username: incoming.username,
        messageId: incoming.messageId,
        text: truncate(incoming.text, 200),
        class: classification.class,
        confidence: Number(classification.confidence.toFixed(3)),
        reasoning: classification.reasoning,
        action: decision.action,
        rationale: decision.rationale,
      });
    } catch (err) {
      logger.error('classification failed', {
        chatId: incoming.chatId,
        messageId: incoming.messageId,
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
