import type { Db } from './index.js';
import { nowIso } from './index.js';
import type { LeadStatus, MessageClass } from '../types.js';

// Commercial track ranking — climbs in one direction. 'support' and
// 'negative' are orthogonal terminal labels, not part of the rank.
const COMMERCIAL_RANK: Record<LeadStatus, number> = {
  new: 0,
  cold: 1,
  warm: 2,
  hot: 3,
  buyer: 4,
  support: -1,
  negative: -1,
};

// Per-class status target on the commercial track.
const CLASS_TARGET: Partial<Record<MessageClass, LeadStatus>> = {
  GENERAL_CHAT: 'cold',
  QUESTION: 'warm',
  PRODUCT_INTEREST: 'warm',
  PRICE_REQUEST: 'hot',
  OBJECTION: 'hot',
  BUYING_INTENT: 'buyer',
};

// Decide the new status. Rules:
// - 'negative' is sticky: once set, the auto rules never change it
//   (manual override only).
// - SUPPORT_REQUEST sets 'support' unless already 'buyer'.
// - NEGATIVE sets 'negative'.
// - Otherwise climb the commercial track. Never downgrade.
export function nextLeadStatus(current: LeadStatus, cls: MessageClass): LeadStatus {
  if (current === 'negative') return current;
  if (cls === 'NEGATIVE') return 'negative';
  if (cls === 'SUPPORT_REQUEST') {
    return current === 'buyer' ? 'buyer' : 'support';
  }

  const target = CLASS_TARGET[cls];
  if (!target) return current; // SPAM, OWNER_REQUEST → no commercial change
  const currentRank = COMMERCIAL_RANK[current];
  const targetRank = COMMERCIAL_RANK[target];
  if (currentRank < 0) return current;
  return targetRank > currentRank ? target : current;
}

export interface UserContext {
  chatId: number;
  userId: number;
  username: string | undefined;
  firstName: string | undefined;
  lastName: string | undefined;
}

export interface LeadUpdate {
  status: LeadStatus;
  previousStatus: LeadStatus;
  changed: boolean;
}

export interface UserRow {
  chat_id: number;
  user_id: number;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  status: LeadStatus;
  status_updated_at: string;
  last_seen_at: string;
  created_at: string;
}

export interface LeadService {
  touchAndClassify(user: UserContext, cls: MessageClass): LeadUpdate;
  listForChat(chatId: number): UserRow[];
}

export function createLeadService(db: Db): LeadService {
  const readStmt = db.prepare(
    `SELECT status FROM tg_users WHERE chat_id = ? AND user_id = ?`,
  );
  const upsertStmt = db.prepare(`
    INSERT INTO tg_users (
      chat_id, user_id, username, first_name, last_name,
      status, status_updated_at, last_seen_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(chat_id, user_id) DO UPDATE SET
      username = excluded.username,
      first_name = excluded.first_name,
      last_name = excluded.last_name,
      status = excluded.status,
      status_updated_at = CASE
        WHEN tg_users.status != excluded.status THEN excluded.status_updated_at
        ELSE tg_users.status_updated_at
      END,
      last_seen_at = excluded.last_seen_at
  `);
  const listStmt = db.prepare(`
    SELECT chat_id, user_id, username, first_name, last_name,
           status, status_updated_at, last_seen_at, created_at
    FROM tg_users
    WHERE chat_id = ?
    ORDER BY last_seen_at DESC
  `);

  return {
    touchAndClassify(user, cls): LeadUpdate {
      const existing = readStmt.get(user.chatId, user.userId) as
        | { status: LeadStatus }
        | undefined;
      const previousStatus: LeadStatus = existing?.status ?? 'new';
      const newStatus = nextLeadStatus(previousStatus, cls);
      const now = nowIso();

      upsertStmt.run(
        user.chatId,
        user.userId,
        user.username ?? null,
        user.firstName ?? null,
        user.lastName ?? null,
        newStatus,
        now,
        now,
      );

      return {
        status: newStatus,
        previousStatus,
        changed: newStatus !== previousStatus,
      };
    },

    listForChat(chatId): UserRow[] {
      return listStmt.all(chatId) as UserRow[];
    },
  };
}
