import Database from 'better-sqlite3'
import * as sqliteVec from 'sqlite-vec'
import { mkdirSync } from 'fs'
import { dirname } from 'path'

let cachedDb: Database.Database | null = null

// All content tables carry a `user_id` column (default 'default') so a
// single SQLite file can host multiple tenants. The user_id is set by
// the API layer from authenticate() in telegram-auth.ts. Rows created
// before the multi-tenancy migration are owned by user_id='default'.
const SCHEMA = `
-- Transcripts (formerly Supabase migrations 001 + 002)
CREATE TABLE IF NOT EXISTS transcripts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'default',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  url TEXT NOT NULL,
  title TEXT,
  source TEXT,
  language TEXT,
  duration REAL,
  transcript TEXT NOT NULL,
  paragraphs TEXT,
  summary TEXT,
  bullets TEXT,
  translation TEXT,
  generations TEXT
);
CREATE INDEX IF NOT EXISTS transcripts_user_created_idx ON transcripts (user_id, created_at DESC);

-- Personal profile, keyed by user_id. Pre-migration deployments held a
-- single 'singleton' row; the column migration below rebuilds the table.
CREATE TABLE IF NOT EXISTS me_profile (
  user_id TEXT PRIMARY KEY,
  bio TEXT NOT NULL DEFAULT '',
  projects TEXT NOT NULL DEFAULT '',
  academy TEXT NOT NULL DEFAULT '',
  social TEXT NOT NULL DEFAULT '',
  voice TEXT NOT NULL DEFAULT '',
  custom TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Library documents
CREATE TABLE IF NOT EXISTS me_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL DEFAULT 'default',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  title TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('paste', 'file', 'transcript')),
  source_meta TEXT NOT NULL DEFAULT '{}',
  original_text TEXT NOT NULL,
  char_count INTEGER NOT NULL DEFAULT 0,
  chunk_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS me_documents_user_created_idx ON me_documents (user_id, created_at DESC);

-- Chunk text + metadata; embeddings live in the vec virtual table below, keyed by chunk id.
-- user_id is derived from the parent document via JOIN; no separate column.
CREATE TABLE IF NOT EXISTS me_chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL REFERENCES me_documents(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS me_chunks_document_idx ON me_chunks (document_id);

-- Chat history. One row per persisted conversation, with a kind (the /me
-- second brain vs. one of the specialized /assistants) and the assistant
-- slug when kind = 'assistant'.
CREATE TABLE IF NOT EXISTS chat_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'default',
  kind TEXT NOT NULL CHECK (kind IN ('me', 'assistant')),
  assistant_id TEXT,
  title TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS chat_sessions_user_lookup_idx
  ON chat_sessions (user_id, kind, assistant_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS chat_messages_session_idx ON chat_messages (session_id, id);
`

const VEC_SCHEMA = `
CREATE VIRTUAL TABLE IF NOT EXISTS vec_me_chunks USING vec0(
  embedding FLOAT[1536]
);
`

function dbPath(): string {
  return process.env.DB_PATH || './data/app.db'
}

export function getDb(): Database.Database {
  if (cachedDb) return cachedDb
  const path = dbPath()
  mkdirSync(dirname(path), { recursive: true })

  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('synchronous = NORMAL')
  db.pragma('busy_timeout = 5000')

  sqliteVec.load(db)
  db.exec(SCHEMA)
  db.exec(VEC_SCHEMA)
  runColumnMigrations(db)

  cachedDb = db
  return db
}

// Additive column migrations. SQLite's `CREATE TABLE IF NOT EXISTS` doesn't
// add columns to existing tables, so anything we add to a row schema after
// the first deploy needs a one-shot ALTER. Each statement is wrapped in
// try/catch because SQLite throws "duplicate column" when the migration
// already ran — that's the idempotent path.
function runColumnMigrations(db: Database.Database) {
  const migrations: string[] = [
    `ALTER TABLE me_profile ADD COLUMN projects_list TEXT NOT NULL DEFAULT '[]'`,
    `ALTER TABLE me_documents ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE chat_sessions ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE chat_sessions ADD COLUMN doc_ids TEXT`,
    // Multi-tenancy: add user_id to every content table. Pre-existing
    // rows default to 'default' which keeps single-tenant deploys working.
    `ALTER TABLE transcripts ADD COLUMN user_id TEXT NOT NULL DEFAULT 'default'`,
    `ALTER TABLE me_documents ADD COLUMN user_id TEXT NOT NULL DEFAULT 'default'`,
    `ALTER TABLE chat_sessions ADD COLUMN user_id TEXT NOT NULL DEFAULT 'default'`,
    `CREATE INDEX IF NOT EXISTS transcripts_user_created_idx ON transcripts (user_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS me_documents_user_created_idx ON me_documents (user_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS chat_sessions_user_lookup_idx ON chat_sessions (user_id, kind, assistant_id, updated_at DESC)`,
  ]
  for (const stmt of migrations) {
    try {
      db.exec(stmt)
    } catch (e: any) {
      // Ignore "duplicate column name" — migration already applied.
      if (!String(e?.message || '').includes('duplicate column name')) {
        console.warn('[db migration] failed:', stmt, e?.message)
      }
    }
  }

  // me_profile rebuild: the original schema enforced `CHECK (id = 'singleton')`
  // which makes it physically impossible to have rows for different users.
  // SQLite can't drop a CHECK constraint in place, so we rebuild the table
  // when the old shape is detected (column `id` present instead of `user_id`).
  rebuildProfileTableIfNeeded(db)
}

function rebuildProfileTableIfNeeded(db: Database.Database) {
  const cols = db
    .prepare(`PRAGMA table_info(me_profile)`)
    .all() as Array<{ name: string }>
  const hasUserIdCol = cols.some((c) => c.name === 'user_id')
  const hasOldIdCol = cols.some((c) => c.name === 'id')
  if (hasUserIdCol && !hasOldIdCol) return // already migrated

  const ownerSeed = (process.env.OWNER_TELEGRAM_ID || '').trim()
  const ownerUserId = ownerSeed ? `tg:${ownerSeed}` : 'default'

  const tx = db.transaction(() => {
    db.exec(`
      CREATE TABLE me_profile_new (
        user_id TEXT PRIMARY KEY,
        bio TEXT NOT NULL DEFAULT '',
        projects TEXT NOT NULL DEFAULT '',
        projects_list TEXT NOT NULL DEFAULT '[]',
        academy TEXT NOT NULL DEFAULT '',
        social TEXT NOT NULL DEFAULT '',
        voice TEXT NOT NULL DEFAULT '',
        custom TEXT NOT NULL DEFAULT '{}',
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      )
    `)
    // Carry forward the singleton row (if any) under the owner's user_id.
    const hasProjectsList = cols.some((c) => c.name === 'projects_list')
    const projectsListExpr = hasProjectsList ? 'projects_list' : `'[]'`
    db.prepare(
      `INSERT INTO me_profile_new (user_id, bio, projects, projects_list, academy, social, voice, custom, updated_at)
       SELECT ?, bio, projects, ${projectsListExpr}, academy, social, voice, custom, updated_at
       FROM me_profile`,
    ).run(ownerUserId)
    db.exec(`DROP TABLE me_profile`)
    db.exec(`ALTER TABLE me_profile_new RENAME TO me_profile`)
  })
  try {
    tx()
  } catch (e: any) {
    console.warn('[db migration] me_profile rebuild failed:', e?.message)
  }
}

export function embeddingToBuffer(vec: number[]): Buffer {
  const f32 = new Float32Array(vec)
  return Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength)
}
