import type { Db } from './index.js';
import { nowIso } from './index.js';

const KEY_GLOBAL_AUTO_REPLY = 'auto_reply_enabled';

export interface SettingsService {
  getGlobalAutoReply(): boolean;
  setGlobalAutoReply(value: boolean): boolean;
}

export function createSettingsService(db: Db): SettingsService {
  const getStmt = db.prepare(`SELECT value FROM tg_settings WHERE key = ?`);
  const setStmt = db.prepare(`
    INSERT INTO tg_settings (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `);

  return {
    getGlobalAutoReply(): boolean {
      const row = getStmt.get(KEY_GLOBAL_AUTO_REPLY) as { value: string } | undefined;
      if (!row) return true;
      return row.value !== 'false';
    },
    setGlobalAutoReply(value: boolean): boolean {
      setStmt.run(KEY_GLOBAL_AUTO_REPLY, value ? 'true' : 'false', nowIso());
      return value;
    },
  };
}
