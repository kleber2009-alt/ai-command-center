// GET /api/research/thumb?u=<encoded Instagram CDN url>
// Прокси для превью/аватаров из Instagram. Картинки IG CDN отдаются с
// заголовком `cross-origin-resource-policy: same-origin`, из-за чего браузер
// блокирует их встраивание через <img> с нашего домена. Проксируем через
// свой origin (CORP на сервер не распространяется) — браузер грузит уже
// same-origin картинку.
//
// SSRF-защита: строгий allowlist хостов (только *.cdninstagram.com и
// *.fbcdn.net), только https, ответ обязан быть image/*.

import { NextRequest } from 'next/server';

export const runtime = 'nodejs';

const ALLOWED_HOST = /(?:^|\.)(?:cdninstagram\.com|fbcdn\.net)$/i;
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB — превью заведомо меньше

export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get('u');
  if (!u) return new Response('missing u', { status: 400 });

  let url: URL;
  try {
    url = new URL(u);
  } catch {
    return new Response('bad url', { status: 400 });
  }
  if (url.protocol !== 'https:' || !ALLOWED_HOST.test(url.hostname)) {
    return new Response('host not allowed', { status: 403 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(url.toString(), {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'image/*,*/*' },
      // Без Referer — IG CDN иначе может ответить 403.
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return new Response('upstream fetch failed', { status: 502 });
  }
  if (!upstream.ok) return new Response(`upstream ${upstream.status}`, { status: 502 });

  const ct = upstream.headers.get('content-type') || '';
  if (!ct.startsWith('image/')) return new Response('not an image', { status: 415 });

  const len = Number(upstream.headers.get('content-length') || 0);
  if (len > MAX_BYTES) return new Response('too large', { status: 413 });

  const buf = await upstream.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) return new Response('too large', { status: 413 });

  return new Response(buf, {
    status: 200,
    headers: {
      'Content-Type': ct,
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    },
  });
}
