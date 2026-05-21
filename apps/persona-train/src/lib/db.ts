import { Pool, type QueryResultRow } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

declare global {
  // eslint-disable-next-line no-var
  var __pg_pool: Pool | undefined;
}

export const pool: Pool =
  global.__pg_pool ??
  new Pool({
    connectionString: DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

if (process.env.NODE_ENV !== 'production') global.__pg_pool = pool;

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  const res = await pool.query<T>(text, params as never);
  return res.rows;
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

export function normalizeOwnerHandle(s: string | null | undefined): string | null {
  const t = String(s ?? '').trim().split(/\s+/)[0];
  if (!t) return null;
  if (t.includes('@') && t.includes('.')) return t.toLowerCase();
  return t.startsWith('@') ? t : '@' + t;
}
