import { query, type DbPool } from './index.js';
import type { Message } from './messages.js';

// Structured payload returned by the digest generator. Mirrors the
// tool-use schema so the model has a single source of truth and the
// rendered card has predictable sections.
export interface DigestPayload {
  gist: string;
  topics: string[];
  open_questions: string[];
  decisions: string[];
  follow_ups: string[];
  links: string[];
  blind_spots: string[];
}

// Subset of `messages` columns the LLM needs. We don't ship media URLs,
// raw_payload or AI metadata — keeps the transcript tight and the
// token bill predictable.
export interface MessageForDigest {
  id: string;
  contact_id: string;
  direction: 'incoming' | 'outgoing';
  source: 'user' | 'ai_agent' | 'manual' | 'flow';
  text: string;
  created_at: string;
}

export interface DigestRow {
  id: string;
  contact_id: string;
  window_hours: number;
  generated_at: string;
  messages_count: number;
  payload_json: DigestPayload;
  summary_md: string;
  delivered_at: string | null;
}

// One contact + the meta we need to render a header on each digest card.
export interface ContactForDigest {
  id: string;
  ig_username: string | null;
  first_name: string | null;
  last_name: string | null;
  lead_status: string | null;
}

export interface SaveDigestInput {
  contactId: string;
  windowHours: number;
  messagesCount: number;
  payload: DigestPayload;
  summaryMd: string;
}

// Digest row joined with the contact header so the admin UI can render
// each card with one query instead of N+1 lookups.
export interface DigestWithContact extends DigestRow {
  contact: ContactForDigest;
}

export interface DigestStore {
  // Per-contact transcript for the digest window. Strips messages with
  // no text (media-only) since the LLM has nothing to reason about.
  listRecentMessages(
    contactId: string,
    sinceIso: string,
    limit: number,
  ): Promise<MessageForDigest[]>;
  // Contacts that exchanged ≥1 text message inside [sinceIso, now).
  // Drives the daily sweep — quiet contacts get skipped entirely.
  listActiveContacts(sinceIso: string): Promise<ContactForDigest[]>;
  saveDigest(input: SaveDigestInput): Promise<DigestRow>;
  markDelivered(id: string): Promise<void>;
  // Latest digest per contact, newest first. Powers the daily report
  // landing page in the admin UI.
  latestPerContact(limit: number): Promise<DigestWithContact[]>;
  byId(id: string): Promise<DigestWithContact | null>;
  historyForContact(contactId: string, limit: number): Promise<DigestRow[]>;
}

function rowToPayload(raw: unknown): DigestPayload {
  if (typeof raw !== 'object' || raw === null) {
    return {
      gist: '',
      topics: [],
      open_questions: [],
      decisions: [],
      follow_ups: [],
      links: [],
      blind_spots: [],
    };
  }
  const obj = raw as Record<string, unknown>;
  const arr = (k: string): string[] => {
    const v = obj[k];
    if (!Array.isArray(v)) return [];
    return v.filter((x): x is string => typeof x === 'string');
  };
  return {
    gist: typeof obj.gist === 'string' ? obj.gist : '',
    topics: arr('topics'),
    open_questions: arr('open_questions'),
    decisions: arr('decisions'),
    follow_ups: arr('follow_ups'),
    links: arr('links'),
    blind_spots: arr('blind_spots'),
  };
}

export function createDigestStore(pool: DbPool): DigestStore {
  return {
    async listRecentMessages(contactId, sinceIso, limit) {
      const rows = await query<Message & { created_at: string }>(
        pool,
        `SELECT id, contact_id, direction, source, text, created_at
         FROM messages
         WHERE contact_id = $1
           AND created_at >= $2
           AND text IS NOT NULL
           AND text <> ''
         ORDER BY created_at ASC
         LIMIT $3`,
        [contactId, sinceIso, limit],
      );
      return rows.map((r) => ({
        id: r.id,
        contact_id: r.contact_id,
        direction: r.direction,
        source: r.source,
        text: r.text ?? '',
        created_at: r.created_at,
      }));
    },

    async listActiveContacts(sinceIso) {
      return query<ContactForDigest>(
        pool,
        `SELECT c.id, c.ig_username, c.first_name, c.last_name, c.lead_status
         FROM contacts c
         WHERE EXISTS (
           SELECT 1 FROM messages m
           WHERE m.contact_id = c.id
             AND m.created_at >= $1
             AND m.text IS NOT NULL
             AND m.text <> ''
         )
         ORDER BY c.last_message_at DESC NULLS LAST`,
        [sinceIso],
      );
    },

    async saveDigest(input) {
      const rows = await query<{
        id: string;
        contact_id: string;
        window_hours: number;
        generated_at: string;
        messages_count: number;
        payload_json: unknown;
        summary_md: string;
        delivered_at: string | null;
      }>(
        pool,
        `INSERT INTO ig_digests
           (contact_id, window_hours, messages_count, payload_json, summary_md)
         VALUES ($1, $2, $3, $4::jsonb, $5)
         RETURNING id::text AS id, contact_id, window_hours, generated_at,
                   messages_count, payload_json, summary_md, delivered_at`,
        [
          input.contactId,
          input.windowHours,
          input.messagesCount,
          JSON.stringify(input.payload),
          input.summaryMd,
        ],
      );
      const r = rows[0];
      if (!r) throw new Error('ig_digests insert returned no rows');
      return {
        id: r.id,
        contact_id: r.contact_id,
        window_hours: r.window_hours,
        generated_at: r.generated_at,
        messages_count: r.messages_count,
        payload_json: rowToPayload(r.payload_json),
        summary_md: r.summary_md,
        delivered_at: r.delivered_at,
      };
    },

    async markDelivered(id) {
      await query(pool, 'UPDATE ig_digests SET delivered_at = NOW() WHERE id = $1', [id]);
    },

    async latestPerContact(limit) {
      // DISTINCT ON keeps the newest digest per contact. Outer ORDER BY
      // re-sorts the results so the freshest digests appear first.
      const rows = await query<{
        id: string;
        contact_id: string;
        window_hours: number;
        generated_at: string;
        messages_count: number;
        payload_json: unknown;
        summary_md: string;
        delivered_at: string | null;
        ig_username: string | null;
        first_name: string | null;
        last_name: string | null;
        lead_status: string | null;
      }>(
        pool,
        `SELECT * FROM (
           SELECT DISTINCT ON (d.contact_id)
             d.id::text AS id,
             d.contact_id, d.window_hours, d.generated_at, d.messages_count,
             d.payload_json, d.summary_md, d.delivered_at,
             c.ig_username, c.first_name, c.last_name, c.lead_status
           FROM ig_digests d
           JOIN contacts c ON c.id = d.contact_id
           ORDER BY d.contact_id, d.generated_at DESC
         ) t
         ORDER BY generated_at DESC
         LIMIT $1`,
        [limit],
      );
      return rows.map((r) => ({
        id: r.id,
        contact_id: r.contact_id,
        window_hours: r.window_hours,
        generated_at: r.generated_at,
        messages_count: r.messages_count,
        payload_json: rowToPayload(r.payload_json),
        summary_md: r.summary_md,
        delivered_at: r.delivered_at,
        contact: {
          id: r.contact_id,
          ig_username: r.ig_username,
          first_name: r.first_name,
          last_name: r.last_name,
          lead_status: r.lead_status,
        },
      }));
    },

    async byId(id) {
      const rows = await query<{
        id: string;
        contact_id: string;
        window_hours: number;
        generated_at: string;
        messages_count: number;
        payload_json: unknown;
        summary_md: string;
        delivered_at: string | null;
        ig_username: string | null;
        first_name: string | null;
        last_name: string | null;
        lead_status: string | null;
      }>(
        pool,
        `SELECT d.id::text AS id, d.contact_id, d.window_hours, d.generated_at,
                d.messages_count, d.payload_json, d.summary_md, d.delivered_at,
                c.ig_username, c.first_name, c.last_name, c.lead_status
         FROM ig_digests d
         JOIN contacts c ON c.id = d.contact_id
         WHERE d.id = $1
         LIMIT 1`,
        [id],
      );
      const r = rows[0];
      if (!r) return null;
      return {
        id: r.id,
        contact_id: r.contact_id,
        window_hours: r.window_hours,
        generated_at: r.generated_at,
        messages_count: r.messages_count,
        payload_json: rowToPayload(r.payload_json),
        summary_md: r.summary_md,
        delivered_at: r.delivered_at,
        contact: {
          id: r.contact_id,
          ig_username: r.ig_username,
          first_name: r.first_name,
          last_name: r.last_name,
          lead_status: r.lead_status,
        },
      };
    },

    async historyForContact(contactId, limit) {
      const rows = await query<{
        id: string;
        contact_id: string;
        window_hours: number;
        generated_at: string;
        messages_count: number;
        payload_json: unknown;
        summary_md: string;
        delivered_at: string | null;
      }>(
        pool,
        `SELECT id::text AS id, contact_id, window_hours, generated_at,
                messages_count, payload_json, summary_md, delivered_at
         FROM ig_digests
         WHERE contact_id = $1
         ORDER BY generated_at DESC
         LIMIT $2`,
        [contactId, limit],
      );
      return rows.map((r) => ({
        id: r.id,
        contact_id: r.contact_id,
        window_hours: r.window_hours,
        generated_at: r.generated_at,
        messages_count: r.messages_count,
        payload_json: rowToPayload(r.payload_json),
        summary_md: r.summary_md,
        delivered_at: r.delivered_at,
      }));
    },
  };
}
