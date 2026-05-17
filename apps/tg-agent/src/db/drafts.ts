import type { Db } from './index.js';
import { nowIso } from './index.js';
import type { MessageClass } from '../types.js';

export type DraftStatus = 'pending' | 'editing' | 'sent' | 'deleted';

export interface DraftRow {
  id: number;
  chat_id: number;
  user_id: number | null;
  original_message_id: number;
  message_class: MessageClass | null;
  draft_text: string;
  status: DraftStatus;
  owner_dm_message_id: number | null;
  edit_prompt_message_id: number | null;
  sent_reply_text: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateDraftInput {
  chatId: number;
  userId: number | undefined;
  originalMessageId: number;
  messageClass: MessageClass;
  draftText: string;
}

export interface DraftService {
  create(input: CreateDraftInput): DraftRow;
  findById(id: number): DraftRow | null;
  findByEditPrompt(messageId: number): DraftRow | null;
  listRecent(limit: number, status: DraftStatus | undefined): DraftRow[];

  // Stores the DM message_id that carries the inline keyboard. Called
  // right after the bot sends the draft notification.
  attachOwnerDm(id: number, dmMessageId: number): void;

  // Atomic transitions. Each returns true if it actually changed a
  // row, false if the draft was already in another state — that's how
  // we defend against double-tapped buttons.
  markEditing(id: number, editPromptMessageId: number): boolean;
  markSent(id: number, sentReplyText: string): boolean;
  markDeleted(id: number): boolean;
}

export function createDraftService(db: Db): DraftService {
  const insertStmt = db.prepare(`
    INSERT INTO tg_drafts (
      chat_id, user_id, original_message_id, message_class, draft_text
    )
    VALUES (?, ?, ?, ?, ?)
    RETURNING id, chat_id, user_id, original_message_id, message_class,
              draft_text, status, owner_dm_message_id,
              edit_prompt_message_id, sent_reply_text,
              created_at, updated_at
  `);

  const findByIdStmt = db.prepare(`
    SELECT id, chat_id, user_id, original_message_id, message_class,
           draft_text, status, owner_dm_message_id,
           edit_prompt_message_id, sent_reply_text,
           created_at, updated_at
    FROM tg_drafts
    WHERE id = ?
  `);

  const findByEditPromptStmt = db.prepare(`
    SELECT id, chat_id, user_id, original_message_id, message_class,
           draft_text, status, owner_dm_message_id,
           edit_prompt_message_id, sent_reply_text,
           created_at, updated_at
    FROM tg_drafts
    WHERE edit_prompt_message_id = ?
      AND status = 'editing'
    ORDER BY created_at DESC
    LIMIT 1
  `);

  const attachDmStmt = db.prepare(`
    UPDATE tg_drafts
    SET owner_dm_message_id = ?, updated_at = ?
    WHERE id = ?
  `);

  const markEditingStmt = db.prepare(`
    UPDATE tg_drafts
    SET status = 'editing',
        edit_prompt_message_id = ?,
        updated_at = ?
    WHERE id = ? AND status = 'pending'
  `);

  const markSentStmt = db.prepare(`
    UPDATE tg_drafts
    SET status = 'sent',
        sent_reply_text = ?,
        updated_at = ?
    WHERE id = ? AND status IN ('pending', 'editing')
  `);

  const markDeletedStmt = db.prepare(`
    UPDATE tg_drafts
    SET status = 'deleted',
        updated_at = ?
    WHERE id = ? AND status IN ('pending', 'editing')
  `);

  const listAllStmt = db.prepare(`
    SELECT id, chat_id, user_id, original_message_id, message_class,
           draft_text, status, owner_dm_message_id,
           edit_prompt_message_id, sent_reply_text,
           created_at, updated_at
    FROM tg_drafts
    ORDER BY created_at DESC
    LIMIT ?
  `);

  const listByStatusStmt = db.prepare(`
    SELECT id, chat_id, user_id, original_message_id, message_class,
           draft_text, status, owner_dm_message_id,
           edit_prompt_message_id, sent_reply_text,
           created_at, updated_at
    FROM tg_drafts
    WHERE status = ?
    ORDER BY created_at DESC
    LIMIT ?
  `);

  return {
    create(input): DraftRow {
      return insertStmt.get(
        input.chatId,
        input.userId ?? null,
        input.originalMessageId,
        input.messageClass,
        input.draftText,
      ) as DraftRow;
    },

    findById(id): DraftRow | null {
      const row = findByIdStmt.get(id) as DraftRow | undefined;
      return row ?? null;
    },

    findByEditPrompt(messageId): DraftRow | null {
      const row = findByEditPromptStmt.get(messageId) as DraftRow | undefined;
      return row ?? null;
    },

    listRecent(limit, status): DraftRow[] {
      if (status) {
        return listByStatusStmt.all(status, limit) as DraftRow[];
      }
      return listAllStmt.all(limit) as DraftRow[];
    },

    attachOwnerDm(id, dmMessageId): void {
      attachDmStmt.run(dmMessageId, nowIso(), id);
    },

    markEditing(id, editPromptMessageId): boolean {
      const result = markEditingStmt.run(editPromptMessageId, nowIso(), id);
      return result.changes > 0;
    },

    markSent(id, sentReplyText): boolean {
      const result = markSentStmt.run(sentReplyText, nowIso(), id);
      return result.changes > 0;
    },

    markDeleted(id): boolean {
      const result = markDeletedStmt.run(nowIso(), id);
      return result.changes > 0;
    },
  };
}
