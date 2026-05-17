import type { Db } from './index.js';
import type { Logger } from '../logger.js';
import type { MessageLogRecord } from '../types.js';

export interface MessageStore {
  log(record: MessageLogRecord): Promise<void>;
}

export function createMessageStore(db: Db, logger: Logger): MessageStore {
  return {
    async log(record): Promise<void> {
      if (!db) return;

      const { error } = await db.from('tg_messages').insert({
        chat_id: record.chatId,
        user_id: record.userId ?? null,
        telegram_message_id: record.telegramMessageId,
        text: record.text,
        class: record.class,
        confidence: record.confidence,
        action: record.action,
        reasoning: record.reasoning,
        response: record.response,
      });

      if (error) {
        logger.error('message insert failed', {
          chatId: record.chatId,
          messageId: record.telegramMessageId,
          error: error.message,
        });
      }
    },
  };
}
