// Postgres connection pool + thin query helper.
// Replaces the previous Supabase client. DATABASE_URL is a standard
// Postgres connection string (postgres://user:pass@host:port/db).

import { Pool, type PoolConfig, type QueryResult, type QueryResultRow } from 'pg'

let pool: Pool | null = null

function buildConfig(): PoolConfig | null {
  const url = process.env.DATABASE_URL
  if (!url) return null
  const cfg: PoolConfig = {
    connectionString: url,
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
  }
  // Enable SSL for managed Postgres providers that require it (Supabase, RDS, etc.)
  // Disable for local docker-compose by either omitting DATABASE_SSL or setting it to '0'.
  if (process.env.DATABASE_SSL && process.env.DATABASE_SSL !== '0') {
    cfg.ssl = { rejectUnauthorized: false }
  }
  return cfg
}

export function getPool(): Pool | null {
  if (pool) return pool
  const cfg = buildConfig()
  if (!cfg) return null
  pool = new Pool(cfg)
  pool.on('error', err => {
    console.warn('[db] pool error:', err.message)
  })
  return pool
}

export function isDbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL)
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<QueryResult<T>> {
  const p = getPool()
  if (!p) {
    throw new Error('DATABASE_URL не настроен')
  }
  return p.query<T>(text, params as any[])
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const res = await query<T>(text, params)
  return res.rows[0] ?? null
}

export async function queryMany<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await query<T>(text, params)
  return res.rows
}
