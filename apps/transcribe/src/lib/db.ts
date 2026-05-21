import postgres from 'postgres'

export type Sql = ReturnType<typeof postgres>

let cached: Sql | null = null

export function getDb(): Sql | null {
  if (cached) return cached
  const url = process.env.DATABASE_URL
  if (!url) return null
  cached = postgres(url, { max: 5, idle_timeout: 20, connect_timeout: 10 })
  return cached
}
