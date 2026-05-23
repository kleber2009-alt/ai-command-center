import { query, type DbPool } from './index.js';

export type LeadStatus = 'new' | 'warm' | 'hot' | 'customer' | 'lost';

export interface Contact {
  id: string;
  sendpulse_contact_id: string;
  ig_username: string | null;
  ig_user_id: string | null;
  first_name: string | null;
  last_name: string | null;
  profile_pic_url: string | null;
  lead_status: LeadStatus;
  qualification: string | null;
  tags: string[] | null;
  custom_fields: Record<string, unknown> | null;
  first_seen_at: string;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UpsertInput {
  sendpulseContactId: string;
  igUsername?: string | null;
  igUserId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  profilePicUrl?: string | null;
}

export interface ContactService {
  upsertFromWebhook(input: UpsertInput): Promise<Contact>;
  bySendpulseId(sendpulseContactId: string): Promise<Contact | undefined>;
  byId(id: string): Promise<Contact | undefined>;
  list(opts?: { status?: LeadStatus; limit?: number }): Promise<Contact[]>;
  setLeadStatus(id: string, status: LeadStatus): Promise<void>;
  touchLastMessage(id: string): Promise<void>;
}

export function createContactService(pool: DbPool): ContactService {
  return {
    async upsertFromWebhook(input) {
      // Only overwrite enrichment fields when the new payload carries them
      // — webhook events sometimes ship a stripped contact (id only) and we
      // don't want to wipe a previously enriched username/avatar.
      const rows = await query<Contact>(
        pool,
        `INSERT INTO contacts (
           sendpulse_contact_id, ig_username, ig_user_id,
           first_name, last_name, profile_pic_url
         )
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (sendpulse_contact_id) DO UPDATE SET
           ig_username     = COALESCE(EXCLUDED.ig_username,     contacts.ig_username),
           ig_user_id      = COALESCE(EXCLUDED.ig_user_id,      contacts.ig_user_id),
           first_name      = COALESCE(EXCLUDED.first_name,      contacts.first_name),
           last_name       = COALESCE(EXCLUDED.last_name,       contacts.last_name),
           profile_pic_url = COALESCE(EXCLUDED.profile_pic_url, contacts.profile_pic_url)
         RETURNING *`,
        [
          input.sendpulseContactId,
          input.igUsername ?? null,
          input.igUserId ?? null,
          input.firstName ?? null,
          input.lastName ?? null,
          input.profilePicUrl ?? null,
        ],
      );
      // Postgres guarantees one row on INSERT ... RETURNING — we control the
      // SQL here, so the null check is just to satisfy noUncheckedIndexedAccess.
      const row = rows[0];
      if (!row) throw new Error('contacts upsert returned no rows');
      return row;
    },

    async bySendpulseId(sendpulseContactId) {
      const rows = await query<Contact>(
        pool,
        'SELECT * FROM contacts WHERE sendpulse_contact_id = $1',
        [sendpulseContactId],
      );
      return rows[0];
    },

    async byId(id) {
      const rows = await query<Contact>(pool, 'SELECT * FROM contacts WHERE id = $1', [id]);
      return rows[0];
    },

    async list(opts = {}) {
      const limit = opts.limit ?? 100;
      if (opts.status) {
        return query<Contact>(
          pool,
          'SELECT * FROM contacts WHERE lead_status = $1 ORDER BY last_message_at DESC NULLS LAST, created_at DESC LIMIT $2',
          [opts.status, limit],
        );
      }
      return query<Contact>(
        pool,
        'SELECT * FROM contacts ORDER BY last_message_at DESC NULLS LAST, created_at DESC LIMIT $1',
        [limit],
      );
    },

    async setLeadStatus(id, status) {
      await query(pool, 'UPDATE contacts SET lead_status = $1 WHERE id = $2', [status, id]);
    },

    async touchLastMessage(id) {
      await query(pool, 'UPDATE contacts SET last_message_at = NOW() WHERE id = $1', [id]);
    },
  };
}
