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

CREATE TABLE IF NOT EXISTS tg_drafts (
  id                       INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id                  INTEGER NOT NULL,
  user_id                  INTEGER,
  original_message_id      INTEGER NOT NULL,
  message_class            TEXT,
  draft_text               TEXT NOT NULL,
  -- pending  | editing | sent | deleted
  status                   TEXT NOT NULL DEFAULT 'pending',
  -- The DM that carries the inline keyboard. We edit it on resolution
  -- to strike the buttons and show the outcome.
  owner_dm_message_id      INTEGER,
  -- When status='editing', the DM message the bot sent with
  -- force_reply asking the owner for the rewritten text.
  edit_prompt_message_id   INTEGER,
  -- The text that actually went to the chat. Equal to draft_text on
  -- direct approval, different when the owner rewrote.
  sent_reply_text          TEXT,
  created_at               TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at               TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS tg_drafts_status_created_idx
  ON tg_drafts (status, created_at DESC);
CREATE INDEX IF NOT EXISTS tg_drafts_edit_prompt_idx
  ON tg_drafts (edit_prompt_message_id);
CREATE INDEX IF NOT EXISTS tg_drafts_owner_dm_idx
  ON tg_drafts (owner_dm_message_id);

-- Per-chat daily digests. The generator reads tg_messages over a
-- rolling window, asks Claude Sonnet to surface what the owner might
-- be missing, and stores both the structured payload (JSON) and a
-- ready-to-send markdown summary. tg_chat_context holds the latest
-- per-chat snapshot plus the owner's project_context for the chat.
-- This is intentionally separate from tg_insight_reports, which
-- belongs to the KB-suggestion analyzer in db/insights.ts.
CREATE TABLE IF NOT EXISTS tg_digests (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id         INTEGER NOT NULL,
  chat_title      TEXT,
  window_hours    INTEGER NOT NULL DEFAULT 24,
  generated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  messages_count  INTEGER NOT NULL DEFAULT 0,
  payload_json    TEXT NOT NULL DEFAULT '{}',
  summary_md      TEXT NOT NULL DEFAULT '',
  delivered_at    TEXT
);

CREATE INDEX IF NOT EXISTS tg_digests_chat_idx
  ON tg_digests (chat_id, generated_at DESC);

CREATE TABLE IF NOT EXISTS tg_chat_context (
  chat_id              INTEGER PRIMARY KEY,
  summary              TEXT NOT NULL DEFAULT '',
  custom_instructions  TEXT NOT NULL DEFAULT '',
  context_updated_at   TEXT,
  created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
`;

// One-shot, idempotent migrations for older SQLite files where
// tg_chat_context already exists in an older shape (more columns,
// e.g. topics/sentiment/tasks). better-sqlite3 throws on ADD COLUMN
// when the column already exists, so we introspect PRAGMA table_info
// first. tg_digests is brand new; nothing to migrate there.
export function ensureSchemaUpgrades(db: {
  prepare: (sql: string) => { all: () => Array<{ name: string }> };
  exec: (sql: string) => void;
}): void {
  const addIfMissing = (table: string, column: string, ddl: string): void => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (cols.some((c) => c.name === column)) return;
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  };

  addIfMissing(
    'tg_chat_context',
    'custom_instructions',
    "TEXT NOT NULL DEFAULT ''",
  );
  addIfMissing('tg_chat_context', 'context_updated_at', 'TEXT');
}
