// hq.aicex.club: статика офиса отдаётся напрямую, Worker стоит только перед /academy-files/*.
// Там лежат скиллы AICEX для учеников академии — их отдаём по коду ученика «имя-XXXXXX».
// Код = имя + первые 6 символов base32(HMAC-SHA256(ACADEMY_SECRET, имя)); секрет — в Worker secrets.
// Отозвать код: имя в переменную ACADEMY_REVOKED (через запятую).

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const enc = new TextEncoder();

async function signature(secret, label) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(label)));
  let out = '', bits = 0, acc = 0;
  for (const byte of mac) {
    acc = ((acc << 8) | byte) & 0xffff; bits += 8;
    while (bits >= 5 && out.length < 6) { out += B32[(acc >>> (bits - 5)) & 31]; bits -= 5; }
    if (out.length === 6) break;
  }
  return out;
}

async function validCode(env, code) {
  const m = String(code || '').trim().match(/^([a-z0-9]{2,24})-([a-z2-7]{6})$/i);
  const secret = String(env.ACADEMY_SECRET || '').trim();
  if (!m || !secret) return false;
  const label = m[1].toLowerCase();
  const revoked = String(env.ACADEMY_REVOKED || '').toLowerCase().split(',').map((s) => s.trim());
  if (revoked.includes(label)) return false;
  const want = enc.encode(await signature(secret, label)), got = enc.encode(m[2].toUpperCase());
  return want.length === got.length && crypto.subtle.timingSafeEqual(want, got);
}

const DENY = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Нужен код ученика</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0e1016;color:#f4f6fa;font:16px/1.5 system-ui,sans-serif}main{max-width:420px;padding:24px}h1{font-size:22px;margin:0 0 8px}a{color:#ffb020}</style></head>
<body><main><h1>Нужен код ученика</h1><p>Скиллы AICEX скачиваются по коду ученика. Код приходит после оплаты академии — в письме или в чате потока.</p>
<p>Введи его в академии: «Решения» → «Ввести код». Код выглядит так: anna-7KQ2MX.</p><p><a href="/academy">Вернуться в академию</a></p></main></body></html>`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/academy-files/')) return env.ASSETS.fetch(request);
    const code = url.searchParams.get('code') || request.headers.get('x-academy-code');
    if (!(await validCode(env, code))) {
      return new Response(DENY, { status: 403, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
    }
    const res = await env.ASSETS.fetch(new Request(new URL(url.pathname, url.origin), request));
    if (!res.ok) return res;
    const headers = new Headers(res.headers);
    headers.set('cache-control', 'private, no-store');
    const name = url.pathname.split('/').pop();
    if (name.endsWith('.zip')) headers.set('content-disposition', `attachment; filename="${name}"`);
    return new Response(res.body, { status: res.status, headers });
  },
};
