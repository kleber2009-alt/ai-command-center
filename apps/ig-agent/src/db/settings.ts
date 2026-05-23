// Generic key-value store for runtime toggles. Backed by the
// `system_settings` table. Reads hit Postgres every time (no cache) —
// volume is low and we want flips from the admin UI to take effect on
// the very next webhook without busting any in-memory state.

import { query, type DbPool } from './index.js';

export interface SettingsService {
  get(key: string, defaultValue: string): Promise<string>;
  getBool(key: string, defaultValue: boolean): Promise<boolean>;
  set(key: string, value: string): Promise<void>;
  all(): Promise<Record<string, string>>;
}

interface Row {
  key: string;
  value: string;
}

export function createSettingsService(pool: DbPool): SettingsService {
  return {
    async get(key, defaultValue) {
      const rows = await query<Row>(
        pool,
        'SELECT value FROM system_settings WHERE key = $1',
        [key],
      );
      return rows[0]?.value ?? defaultValue;
    },

    async getBool(key, defaultValue) {
      const v = await this.get(key, defaultValue ? 'true' : 'false');
      return v === 'true' || v === '1';
    },

    async set(key, value) {
      await query(
        pool,
        `INSERT INTO system_settings (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [key, value],
      );
    },

    async all() {
      const rows = await query<Row>(pool, 'SELECT key, value FROM system_settings');
      const out: Record<string, string> = {};
      for (const r of rows) out[r.key] = r.value;
      return out;
    },
  };
}
