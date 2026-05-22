// ═══════════════════════════════════════════════════════════════════
// lib/db.js — Postgres pool + tiny query helpers
// ═══════════════════════════════════════════════════════════════════

import pg from 'pg';

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[db] DATABASE_URL is required');
  process.exit(1);
}

export const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  console.error('[db] idle client error:', err.message);
});

/** Run a query, return rows. */
export async function query(text, params) {
  const res = await pool.query(text, params);
  return res.rows;
}

/** Run a query, return first row or null. */
export async function queryOne(text, params) {
  const rows = await query(text, params);
  return rows[0] || null;
}

/** Wait until DB is reachable. Used during container startup. */
export async function waitForDb(timeoutMs = 60_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await pool.query('select 1');
      return true;
    } catch (e) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error('Database not reachable after ' + timeoutMs + 'ms');
}
