import { query, type DbPool } from './index.js';

export interface PromptVersion {
  id: string;
  version: string;
  system_prompt: string;
  segment: string | null;
  active: boolean;
  created_at: string;
}

export interface PromptStore {
  active(segment?: string | null): Promise<PromptVersion | undefined>;
  list(): Promise<PromptVersion[]>;
  create(input: { version: string; systemPrompt: string; segment?: string | null }): Promise<PromptVersion>;
  activate(id: string): Promise<void>;
}

export function createPromptStore(pool: DbPool): PromptStore {
  return {
    async active(segment = null) {
      // Prefer a segment-specific active prompt; fall back to NULL-segment.
      if (segment) {
        const rows = await query<PromptVersion>(
          pool,
          'SELECT * FROM prompt_versions WHERE active = true AND segment = $1 ORDER BY created_at DESC LIMIT 1',
          [segment],
        );
        if (rows[0]) return rows[0];
      }
      const rows = await query<PromptVersion>(
        pool,
        'SELECT * FROM prompt_versions WHERE active = true AND segment IS NULL ORDER BY created_at DESC LIMIT 1',
      );
      return rows[0];
    },

    async list() {
      return query<PromptVersion>(
        pool,
        'SELECT * FROM prompt_versions ORDER BY created_at DESC',
      );
    },

    async create(input) {
      const rows = await query<PromptVersion>(
        pool,
        `INSERT INTO prompt_versions (version, system_prompt, segment)
         VALUES ($1, $2, $3) RETURNING *`,
        [input.version, input.systemPrompt, input.segment ?? null],
      );
      const row = rows[0];
      if (!row) throw new Error('prompt_versions insert returned no rows');
      return row;
    },

    async activate(id) {
      // Activating one prompt deactivates others in the same segment so we
      // never have two "active" prompts competing.
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const target = await client.query<{ segment: string | null }>(
          'SELECT segment FROM prompt_versions WHERE id = $1',
          [id],
        );
        const segment = target.rows[0]?.segment ?? null;
        if (segment === null) {
          await client.query(
            'UPDATE prompt_versions SET active = false WHERE segment IS NULL AND id <> $1',
            [id],
          );
        } else {
          await client.query(
            'UPDATE prompt_versions SET active = false WHERE segment = $1 AND id <> $2',
            [segment, id],
          );
        }
        await client.query('UPDATE prompt_versions SET active = true WHERE id = $1', [id]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },
  };
}
