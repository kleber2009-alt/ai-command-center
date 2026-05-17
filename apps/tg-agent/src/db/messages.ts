import type { Db } from './index.js';
import type { Action, MessageClass, MessageLogRecord } from '../types.js';

export interface MessageRow {
  id: number;
  chat_id: number;
  user_id: number | null;
  telegram_message_id: number;
  text: string;
  class: MessageClass | null;
  confidence: number | null;
  action: Action | null;
  reasoning: string | null;
  response: string | null;
  created_at: string;
}

export interface MessageStore {
  log(record: MessageLogRecord): void;
  listForChat(chatId: number, limit: number): MessageRow[];
}

export function createMessageStore(db: Db): MessageStore {
  const insertStmt = db.prepare(`
    INSERT INTO tg_messages (
      chat_id, user_id, telegram_message_id, text,
      class, confidence, action, reasoning, response
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const listStmt = db.prepare(`
    SELECT id, chat_id, user_id, telegram_message_id, text,
           class, confidence, action, reasoning, response, created_at
    FROM tg_messages
    WHERE chat_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `);

  return {
    log(record): void {
      insertStmt.run(
        record.chatId,
        record.userId ?? null,
        record.telegramMessageId,
        record.text,
        record.class,
        record.confidence,
        record.action,
        record.reasoning,
        record.response,
      );
    },

    listForChat(chatId, limit): MessageRow[] {
      return listStmt.all(chatId, limit) as MessageRow[];
    },
  };
}
