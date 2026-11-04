/* Storage of the CRM — node:sqlite, one file in DATA_DIR. Everything ChatPlace sends is kept: chats, every message,
   the AI's analysis of each chat and the log of what people did (took over, answered, moved a lead). */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export const STAGES = ['new', 'warm', 'hot', 'customer', 'lost'];
export const PRIORITIES = ['hot', 'human', 'normal', 'low'];

export function openDb(dir) {
  fs.mkdirSync(dir, { recursive:true });
  const db = new DatabaseSync(path.join(dir, 'crm.sqlite'));
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS chats (
      id TEXT PRIMARY KEY,
      client_id TEXT, client_name TEXT, username TEXT,
      status INTEGER, type INTEGER,               -- ChatPlace: status 1 active/2 stopped/3 unsubscribed; type 1 open (person)/2 closed (AI)
      last_message_at INTEGER DEFAULT 0,           -- unix seconds, as ChatPlace gives it
      last_client_at INTEGER DEFAULT 0, last_reply_at INTEGER DEFAULT 0, last_side TEXT,
      msg_count INTEGER DEFAULT 0, client_count INTEGER DEFAULT 0,
      synced_upto INTEGER DEFAULT 0,               -- last_message_at the messages were fetched for
      priority TEXT DEFAULT 'normal', priority_reason TEXT,
      stage TEXT DEFAULT 'new', stage_manual INTEGER DEFAULT 0,
      source TEXT, intent TEXT, summary TEXT, next_step TEXT,
      ai_score INTEGER, ai_verdict TEXT, ai_issues TEXT,
      analyzed_upto INTEGER DEFAULT 0, analyzed_at INTEGER,
      handled_by TEXT, handled_at INTEGER,          -- who took the chat from the AI (ChatPlace chats_open)
      reviewed_upto INTEGER DEFAULT 0, reviewed_by TEXT,  -- «разобрано»: out of the queue until the client writes again
      first_seen INTEGER
    );
    CREATE INDEX IF NOT EXISTS chats_last ON chats(last_message_at DESC);
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY, chat_id TEXT NOT NULL,
      side TEXT, text TEXT, created_at INTEGER, type_name TEXT, media TEXT,
      by_user TEXT                                  -- who of us sent it from the CRM
    );
    CREATE INDEX IF NOT EXISTS messages_chat ON messages(chat_id, created_at);
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT, chat_id TEXT, at INTEGER, user TEXT, kind TEXT, data TEXT
    );
    CREATE INDEX IF NOT EXISTS events_chat ON events(chat_id, at);
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
    -- ChatPlace automations (code words → steps → buttons) with their counts, refreshed one request at a time
    CREATE TABLE IF NOT EXISTS bots (id TEXT PRIMARY KEY, name TEXT, username TEXT, platform TEXT, updated INTEGER);
    CREATE TABLE IF NOT EXISTS automations (
      id TEXT PRIMARY KEY, bot_id TEXT, name TEXT, status TEXT, start_messages TEXT, detail TEXT,
      listed INTEGER, detailed INTEGER DEFAULT 0
    );
    -- a daily copy of every automation's counts: growth of each step and button over a period
    CREATE TABLE IF NOT EXISTS funnel_days (automation_id TEXT, day TEXT, counts TEXT, PRIMARY KEY(automation_id, day));
    -- questions the ChatPlace AI agent could not answer, and what we answered
    CREATE TABLE IF NOT EXISTS kb_questions (
      id TEXT PRIMARY KEY, bot_id TEXT, question TEXT, first_seen INTEGER, gone INTEGER DEFAULT 0,
      draft TEXT, answer TEXT, answered_at INTEGER, answered_by TEXT, skipped INTEGER DEFAULT 0
    );
  `);
  // columns added after the first release
  const have = new Set(db.prepare('PRAGMA table_info(chats)').all().map(c => c.name));
  for (const [c, t] of [['lead_score', 'INTEGER'], ['interest', 'TEXT'], ['objection', 'TEXT'], ['contact', 'TEXT']]) if (!have.has(c)) db.exec(`ALTER TABLE chats ADD COLUMN ${c} ${t}`);
  return db;
}

export const now = () => Math.floor(Date.now() / 1000);

export function meta(db, key, value) {
  if (value === undefined) return db.prepare('SELECT value FROM meta WHERE key = ?').get(key)?.value ?? null;
  db.prepare('INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, String(value));
}

export function logEvent(db, chatId, user, kind, data = {}) {
  db.prepare('INSERT INTO events(chat_id, at, user, kind, data) VALUES(?, ?, ?, ?, ?)').run(chatId, now(), user || null, kind, JSON.stringify(data));
}

export function tx(db, fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
}
