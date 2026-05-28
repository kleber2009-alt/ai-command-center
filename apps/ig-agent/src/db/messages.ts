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
  // Backfill path overrides this so historic messages retain their original
  // SendPulse timestamp. Live webhook inserts omit it and get NOW().
  createdAt?: string | Date | null;
}

export interface MessageStats {
  total: number;
  incoming: number;
  outgoing: number;
  last_24h: number;
  last_7d: number;
  tokens_24h: number;
  tokens_7d: number;
}

export interface MessageStore {
  insert(input: InsertMessageInput): Promise<Message>;
  listForContact(contactId: string, limit?: number): Promise<Message[]>;
  recentForContact(contactId: string, limit: number): Promise<Message[]>;
  updateAnalysis(id: string, intent: string | null, sentiment: string | null): Promise<void>;
  stats(): Promise<MessageStats>;
  // Dedup helper for Meta's is_echo events — we re-receive every outbound
  // message as a webhook and must not insert duplicates of rows the
  // responder/manual-reply paths already persisted.
  existsBySendpulseMessageId(id: string): Promise<boolean>;
}

export function createMessageStore(pool: DbPool): MessageStore {
  return {
    async insert(input) {
      const createdAt =
        input.createdAt instanceof Date
          ? input.createdAt.toISOString()
          : input.createdAt ?? null;
      const rows = await query<Message>(
        pool,
        `INSERT INTO messages (
           contact_id, direction, source,
           text, media_url, media_type,
           ai_model, ai_prompt_version, ai_tokens_used, ai_confidence,
           intent, sentiment,
           sendpulse_message_id, raw_payload, created_at
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,COALESCE($15::timestamptz, NOW()))
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
          createdAt,
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

    async updateAnalysis(id, intent, sentiment) {
      await query(
        pool,
        'UPDATE messages SET intent = COALESCE($2, intent), sentiment = COALESCE($3, sentiment) WHERE id = $1',
        [id, intent, sentiment],
      );
    },

    async existsBySendpulseMessageId(id) {
      const rows = await query<{ exists: boolean }>(
        pool,
        'SELECT EXISTS (SELECT 1 FROM messages WHERE sendpulse_message_id = $1) AS exists',
        [id],
      );
      return rows[0]?.exists === true;
    },

    async stats() {
      const rows = await query<{
        total: string;
        incoming: string;
        outgoing: string;
        last_24h: string;
        last_7d: string;
        tokens_24h: string | null;
        tokens_7d: string | null;
      }>(
        pool,
        `SELECT
           COUNT(*)::text AS total,
           COUNT(*) FILTER (WHERE direction = 'incoming')::text AS incoming,
           COUNT(*) FILTER (WHERE direction = 'outgoing')::text AS outgoing,
           COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '1 day')::text AS last_24h,
           COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::text AS last_7d,
           COALESCE(SUM(ai_tokens_used) FILTER (WHERE created_at >= NOW() - INTERVAL '1 day'), 0)::text AS tokens_24h,
           COALESCE(SUM(ai_tokens_used) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days'), 0)::text AS tokens_7d
         FROM messages`,
      );
      const r = rows[0] ?? {
        total: '0', incoming: '0', outgoing: '0',
        last_24h: '0', last_7d: '0', tokens_24h: '0', tokens_7d: '0',
      };
      return {
        total: Number(r.total),
        incoming: Number(r.incoming),
        outgoing: Number(r.outgoing),
        last_24h: Number(r.last_24h),
        last_7d: Number(r.last_7d),
        tokens_24h: Number(r.tokens_24h ?? 0),
        tokens_7d: Number(r.tokens_7d ?? 0),
      };
    },
  };
}
