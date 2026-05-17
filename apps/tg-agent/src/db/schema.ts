// SQLite schema for tg-agent. Embedded as a string so the bot can
// `db.exec(SCHEMA)` on startup — no separate migration tool, no
// Supabase SQL editor. Idempotent: every statement is `IF NOT
// EXISTS`, so re-running on an existing DB is a no-op.

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS tg_chats (
  chat_id     INTEGER PRIMARY KEY,
  title       TEXT,
  auto_reply  INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS tg_users (
  chat_id            INTEGER NOT NULL,
  user_id            INTEGER NOT NULL,
  username           TEXT,
  first_name         TEXT,
  last_name          TEXT,
  status             TEXT NOT NULL DEFAULT 'new',
  status_updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_seen_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (chat_id, user_id)
);

CREATE INDEX IF NOT EXISTS tg_users_status_idx ON tg_users (status);
CREATE INDEX IF NOT EXISTS tg_users_last_seen_idx ON tg_users (last_seen_at DESC);

CREATE TABLE IF NOT EXISTS tg_messages (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id              INTEGER NOT NULL,
  user_id              INTEGER,
  telegram_message_id  INTEGER NOT NULL,
  text                 TEXT NOT NULL,
  class                TEXT,
  confidence           REAL,
  action               TEXT,
  reasoning            TEXT,
  response             TEXT,
  created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS tg_messages_chat_created_idx
  ON tg_messages (chat_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tg_messages_user_created_idx
  ON tg_messages (chat_id, user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tg_messages_class_idx
  ON tg_messages (class);
`;
