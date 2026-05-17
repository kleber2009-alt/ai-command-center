import { mkdirSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';

import Database, { type Database as DatabaseT } from 'better-sqlite3';

import type { Logger } from '../logger.js';
import { SCHEMA } from './schema.js';

export type Db = DatabaseT;

export interface DbOptions {
  path: string;
  logger: Logger;
}

// Opens (or creates) the SQLite file, ensures the parent dir exists,
// runs the schema, and tunes pragmas for our workload: WAL for
// concurrent readers (admin UI reads while the bot writes), NORMAL
// sync to balance durability with throughput, and a small busy
// timeout so the admin doesn't get SQLITE_BUSY when both processes
// touch the DB at the same time (irrelevant for single-process mode
// but harmless).
export function openDb({ path, logger }: DbOptions): Db {
  const absolute = isAbsolute(path) ? path : resolve(process.cwd(), path);
  mkdirSync(dirname(absolute), { recursive: true });

  const db = new Database(absolute);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  db.exec(SCHEMA);

  logger.info('sqlite opened', { path: absolute });
  return db;
}

// ISO 8601 with millisecond precision — matches strftime defaults
// used in column defaults, so timestamps are consistent whether they
// come from app code or from the schema.
export function nowIso(): string {
  return new Date().toISOString();
}
