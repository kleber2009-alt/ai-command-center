import Database from 'better-sqlite3'
import * as sqliteVec from 'sqlite-vec'
import { mkdirSync } from 'fs'
import { dirname } from 'path'

let cachedDb: Database.Database | null = null

const SCHEMA = `
-- Transcripts (formerly Supabase migrations 001 + 002)
CREATE TABLE IF NOT EXISTS transcripts (
  id TEXT PRIMARY KEY,
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
CREATE INDEX IF NOT EXISTS transcripts_created_at_idx ON transcripts (created_at DESC);

-- Personal profile (single row, enforced)
CREATE TABLE IF NOT EXISTS me_profile (
  id TEXT PRIMARY KEY DEFAULT 'singleton' CHECK (id = 'singleton'),
  bio TEXT NOT NULL DEFAULT '',
  projects TEXT NOT NULL DEFAULT '',
  academy TEXT NOT NULL DEFAULT '',
  social TEXT NOT NULL DEFAULT '',
  voice TEXT NOT NULL DEFAULT '',
  custom TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
INSERT OR IGNORE INTO me_profile (id) VALUES ('singleton');

-- Library documents
CREATE TABLE IF NOT EXISTS me_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  title TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('paste', 'file', 'transcript')),
  source_meta TEXT NOT NULL DEFAULT '{}',
  original_text TEXT NOT NULL,
  char_count INTEGER NOT NULL DEFAULT 0,
  chunk_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS me_documents_created_at_idx ON me_documents (created_at DESC);

-- Chunk text + metadata; embeddings live in the vec virtual table below, keyed by chunk id.
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
  kind TEXT NOT NULL CHECK (kind IN ('me', 'assistant')),
  assistant_id TEXT,
  title TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS chat_sessions_lookup_idx
  ON chat_sessions (kind, assistant_id, updated_at DESC);

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

  cachedDb = db
  return db
}

export function embeddingToBuffer(vec: number[]): Buffer {
  const f32 = new Float32Array(vec)
  return Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength)
}
