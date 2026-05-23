import { query, type DbPool } from './index.js';

export type Direction = 'incoming' | 'outgoing';
export type Source = 'user' | 'ai_agent' | 'manual' | 'flow';

export interface Message {
  id: string;
  contact_id: string;
  direction: Direction;
  source: Source;
  text: string | null;
  media_url: string | null;
  media_type: string | null;
  ai_model: string | null;
  ai_prompt_version: string | null;
  ai_tokens_used: number | null;
  ai_confidence: number | null;
  intent: string | null;
  sentiment: string | null;
  sendpulse_message_id: string | null;
  raw_payload: Record<string, unknown> | null;
  created_at: string;
}

export interface InsertMessageInput {
  contactId: string;
  direction: Direction;
  source: Source;
  text?: string | null;
  mediaUrl?: string | null;
  mediaType?: string | null;
  aiModel?: string | null;
  aiPromptVersion?: string | null;
  aiTokensUsed?: number | null;
  aiConfidence?: number | null;
  intent?: string | null;
  sentiment?: string | null;
  sendpulseMessageId?: string | null;
  rawPayload?: unknown;
}

export interface MessageStore {
  insert(input: InsertMessageInput): Promise<Message>;
  listForContact(contactId: string, limit?: number): Promise<Message[]>;
  recentForContact(contactId: string, limit: number): Promise<Message[]>;
}

export function createMessageStore(pool: DbPool): MessageStore {
  return {
    async insert(input) {
      const rows = await query<Message>(
        pool,
        `INSERT INTO messages (
           contact_id, direction, source,
           text, media_url, media_type,
           ai_model, ai_prompt_version, ai_tokens_used, ai_confidence,
           intent, sentiment,
           sendpulse_message_id, raw_payload
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         RETURNING *`,
        [
          input.contactId,
          input.direction,
          input.source,
          input.text ?? null,
          input.mediaUrl ?? null,
          input.mediaType ?? null,
          input.aiModel ?? null,
          input.aiPromptVersion ?? null,
          input.aiTokensUsed ?? null,
          input.aiConfidence ?? null,
          input.intent ?? null,
          input.sentiment ?? null,
          input.sendpulseMessageId ?? null,
          input.rawPayload === undefined ? null : JSON.stringify(input.rawPayload),
        ],
      );
      const row = rows[0];
      if (!row) throw new Error('messages insert returned no rows');
      return row;
    },

    async listForContact(contactId, limit = 200) {
      return query<Message>(
        pool,
        'SELECT * FROM messages WHERE contact_id = $1 ORDER BY created_at ASC LIMIT $2',
        [contactId, limit],
      );
    },

    async recentForContact(contactId, limit) {
      // Pull newest first so the LIMIT clips to the most recent N, then
      // reverse to chronological order for the LLM context window.
      const rows = await query<Message>(
        pool,
        'SELECT * FROM messages WHERE contact_id = $1 ORDER BY created_at DESC LIMIT $2',
        [contactId, limit],
      );
      return rows.reverse();
    },
  };
}
