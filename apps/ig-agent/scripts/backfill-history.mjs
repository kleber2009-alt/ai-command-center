#!/usr/bin/env node
// One-shot: walk every contact and pull their full SendPulse chat history
// into the local messages table. Idempotent — safe to re-run.
//
// Usage (inside ig-agent container):
//   node scripts/backfill-history.mjs
//
// Optional: pass a contact UUID to backfill just one contact:
//   node scripts/backfill-history.mjs <contact-uuid>

import http from 'node:http';

const PORT = Number(process.env.PORT ?? process.env.ADMIN_PORT ?? 8081);
const TOKEN = process.env.X_INTERNAL_AUTH ?? process.env.INTERNAL_API_TOKEN ?? '';

function call(method, path, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path,
        method,
        headers: TOKEN
          ? { 'X-Internal-Auth': TOKEN, 'content-type': 'application/json' }
          : { 'content-type': 'application/json' },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try {
            json = body ? JSON.parse(body) : null;
          } catch {
            // surface non-JSON responses as-is to the caller below
          }
          resolve({ status: res.statusCode ?? 0, body, json });
        });
      },
    );
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('timeout'));
    });
    req.end();
  });
}

async function main() {
  const targeted = process.argv[2]?.trim();

  let ids = [];
  if (targeted) {
    ids = [targeted];
  } else {
    const list = await call('GET', '/api/contacts?limit=500');
    if (list.status !== 200) {
      console.error('list failed:', list.status, list.body.slice(0, 200));
      process.exit(2);
    }
    ids = (list.json?.contacts ?? []).map((c) => c.id);
  }

  console.log(`backfilling ${ids.length} contact(s)...`);
  let totals = { fetched: 0, inserted: 0, skipped: 0, failed: 0 };

  for (let i = 0; i < ids.length; i += 1) {
    const id = ids[i];
    const r = await call('POST', `/api/contacts/${encodeURIComponent(id)}/backfill?limit=500`, 60000);
    if (r.status === 200 && r.json?.ok) {
      totals.fetched += r.json.fetched ?? 0;
      totals.inserted += r.json.inserted ?? 0;
      totals.skipped += r.json.skipped ?? 0;
      const tag = r.json.inserted ? '+' + r.json.inserted : '·';
      console.log(`[${i + 1}/${ids.length}] ${id} ${tag} (fetched=${r.json.fetched}, skipped=${r.json.skipped})`);
    } else {
      totals.failed += 1;
      console.warn(`[${i + 1}/${ids.length}] ${id} FAILED status=${r.status} ${r.body.slice(0, 160)}`);
    }
    // Stay polite to SendPulse — 100ms between calls is plenty for ~hundreds of contacts.
    await new Promise((res) => setTimeout(res, 100));
  }

  console.log('\nDONE', totals);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
