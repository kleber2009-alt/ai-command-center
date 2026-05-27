import type { Db } from './index.js';
import { nowIso } from './index.js';

const KEY_GLOBAL_AUTO_REPLY = 'auto_reply_enabled';
const KEY_BOT_ENABLED = 'bot_enabled';

export interface SettingsService {
  getGlobalAutoReply(): boolean;
  setGlobalAutoReply(value: boolean): boolean;
  // Master kill-switch. When false, every group message handler bails
  // before classify/decide/respond/log — bot becomes inert without
  // dropping its long-poll session.
  getBotEnabled(): boolean;
  setBotEnabled(value: boolean): boolean;
}

export function createSettingsService(db: Db): SettingsService {
  const getStmt = db.prepare(`SELECT value FROM tg_settings WHERE key = ?`);
  const setStmt = db.prepare(`
    INSERT INTO tg_settings (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `);

  function getBool(key: string, defaultValue: boolean): boolean {
    const row = getStmt.get(key) as { value: string } | undefined;
    if (!row) return defaultValue;
    return row.value !== 'false';
  }

  function setBool(key: string, value: boolean): boolean {
    setStmt.run(key, value ? 'true' : 'false', nowIso());
    return value;
  }

  return {
    getGlobalAutoReply: () => getBool(KEY_GLOBAL_AUTO_REPLY, true),
    setGlobalAutoReply: (value) => setBool(KEY_GLOBAL_AUTO_REPLY, value),
    getBotEnabled: () => getBool(KEY_BOT_ENABLED, true),
    setBotEnabled: (value) => setBool(KEY_BOT_ENABLED, value),
  };
}
