import type { Db } from './index.js';
import { nowIso } from './index.js';

export type DealStage = 'lead' | 'demo' | 'offer' | 'client' | 'lost';

export interface DealRow {
  id: number;
  chat_id: number;
  user_id: number;
  stage: DealStage;
  notes: string;
  amount: number | null;
  created_at: string;
  updated_at: string;
  // joined
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  last_seen_at: string | null;
  chat_title: string | null;
}

export interface ContactOption {
  chat_id: number;
  user_id: number;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  chat_title: string | null;
  has_deal: number;
}

export interface DealService {
  listAll(): DealRow[];
  create(chatId: number, userId: number): DealRow;
  updateStage(id: number, stage: DealStage): DealRow | null;
  updateNotes(id: number, notes: string): DealRow | null;
  updateAmount(id: number, amount: number | null): DealRow | null;
  remove(id: number): void;
  listContacts(): ContactOption[];
}

const JOIN = `
  SELECT d.*,
         u.username, u.first_name, u.last_name, u.last_seen_at,
         c.title AS chat_title
  FROM tg_deals d
  LEFT JOIN tg_users u ON u.chat_id = d.chat_id AND u.user_id = d.user_id
  LEFT JOIN tg_chats c ON c.chat_id = d.chat_id
`;

export function createDealService(db: Db): DealService {
  const listAllStmt = db.prepare(JOIN + `ORDER BY d.stage, d.updated_at DESC`);

  const getByIdStmt = db.prepare(JOIN + `WHERE d.id = ?`);

  const upsertStmt = db.prepare(`
    INSERT INTO tg_deals (chat_id, user_id, stage, created_at, updated_at)
    VALUES (?, ?, 'lead', ?, ?)
    ON CONFLICT(chat_id, user_id) DO NOTHING
  `);

  const getByUserStmt = db.prepare(JOIN + `WHERE d.chat_id = ? AND d.user_id = ?`);

  const updateStageStmt = db.prepare(
    `UPDATE tg_deals SET stage = ?, updated_at = ? WHERE id = ?`,
  );
  const updateNotesStmt = db.prepare(
    `UPDATE tg_deals SET notes = ?, updated_at = ? WHERE id = ?`,
  );
  const updateAmountStmt = db.prepare(
    `UPDATE tg_deals SET amount = ?, updated_at = ? WHERE id = ?`,
  );
  const removeStmt = db.prepare(`DELETE FROM tg_deals WHERE id = ?`);

  const listContactsStmt = db.prepare(`
    SELECT u.chat_id, u.user_id, u.username, u.first_name, u.last_name,
           c.title AS chat_title,
           CASE WHEN d.id IS NOT NULL THEN 1 ELSE 0 END AS has_deal
    FROM tg_users u
    LEFT JOIN tg_chats c ON c.chat_id = u.chat_id
    LEFT JOIN tg_deals d ON d.chat_id = u.chat_id AND d.user_id = u.user_id
    ORDER BY u.last_seen_at DESC
    LIMIT 200
  `);

  return {
    listAll(): DealRow[] {
      return listAllStmt.all() as DealRow[];
    },

    create(chatId, userId): DealRow {
      const now = nowIso();
      upsertStmt.run(chatId, userId, now, now);
      return getByUserStmt.get(chatId, userId) as DealRow;
    },

    updateStage(id, stage): DealRow | null {
      updateStageStmt.run(stage, nowIso(), id);
      return (getByIdStmt.get(id) as DealRow) ?? null;
    },

    updateNotes(id, notes): DealRow | null {
      updateNotesStmt.run(notes, nowIso(), id);
      return (getByIdStmt.get(id) as DealRow) ?? null;
    },

    updateAmount(id, amount): DealRow | null {
      updateAmountStmt.run(amount, nowIso(), id);
      return (getByIdStmt.get(id) as DealRow) ?? null;
    },

    remove(id): void {
      removeStmt.run(id);
    },

    listContacts(): ContactOption[] {
      return listContactsStmt.all() as ContactOption[];
    },
  };
}
