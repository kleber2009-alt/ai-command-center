/* ═══════════════════════════════════════════════════════════════════
   sw.js — Service Worker для AI Growth Office PWA
   ───────────────────────────────────────────────────────────────────
   Стратегия:
   · Static HTML/JS/CSS/images → Cache First с фоновым refresh
   · /api/chat и /.netlify/functions/ → Network Only (никогда не кешируем)
   · Внешние fetch (Anthropic, Supabase, Telegram, fonts) → Network First
   · Offline fallback на главную если ничего нет
   ═══════════════════════════════════════════════════════════════════ */

const CACHE_VERSION = 'aio-v1.4.0';
const CACHE_NAME = `aio-cache-${CACHE_VERSION}`;

// Что предзагружаем при установке
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/onboarding.html',
  '/recommend.html',
  '/dashboard.html',
  '/agents.html',
  '/pipeline.html',
  '/hub.html',
  '/marketing-workspace.html',
  '/tech-workspace.html',
  '/sales-workspace.html',
  '/cases.html',
  '/pricing.html',
  '/faq.html',
  '/privacy.html',
  '/terms.html',
  '/lead-magnet.html',
  '/lead-magnet-gate.html',
  '/about.html',
  '/glossary.html',
  '/whats-new.html',
  '/navigation.html',
  '/404.html',
  '/sidebar.js',
  '/cookies.js',
  '/api-fallback.js',
  '/state.js',
  '/analytics.js',
  '/alisa-widget.js',
  '/manifest.json',
  '/og-image.jpg',
];

// Никогда не кешировать
const NEVER_CACHE_PATTERNS = [
  /\/api\//,
  /\/\.netlify\//,
  /api\.anthropic\.com/,
  /api\.telegram\.org/,
  /supabase\.co/,
];

// Internal external (кешируем но с network-first)
const NETWORK_FIRST_PATTERNS = [
  /fonts\.googleapis\.com/,
  /fonts\.gstatic\.com/,
  /unpkg\.com/,
];

// ─── INSTALL ───
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS).catch(err => {
        // Не падаем если какой-то файл не загрузился — просто логируем
        console.warn('[SW] Precache partial failure:', err);
      }))
      .then(() => self.skipWaiting())
  );
});

// ─── ACTIVATE ───
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME && k.startsWith('aio-cache-'))
            .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ─── FETCH ───
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Только GET — POST/PUT и т.д. не кешируем
  if (req.method !== 'GET') return;

  // Network only для API (никогда не кешируем)
  if (NEVER_CACHE_PATTERNS.some(p => p.test(url.href))) {
    return; // browser handles natively
  }

  // Network first для шрифтов/CDN
  if (NETWORK_FIRST_PATTERNS.some(p => p.test(url.href))) {
    event.respondWith(networkFirst(req));
    return;
  }

  // Cache first для same-origin (наши ассеты)
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // Всё остальное (другие домены) — network first без кеша
});

async function cacheFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req);
  if (cached) {
    // Background refresh — не блокирует ответ
    fetch(req).then(res => {
      if (res && res.ok && res.type !== 'opaque') cache.put(req, res.clone());
    }).catch(() => {});
    return cached;
  }
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (e) {
    // Offline fallback: на главную
    const fallback = await cache.match('/index.html') || await cache.match('/');
    if (fallback) return fallback;
    return new Response('Offline · нет соединения', {
      status: 503,
      headers: {'Content-Type': 'text/plain; charset=utf-8'}
    });
  }
}

async function networkFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const res = await fetch(req);
    if (res && res.ok && res.type !== 'opaque') cache.put(req, res.clone());
    return res;
  } catch (e) {
    const cached = await cache.match(req);
    if (cached) return cached;
    throw e;
  }
}

// ─── MESSAGE (для force-update от клиента) ───
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
