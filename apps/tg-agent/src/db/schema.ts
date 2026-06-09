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

CREATE TABLE IF NOT EXISTS tg_deals (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id    INTEGER NOT NULL,
  user_id    INTEGER NOT NULL,
  stage      TEXT NOT NULL DEFAULT 'lead',
  notes      TEXT NOT NULL DEFAULT '',
  amount     REAL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS tg_deals_user_uniq ON tg_deals (chat_id, user_id);
CREATE INDEX IF NOT EXISTS tg_deals_stage_idx ON tg_deals (stage);
CREATE INDEX IF NOT EXISTS tg_deals_updated_idx ON tg_deals (updated_at DESC);

CREATE TABLE IF NOT EXISTS tg_subscriptions (
  id                       INTEGER PRIMARY KEY AUTOINCREMENT,
  stripe_customer_id       TEXT NOT NULL,
  stripe_subscription_id   TEXT NOT NULL UNIQUE,
  stripe_session_id        TEXT,
  plan                     TEXT NOT NULL DEFAULT 'basic',
  status                   TEXT NOT NULL DEFAULT 'trialing',
  customer_email           TEXT NOT NULL DEFAULT '',
  customer_name            TEXT,
  trial_end                TEXT,
  current_period_end       TEXT,
  cancel_at                TEXT,
  created_at               TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at               TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS tg_subscriptions_status_idx ON tg_subscriptions (status);
CREATE INDEX IF NOT EXISTS tg_subscriptions_email_idx ON tg_subscriptions (customer_email);

-- Per-chat daily digests for the owner DM. Distinct from
-- tg_insight_reports (KB-suggestion analyzer): this table holds the
-- structured payload + rendered markdown for the digest scheduler
-- and the /pulse, /digest commands. tg_chat_context stores the
-- latest gist + per-chat project_context the owner sets via /context.
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

-- Process-wide settings (key/value). Holds the global kill-switch
-- 'auto_reply_enabled' that gates the responder across all chats —
-- separate from per-chat tg_chats.auto_reply so the dashboard can
-- pause the whole bot without rewriting every chat row.
CREATE TABLE IF NOT EXISTS tg_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ── Forum mode ────────────────────────────────────────────────────
-- The bot's output migrates from a single owner-DM feed into one
-- forum supergroup where each topic (thread) is a specialised agent.
-- tg_agents = one row per forum topic / role. thread_id is the
-- Telegram message_thread_id (General = 1); NULL until the topic is
-- discovered/created and bound.
CREATE TABLE IF NOT EXISTS tg_agents (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id      INTEGER UNIQUE,
  slug           TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  system_prompt  TEXT NOT NULL DEFAULT '',
  model          TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
  tools          TEXT NOT NULL DEFAULT '[]',
  is_active      INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Which monitored chat feeds which agent/thread. source_chat_id maps
-- to tg_chats.chat_id. One route per source chat.
CREATE TABLE IF NOT EXISTS tg_source_routes (
  source_chat_id  INTEGER PRIMARY KEY,
  source_label    TEXT,
  agent_id        INTEGER NOT NULL REFERENCES tg_agents(id) ON DELETE CASCADE,
  enabled         INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS tg_source_routes_agent_idx ON tg_source_routes (agent_id);

-- Structured reports the Collector routes into a thread. dedup_key =
-- source_chat_id + period bound, so retries don't double-post.
CREATE TABLE IF NOT EXISTS tg_reports (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id        INTEGER REFERENCES tg_agents(id) ON DELETE SET NULL,
  source_chat_id  INTEGER,
  summary         TEXT NOT NULL,
  raw             TEXT,
  period_start    TEXT,
  period_end      TEXT,
  tg_message_id   INTEGER,
  dedup_key       TEXT UNIQUE,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS tg_reports_agent_idx ON tg_reports (agent_id, created_at DESC);

-- Per-thread conversation = an agent's memory of its own direction.
-- role: user | assistant | report | system.
CREATE TABLE IF NOT EXISTS tg_thread_messages (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id       INTEGER REFERENCES tg_agents(id) ON DELETE CASCADE,
  thread_id      INTEGER NOT NULL,
  role           TEXT NOT NULL,
  content        TEXT NOT NULL,
  tg_message_id  INTEGER,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS tg_thread_messages_thread_idx
  ON tg_thread_messages (thread_id, created_at DESC);
`;

// Idempotent migrations for older SQLite files where tg_chat_context
// already exists in a richer shape (topics/sentiment/tasks columns).
// better-sqlite3 throws on ADD COLUMN when the column already exists,
// so we introspect PRAGMA table_info first. tg_digests is brand new;
// nothing to migrate there.
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
