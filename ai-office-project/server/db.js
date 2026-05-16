// ═══════════════════════════════════════════════════════════════════
// server/db.js
// ───────────────────────────────────────────────────────────────────
// Singleton pg-пул для функций ai-office. Подключение определяется
// DATABASE_URL (или PG* переменными). Если URL не задан — возвращает
// null, и функции выше возвращают 503 «БД не настроена».
// ═══════════════════════════════════════════════════════════════════

import pg from 'pg';

const { Pool } = pg;

let cached = null;
let attempted = false;

export function getPool() {
  if (cached) return cached;
  if (attempted) return null;
  attempted = true;

  if (!process.env.DATABASE_URL && !process.env.PGHOST) return null;

  cached = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: parseInt(process.env.PG_POOL_MAX || '5', 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  cached.on('error', (err) => console.error('[pg] idle client error', err));
  return cached;
}

export function isDbConfigured() {
  return getPool() !== null;
}

export async function query(text, params) {
  const pool = getPool();
  if (!pool) return null;
  return pool.query(text, params);
}
