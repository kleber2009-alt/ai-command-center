import type { Db } from './index.js';
import { nowIso } from './index.js';

export interface ChatState {
  chatId: number;
  title: string | undefined;
  autoReply: boolean;
}

export interface ChatService {
  // Upserts the chat row and returns the current state. The bot reads
  // auto_reply on every message to honor the per-chat kill switch the
  // admin UI flips.
  touch(chatId: number, title: string | undefined): ChatState;
  listAll(): Array<ChatRowAggregated>;
  setAutoReply(chatId: number, value: boolean): ChatState | null;
}

export interface ChatRowAggregated {
  chat_id: number;
  title: string | null;
  auto_reply: number;
  created_at: string;
  updated_at: string;
  total_messages: number;
  hot_leads: number;
  last_message_at: string | null;
}

export function createChatService(db: Db): ChatService {
  const upsertStmt = db.prepare(`
    INSERT INTO tg_chats (chat_id, title, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(chat_id) DO UPDATE SET
      title = COALESCE(excluded.title, tg_chats.title),
      updated_at = excluded.updated_at
    RETURNING chat_id, title, auto_reply
  `);

  const listStmt = db.prepare(`
    SELECT
      c.chat_id,
      c.title,
      c.auto_reply,
      c.created_at,
      c.updated_at,
      COALESCE(m.total_messages, 0) AS total_messages,
      COALESCE(m.last_message_at, NULL) AS last_message_at,
      COALESCE(u.hot_leads, 0) AS hot_leads
    FROM tg_chats c
    LEFT JOIN (
      SELECT chat_id,
             COUNT(*) AS total_messages,
             MAX(created_at) AS last_message_at
      FROM tg_messages
      GROUP BY chat_id
    ) m ON m.chat_id = c.chat_id
    LEFT JOIN (
      SELECT chat_id,
             SUM(CASE WHEN status IN ('hot', 'buyer') THEN 1 ELSE 0 END) AS hot_leads
      FROM tg_users
      GROUP BY chat_id
    ) u ON u.chat_id = c.chat_id
    ORDER BY c.updated_at DESC
  `);

  const setAutoReplyStmt = db.prepare(`
    UPDATE tg_chats
    SET auto_reply = ?, updated_at = ?
    WHERE chat_id = ?
    RETURNING chat_id, title, auto_reply
  `);

  return {
    touch(chatId, title): ChatState {
      const row = upsertStmt.get(chatId, title ?? null, nowIso()) as
        | { chat_id: number; title: string | null; auto_reply: number }
        | undefined;
      if (!row) {
        return { chatId, title, autoReply: true };
      }
      return {
        chatId: Number(row.chat_id),
        title: row.title ?? undefined,
        autoReply: Boolean(row.auto_reply),
      };
    },

    listAll(): Array<ChatRowAggregated> {
      return listStmt.all() as Array<ChatRowAggregated>;
    },

    setAutoReply(chatId, value): ChatState | null {
      const row = setAutoReplyStmt.get(value ? 1 : 0, nowIso(), chatId) as
        | { chat_id: number; title: string | null; auto_reply: number }
        | undefined;
      if (!row) return null;
      return {
        chatId: Number(row.chat_id),
        title: row.title ?? undefined,
        autoReply: Boolean(row.auto_reply),
      };
    },
  };
}
