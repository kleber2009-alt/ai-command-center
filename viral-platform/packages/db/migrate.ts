import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

/**
 * Production migrator (run on deploy). Ensures the pgvector extension exists,
 * applies the generated Drizzle migrations, then applies the custom SQL
 * migrations drizzle-kit can't codegen (the halfvec HNSW indexes, §6/§4.6).
 * Idempotent: safe to re-run.
 */
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const here = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = join(here, 'migrations');
const customFolder = join(migrationsFolder, 'custom');

const sql = postgres(url, { max: 1 });
const db = drizzle(sql);

await sql`CREATE EXTENSION IF NOT EXISTS vector`;
console.log('[migrate] pgvector ready');

await migrate(db, { migrationsFolder });
console.log('[migrate] drizzle migrations applied');

for (const file of readdirSync(customFolder)
  .filter((f) => f.endsWith('.sql'))
  .sort()) {
  await sql.unsafe(readFileSync(join(customFolder, file), 'utf8'));
  console.log(`[migrate] custom applied: ${file}`);
}

await sql.end();
console.log('[migrate] done');
