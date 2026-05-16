// ═══════════════════════════════════════════════════════════════════
// src/lib/db.ts
// ───────────────────────────────────────────────────────────────────
// Singleton `pg` Pool. Заменяет старый Supabase-клиент.
// Подключение определяется DATABASE_URL (или PG* переменными).
// Если URL не задан — экспортирует null, и все хелперы выше по стеку
// деградируют до no-op (как раньше делал getServerSupabase()).
// ═══════════════════════════════════════════════════════════════════

import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg'

let cached: Pool | null = null
let attempted = false

export function getPool(): Pool | null {
  if (cached) return cached
  if (attempted) return null
  attempted = true

  const url = process.env.DATABASE_URL
  const host = process.env.PGHOST
  if (!url && !host) return null

  cached = new Pool({
    connectionString: url,
    // pg сам подхватит PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE если
    // connectionString не передан.
    max: parseInt(process.env.PG_POOL_MAX || '10', 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  })

  cached.on('error', (err) => {
    console.error('[pg] idle client error', err)
  })

  return cached
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: any[],
): Promise<QueryResult<T> | null> {
  const pool = getPool()
  if (!pool) return null
  return pool.query<T>(text, params)
}

export async function withClient<T>(fn: (c: PoolClient) => Promise<T>): Promise<T | null> {
  const pool = getPool()
  if (!pool) return null
  const client = await pool.connect()
  try {
    return await fn(client)
  } finally {
    client.release()
  }
}

export function isConfigured(): boolean {
  return getPool() !== null
}

// Преобразует JS-массив в литерал pgvector: '[1.2,3.4,...]'
export function toVectorLiteral(values: number[]): string {
  return '[' + values.join(',') + ']'
}
