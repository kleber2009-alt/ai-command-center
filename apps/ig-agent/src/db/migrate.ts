// Idempotent migration runner. Applies every src/db/migrations/*.sql
// once, in lexical order, recording the filename in schema_migrations.
//
// Run via `npm run migrate` (uses tsx) or via openDb's startup hook.

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadConfig } from '../config.js';
import { createLogger } from '../logger.js';
import { openDb, query, type DbPool } from './index.js';

const here = dirname(fileURLToPath(import.meta.url));
// At runtime in Docker the file lives under dist/db/, so migrations sit
// alongside as dist/db/migrations/. In dev (tsx) they're in src/db/migrations/.
const MIGRATIONS_DIR = resolve(here, 'migrations');

const BOOTSTRAP_TRACKING = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

export async function runMigrations(pool: DbPool): Promise<void> {
  await pool.query(BOOTSTRAP_TRACKING);

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const applied = await query<{ name: string }>(
      pool,
      'SELECT name FROM schema_migrations WHERE name = $1',
      [file],
    );
    if (applied.length > 0) continue;

    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      // eslint-disable-next-line no-console
      console.log(`migrate: applied ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

// CLI entrypoint: `npm run migrate`.
async function main(): Promise<void> {
  const cfg = loadConfig();
  const logger = createLogger(cfg.logLevel);
  const pool = openDb({ connectionString: cfg.databaseUrl, logger });
  try {
    await runMigrations(pool);
    logger.info('migrations complete');
  } finally {
    await pool.end();
  }
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]).endsWith('migrate.js');
const invokedAsTsx =
  process.argv[1] !== undefined && resolve(process.argv[1]).endsWith('migrate.ts');

if (invokedDirectly || invokedAsTsx) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('migrate failed:', err);
    process.exit(1);
  });
}
