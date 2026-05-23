import { query, type DbPool } from './index.js';

export type RecommendationType = 'next_message' | 'action' | 'segment_change' | 'warning';
export type RecommendationPriority = 'low' | 'normal' | 'high';

export interface AiRecommendation {
  id: string;
  contact_id: string;
  conversation_id: string | null;
  type: RecommendationType | null;
  content: string;
  priority: RecommendationPriority;
  applied: boolean;
  created_at: string;
}

export interface RecommendationInput {
  contactId: string;
  conversationId?: string | null;
  type?: RecommendationType | null;
  content: string;
  priority?: RecommendationPriority;
}

export interface RecommendationStore {
  insert(input: RecommendationInput): Promise<AiRecommendation>;
  forContact(contactId: string, limit?: number): Promise<AiRecommendation[]>;
  markApplied(id: string): Promise<void>;
  count(): Promise<number>;
}

export function createRecommendationStore(pool: DbPool): RecommendationStore {
  return {
    async insert(input) {
      const rows = await query<AiRecommendation>(
        pool,
        `INSERT INTO ai_recommendations (contact_id, conversation_id, type, content, priority)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [
          input.contactId,
          input.conversationId ?? null,
          input.type ?? null,
          input.content,
          input.priority ?? 'normal',
        ],
      );
      const row = rows[0];
      if (!row) throw new Error('ai_recommendations insert returned no rows');
      return row;
    },

    async forContact(contactId, limit = 50) {
      return query<AiRecommendation>(
        pool,
        'SELECT * FROM ai_recommendations WHERE contact_id = $1 ORDER BY created_at DESC LIMIT $2',
        [contactId, limit],
      );
    },

    async markApplied(id) {
      await query(pool, 'UPDATE ai_recommendations SET applied = true WHERE id = $1', [id]);
    },

    async count() {
      const rows = await query<{ n: string }>(pool, 'SELECT COUNT(*)::text AS n FROM ai_recommendations');
      return Number(rows[0]?.n ?? 0);
    },
  };
}
