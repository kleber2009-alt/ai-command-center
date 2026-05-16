// ═══════════════════════════════════════════════════════════════════
// netlify/functions/voice-list.js
// ───────────────────────────────────────────────────────────────────
// GET /api/voice-list?owner=@username
//   → { ok, current: {...} | null, archived: [...] }
//
// Возвращает активный голос владельца + историю архивных.
// Использует anon-key (RLS allows SELECT), service-key не нужен.
//
// Env vars:
//   SUPABASE_URL       — https://xxx.supabase.co
//   SUPABASE_ANON_KEY? — anon-key (если не задан — пробуем SUPABASE_SERVICE_KEY)
// ═══════════════════════════════════════════════════════════════════

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

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !KEY) {
    return json(503, { error: 'supabase_not_configured' });
  }

  const url = new URL(request.url);
  const owner = (url.searchParams.get('owner') || '').trim();
  if (!owner) return json(400, { error: 'owner_required' });

  const headers = {
    apikey: KEY,
    Authorization: `Bearer ${KEY}`,
    Accept: 'application/json',
  };

  const [activeRes, archivedRes] = await Promise.all([
    fetch(
      `${SUPABASE_URL}/rest/v1/voices?owner_handle=eq.${encodeURIComponent(owner)}&archived_at=is.null&select=id,display_name,provider,provider_voice_id,sample_seconds,created_at&order=created_at.desc&limit=1`,
      { headers },
    ),
    fetch(
      `${SUPABASE_URL}/rest/v1/voices?owner_handle=eq.${encodeURIComponent(owner)}&archived_at=not.is.null&select=id,display_name,created_at,archived_at&order=archived_at.desc&limit=10`,
      { headers },
    ),
  ]);

  if (!activeRes.ok) {
    const txt = await activeRes.text();
    return json(activeRes.status, { error: 'supabase_query_failed', details: txt.slice(0, 400) });
  }

  const [active] = await activeRes.json();
  const archived = archivedRes.ok ? await archivedRes.json() : [];

  return json(200, {
    ok: true,
    current: active || null,
    archived,
  });
};

export const config = { path: '/api/voice-list' };
