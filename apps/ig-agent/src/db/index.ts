import pg from 'pg';

import type { Logger } from '../logger.js';

const { Pool } = pg;
export type DbPool = pg.Pool;
export type DbClient = pg.PoolClient;

export interface DbOptions {
  connectionString: string;
  logger: Logger;
}

export function openDb({ connectionString, logger }: DbOptions): DbPool {
  const pool = new Pool({
    connectionString,
    // Keep the pool conservative — the bot is single-process and most
    // queries are sub-ms point reads. Bursts come from the admin SPA.
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  pool.on('error', (err) => logger.error('pg pool error', { err: err.message }));
  return pool;
}

// Run a query and return its rows. Thin wrapper so call sites don't have
// to unwrap `.rows` and type the generic on every line.
export async function query<R extends pg.QueryResultRow = pg.QueryResultRow>(
  pool: DbPool | DbClient,
  text: string,
  params?: ReadonlyArray<unknown>,
): Promise<R[]> {
  const res = await pool.query<R>(text, params as unknown[] | undefined);
  return res.rows;
}

// ISO 8601 — matches Postgres default TIMESTAMPTZ formatting.
export function nowIso(): string {
  return new Date().toISOString();
}
