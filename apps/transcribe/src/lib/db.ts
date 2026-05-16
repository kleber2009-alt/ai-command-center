import postgres, { Sql } from 'postgres'

let cached: Sql | null = null

export function getDb(): Sql | null {
  if (cached) return cached
  const url = process.env.DATABASE_URL
  if (!url) return null
  cached = postgres(url, {
    max: 10,
    idle_timeout: 30,
    prepare: false,
  })
  return cached
}
