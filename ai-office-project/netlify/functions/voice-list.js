// ═══════════════════════════════════════════════════════════════════
// netlify/functions/voice-list.js
// ───────────────────────────────────────────────────────────────────
// GET /api/voice-list?owner=@username
//   → { ok, current: {...} | null, archived: [...] }
//
// Self-hosted: читает из локального Postgres (таблица voices).
// ═══════════════════════════════════════════════════════════════════

import { query, isDbConfigured } from '../../server/db.js';

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    },
  });
}

export default async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
      },
    });
  }
  if (request.method !== 'GET') return json(405, { error: 'method_not_allowed' });
  if (!isDbConfigured()) return json(503, { error: 'db_not_configured' });

  const url = new URL(request.url);
  const owner = (url.searchParams.get('owner') || '').trim();
  if (!owner) return json(400, { error: 'owner_required' });

  try {
    const [activeRes, archivedRes] = await Promise.all([
      query(
        `select id, display_name, provider, provider_voice_id, sample_seconds, created_at
           from voices
          where owner_handle = $1 and archived_at is null
          order by created_at desc
          limit 1`,
        [owner],
      ),
      query(
        `select id, display_name, created_at, archived_at
           from voices
          where owner_handle = $1 and archived_at is not null
          order by archived_at desc
          limit 10`,
        [owner],
      ),
    ]);

    return json(200, {
      ok: true,
      current: activeRes?.rows[0] || null,
      archived: archivedRes?.rows || [],
    });
  } catch (e) {
    return json(500, { error: 'db_query_failed', message: String(e?.message || e) });
  }
};

export const config = { path: '/api/voice-list' };
