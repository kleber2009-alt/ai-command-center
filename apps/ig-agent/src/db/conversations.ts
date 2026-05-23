import { query, type DbPool } from './index.js';

export type ConversationStatus = 'active' | 'closed' | 'escalated';
export type Outcome = 'sale' | 'no_sale' | 'abandoned' | 'escalated';

export interface Conversation {
  id: string;
  contact_id: string;
  status: ConversationStatus;
  ai_handled: boolean;
  human_takeover_at: string | null;
  outcome: Outcome | null;
  sale_amount: string | null;
  started_at: string;
  closed_at: string | null;
}

export interface ConversationService {
  // Returns the active conversation for this contact, creating one if none.
  ensureActive(contactId: string): Promise<Conversation>;
  byContact(contactId: string): Promise<Conversation[]>;
  setAiHandled(contactId: string, aiHandled: boolean): Promise<void>;
  close(id: string, outcome: Outcome | null, saleAmount?: number | null): Promise<void>;
}

export function createConversationService(pool: DbPool): ConversationService {
  return {
    async ensureActive(contactId) {
      const existing = await query<Conversation>(
        pool,
        "SELECT * FROM conversations WHERE contact_id = $1 AND status = 'active' LIMIT 1",
        [contactId],
      );
      if (existing[0]) return existing[0];
      const rows = await query<Conversation>(
        pool,
        `INSERT INTO conversations (contact_id) VALUES ($1) RETURNING *`,
        [contactId],
      );
      const row = rows[0];
      if (!row) throw new Error('conversations insert returned no rows');
      return row;
    },

    async byContact(contactId) {
      return query<Conversation>(
        pool,
        'SELECT * FROM conversations WHERE contact_id = $1 ORDER BY started_at DESC',
        [contactId],
      );
    },

    async setAiHandled(contactId, aiHandled) {
      await query(
        pool,
        `UPDATE conversations
           SET ai_handled = $2,
               human_takeover_at = CASE
                 WHEN $2 = false AND human_takeover_at IS NULL THEN NOW()
                 WHEN $2 = true THEN NULL
                 ELSE human_takeover_at
               END
         WHERE contact_id = $1 AND status = 'active'`,
        [contactId, aiHandled],
      );
    },

    async close(id, outcome, saleAmount = null) {
      await query(
        pool,
        `UPDATE conversations
           SET status = 'closed',
               outcome = $2,
               sale_amount = $3,
               closed_at = NOW()
         WHERE id = $1`,
        [id, outcome, saleAmount],
      );
    },
  };
}
