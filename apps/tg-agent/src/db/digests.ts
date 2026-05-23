import type { Db } from './index.js';
import { nowIso } from './index.js';

// A single `tg_messages` row reduced to the fields the digest
// generator needs. Joined with tg_users so the model sees who said
// what, not just an opaque user_id.
export interface MessageForDigest {
  created_at: string;
  user_id: number | null;
  username: string | null;
  first_name: string | null;
  text: string;
  class: string | null;
}

export interface DigestPayload {
  // 2-3 Russian sentences with the big picture. The bot prints this
  // before the structured sections so the owner can stop reading
  // after one paragraph if the chat was uneventful.
  gist: string;
  topics: string[];
  // "What was asked + who asked (when known)". Open = unanswered or
  // answered insufficiently in the window.
  open_questions: string[];
  decisions: string[];
  // Lines that tie to the owner's project_context (set via /context).
  // Empty when no context is configured.
  project_signals: string[];
  // People worth a direct DM, with the reason: "@user — спросил
  // про X, не ответили".
  follow_ups: string[];
  links: string[];
  // The "do not miss" channel — soft objections, dropped threads,
  // competitor mentions, hints of churn, tone shifts.
  blind_spots: string[];
}

export interface DigestRow {
  id: number;
  chat_id: number;
  chat_title: string | null;
  window_hours: number;
  generated_at: string;
  messages_count: number;
  payload_json: string;
  summary_md: string;
  delivered_at: string | null;
}

export interface ChatContextRow {
  chat_id: number;
  summary: string;
  custom_instructions: string;
  context_updated_at: string | null;
}

export interface DigestStore {
  listRecentMessages(
    chatId: number,
    sinceIso: string,
    limit: number,
  ): MessageForDigest[];
  saveDigest(input: {
    chatId: number;
    chatTitle: string | undefined;
    windowHours: number;
    messagesCount: number;
    payload: DigestPayload;
    summaryMd: string;
  }): DigestRow;
  markDelivered(id: number): void;
  latestForChat(chatId: number): DigestRow | null;
  latestPerChat(): DigestRow[];
  historyForChat(chatId: number, limit: number): DigestRow[];
  getById(id: number): DigestRow | null;
  getContext(chatId: number): ChatContextRow | null;
  upsertContextSummary(chatId: number, summary: string): void;
  setCustomInstructions(chatId: number, instructions: string): void;
}

export function createDigestStore(db: Db): DigestStore {
  const listMessagesStmt = db.prepare(`
    SELECT
      m.created_at,
      m.user_id,
      u.username,
      u.first_name,
      m.text,
      m.class
    FROM tg_messages m
    LEFT JOIN tg_users u
      ON u.chat_id = m.chat_id AND u.user_id = m.user_id
    WHERE m.chat_id = ? AND m.created_at >= ?
    ORDER BY m.created_at ASC
    LIMIT ?
  `);

  const insertDigestStmt = db.prepare(`
    INSERT INTO tg_digests (
      chat_id, chat_title, window_hours, messages_count,
      payload_json, summary_md
    )
    VALUES (?, ?, ?, ?, ?, ?)
    RETURNING id, chat_id, chat_title, window_hours, generated_at,
              messages_count, payload_json, summary_md, delivered_at
  `);

  const markDeliveredStmt = db.prepare(`
    UPDATE tg_digests SET delivered_at = ? WHERE id = ?
  `);

  const latestStmt = db.prepare(`
    SELECT id, chat_id, chat_title, window_hours, generated_at,
           messages_count, payload_json, summary_md, delivered_at
    FROM tg_digests
    WHERE chat_id = ?
    ORDER BY generated_at DESC
    LIMIT 1
  `);

  // Latest digest for every chat, one row per chat, newest first.
  const latestPerChatStmt = db.prepare(`
    SELECT d.id, d.chat_id, d.chat_title, d.window_hours, d.generated_at,
           d.messages_count, d.payload_json, d.summary_md, d.delivered_at
    FROM tg_digests d
    JOIN (
      SELECT chat_id, MAX(generated_at) AS max_at
      FROM tg_digests
      GROUP BY chat_id
    ) m ON m.chat_id = d.chat_id AND m.max_at = d.generated_at
    ORDER BY d.generated_at DESC
  `);

  const historyStmt = db.prepare(`
    SELECT id, chat_id, chat_title, window_hours, generated_at,
           messages_count, payload_json, summary_md, delivered_at
    FROM tg_digests
    WHERE chat_id = ?
    ORDER BY generated_at DESC
    LIMIT ?
  `);

  const byIdStmt = db.prepare(`
    SELECT id, chat_id, chat_title, window_hours, generated_at,
           messages_count, payload_json, summary_md, delivered_at
    FROM tg_digests
    WHERE id = ?
  `);

  const getContextStmt = db.prepare(`
    SELECT chat_id, summary, custom_instructions, context_updated_at
    FROM tg_chat_context WHERE chat_id = ?
  `);

  // tg_chat_context already exists on prod with extra columns (topics,
  // sentiment, tasks, decisions, notes). We only touch the two we own.
  const upsertContextSummaryStmt = db.prepare(`
    INSERT INTO tg_chat_context (chat_id, summary, context_updated_at, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(chat_id) DO UPDATE SET
      summary = excluded.summary,
      context_updated_at = excluded.context_updated_at,
      updated_at = excluded.updated_at
  `);

  const setInstructionsStmt = db.prepare(`
    INSERT INTO tg_chat_context (chat_id, custom_instructions, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(chat_id) DO UPDATE SET
      custom_instructions = excluded.custom_instructions,
      updated_at = excluded.updated_at
  `);

  return {
    listRecentMessages(chatId, sinceIso, limit): MessageForDigest[] {
      return listMessagesStmt.all(chatId, sinceIso, limit) as MessageForDigest[];
    },
    saveDigest(input): DigestRow {
      const row = insertDigestStmt.get(
        input.chatId,
        input.chatTitle ?? null,
        input.windowHours,
        input.messagesCount,
        JSON.stringify(input.payload),
        input.summaryMd,
      ) as DigestRow;
      return row;
    },
    markDelivered(id): void {
      markDeliveredStmt.run(nowIso(), id);
    },
    latestForChat(chatId): DigestRow | null {
      const row = latestStmt.get(chatId) as DigestRow | undefined;
      return row ?? null;
    },
    latestPerChat(): DigestRow[] {
      return latestPerChatStmt.all() as DigestRow[];
    },
    historyForChat(chatId, limit): DigestRow[] {
      return historyStmt.all(chatId, limit) as DigestRow[];
    },
    getById(id): DigestRow | null {
      const row = byIdStmt.get(id) as DigestRow | undefined;
      return row ?? null;
    },
    getContext(chatId): ChatContextRow | null {
      const row = getContextStmt.get(chatId) as ChatContextRow | undefined;
      return row ?? null;
    },
    upsertContextSummary(chatId, summary): void {
      const now = nowIso();
      upsertContextSummaryStmt.run(chatId, summary, now, now);
    },
    setCustomInstructions(chatId, instructions): void {
      setInstructionsStmt.run(chatId, instructions, nowIso());
    },
  };
}
