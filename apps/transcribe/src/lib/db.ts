// Database client for the `aio` Postgres instance (infra-postgres-1
// on prod). The previous SQLite-based `db.ts` was a dead local-dev
// path that the merge in 47cb1fd accidentally restored — none of
// the callers (transcripts-db.ts, me-db.ts, users-db.ts, …) use
// the better-sqlite3 surface; they all rely on postgres.js tagged-
// template SQL.
//
// Stays compatible with the `getDb()` shape so call sites don't have
// to change.

import postgres, { type Sql } from 'postgres'

let cached: Sql | null = null

export function getDb(): Sql | null {
  if (cached) return cached
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL
  if (!url) return null
  cached = postgres(url, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
  })
  return cached
}

export type { Sql }
