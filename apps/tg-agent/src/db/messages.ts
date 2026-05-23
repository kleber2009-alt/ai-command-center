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
  // Returns the auto-incremented `id` of the inserted row so callers
  // (e.g. memory indexer) can pin it as a stable point ID.
  log(record: MessageLogRecord): number;
  listForChat(chatId: number, limit: number): MessageRow[];
  listForInsights(chatIds: number[], days: number, limit: number): Array<Pick<MessageRow, 'text' | 'class'>>;
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
    log(record): number {
      const r = insertStmt.run(
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
      return Number(r.lastInsertRowid);
    },

    listForChat(chatId, limit): MessageRow[] {
      return listStmt.all(chatId, limit) as MessageRow[];
    },

    listForInsights(chatIds: number[], days: number, limit: number): Array<Pick<MessageRow, 'text' | 'class'>> {
      if (chatIds.length === 0) return [];
      const ph = chatIds.map(() => '?').join(',');
      const q = db.prepare(`SELECT text, class FROM tg_messages WHERE chat_id IN (${ph}) AND created_at >= datetime('now', ?) ORDER BY created_at DESC LIMIT ?`);
      return q.all(...chatIds, `-${days} days`, limit) as Array<Pick<MessageRow, 'text' | 'class'>>;
    },
  };
}
