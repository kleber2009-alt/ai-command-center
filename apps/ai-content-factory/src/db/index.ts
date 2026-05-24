// Local SQLite knowledge base (better-sqlite3 + sqlite-vec). One file under
// data/knowledge/ holds the content library, its vector index, user feedback,
// agent learnings and generation logs. Vector search uses sqlite-vec's vec0
// virtual table with the cosine metric.

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { knowledgePath } from '../lib/paths.js';

export type DB = Database.Database;

// Voyage's default output dimension. Override with VOYAGE_DIM if you configure
// a different embedding size (the vec table is created with this width).
export const EMBEDDING_DIM = Number(process.env.VOYAGE_DIM ?? 1024);

const SCHEMA_SQL = `
create table if not exists content_library (
  id integer primary key autoincrement,
  type text not null,
  source text,
  topic text,
  hook text,
  content text not null,
  cta text,
  format text,
  visual_style text,
  metrics text,
  performance_score real not null default 0,
  created_at text not null default (datetime('now'))
);

create table if not exists feedback (
  id integer primary key autoincrement,
  content_id integer references content_library(id),
  rating integer,
  feedback_tags text,
  comment text,
  created_at text not null default (datetime('now'))
);

create table if not exists agent_learnings (
  id integer primary key autoincrement,
  learning_type text,
  insight text not null,
  source_content_ids text,
  confidence real,
  created_at text not null default (datetime('now'))
);

create table if not exists generation_logs (
  id integer primary key autoincrement,
  campaign_id text,
  content_day_id text,
  input_context text,
  retrieved_examples text,
  generated_output text,
  user_rating integer,
  final_status text,
  created_at text not null default (datetime('now'))
);
`;

export function applySchema(db: DB, dim: number = EMBEDDING_DIM): void {
  if (!Number.isInteger(dim) || dim <= 0) {
    throw new Error(`Embedding dimension must be a positive integer, got ${dim}`);
  }
  db.exec(SCHEMA_SQL);
  db.exec(
    `create virtual table if not exists vec_content using vec0(embedding float[${dim}] distance=cosine)`,
  );
}

// Float32 little-endian bytes — the BLOB format sqlite-vec expects.
export function floatsToBuffer(values: number[]): Buffer {
  return Buffer.from(new Float32Array(values).buffer);
}

let singleton: DB | null = null;

export function getDb(): DB {
  if (!singleton) {
    const path = process.env.CONTENT_FACTORY_DB ?? knowledgePath('factory.db');
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    const db = new Database(path);
    db.pragma('journal_mode = WAL');
    sqliteVec.load(db);
    applySchema(db);
    singleton = db;
  }
  return singleton;
}
