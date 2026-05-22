/* ═══════════════════════════════════════════════════════════════════
   mock-backend.js — браузерный mock-бэкенд для тестирования flow
   ───────────────────────────────────────────────────────────────────
   Что делает:
   · Перехватывает вызовы к Supabase / YooKassa / Telegram / Resend
   · Возвращает реалистичные ответы (latency 200-800ms имитируется)
   · Хранит данные в state.js (localStorage)
   · Позволяет протестировать ВЕСЬ flow «бриф → оплата → подписка → кабинет»
     БЕЗ реального backend

   Активация:
   · Автоматически активен, если window.AIO_MOCK_BACKEND !== false
   · Для отключения: <script>window.AIO_MOCK_BACKEND = false;</script>
     до загрузки этого файла
   · Когда подключишь реальный Supabase/YooKassa — установи false

   Что эмулируется:
   · POST https://*.supabase.co/rest/v1/*       → insert/select/update в state
   · POST https://api.yookassa.ru/v3/payments   → выдача fake payment URL
   · POST https://api.telegram.org/bot*/sendMessage → лог в console
   · POST https://api.resend.com/emails         → лог в console
   · GET  /api/mock-status                       → статус mock-mode

   Real-mode passthrough:
   · /api/chat (Anthropic) — НЕ перехватывается, реально летит
   · Свои origin-запросы (state.js etc) — не перехватываются
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  if (window.__aioMockBackendLoaded) return;
  window.__aioMockBackendLoaded = true;

  // ── Активация ──
  // По умолчанию ВЫКЛЮЧЕН в production (real backend подключён через config.js).
  // На /test.html и /dev-tools.html можно временно включить:
  //   <script>window.AIO_MOCK_BACKEND = true;</script> ПЕРЕД mock-backend.js
  // По умолчанию config.js устанавливает AIO_MOCK_BACKEND=false.
  const ENABLED = window.AIO_MOCK_BACKEND === true;
  if (!ENABLED) {
    if (window.console) console.log('%c[mock-backend] disabled · real backend active', 'color:#34d058;font-weight:700');
    return;
  }

  const DEBUG = window.AIO_MOCK_DEBUG === true;

  // ── Mock-storage keys (используем AIOState если доступен) ──
  const S = window.AIOState;
  function ensureKeys() {
    if (!S) return null;
    return {
      MOCK_LEADS:        'aio_mock_supabase_leads',
      MOCK_BRIEFS:       'aio_mock_supabase_briefs',
      MOCK_PAYMENTS:     'aio_mock_yookassa_payments',
      MOCK_SUBSCRIPTIONS:'aio_mock_subscriptions',
      MOCK_EMAILS_SENT:  'aio_mock_emails_sent',
      MOCK_TG_SENT:      'aio_mock_tg_sent',
    };
  }
  const MK = ensureKeys();

  // ── Helpers ──
  const delay = (ms) => new Promise(r => setTimeout(r, ms));
  const rand = (min, max) => min + Math.random() * (max - min);
  const uuid = () => 'mock_' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);

  function pushToKey(key, item) {
    if (!S) return;
    const arr = S.get(key, []) || [];
    arr.push(item);
    S.set(key, arr);
  }

  function logMock(handler, url, payload, response) {
    if (!DEBUG) return;
    console.log(
      `%c[mock] ${handler}`, 'color:#c8f060;font-weight:700',
      '\n  → URL:', url,
      '\n  → IN: ', payload,
      '\n  ← OUT:', response
    );
  }

  // ── Mock-helpers per handler ──

  /** Supabase REST mock — все таблицы пишем в state.js */
  async function mockSupabase(url, init) {
    await delay(rand(150, 450));

    const method = (init && init.method || 'GET').toUpperCase();
    let body = {};
    try { body = init && init.body ? JSON.parse(init.body) : {}; } catch {}

    // Парсим путь: /rest/v1/<table>
    const m = url.match(/\/rest\/v1\/([a-z_]+)/i);
    const table = m ? m[1] : 'unknown';

    if (method === 'POST') {
      // Insert
      const inserted = Array.isArray(body) ? body : [body];
      const out = inserted.map(row => ({
        id: uuid(),
        ...row,
        created_at: new Date().toISOString(),
      }));
      // Сохраняем в локальный mock-store
      const storageKey = `aio_mock_supabase_${table}`;
      if (S) {
        const cur = S.get(storageKey, []) || [];
        out.forEach(r => cur.push(r));
        S.set(storageKey, cur);
      }
      logMock('supabase.insert', url, body, out);
      return jsonResponse(201, out);
    }

    if (method === 'GET') {
      const storageKey = `aio_mock_supabase_${table}`;
      const data = S ? S.get(storageKey, []) : [];
      logMock('supabase.select', url, {}, data);
      return jsonResponse(200, data);
    }

    if (method === 'PATCH') {
      logMock('supabase.update', url, body, body);
      return jsonResponse(200, body);
    }

    if (method === 'DELETE') {
      logMock('supabase.delete', url, {}, { deleted: true });
      return jsonResponse(204, null);
    }

    return jsonResponse(405, { error: 'Method not allowed in mock' });
  }

  /** YooKassa mock — создаём fake-платёж, возвращаем confirmation_url */
  async function mockYooKassa(url, init) {
    await delay(rand(300, 700));
    let body = {};
    try { body = init && init.body ? JSON.parse(init.body) : {}; } catch {}

    const isPaymentCreate = url.includes('/v3/payments') && !url.includes('/capture') && !url.includes('/cancel');

    if (isPaymentCreate) {
      const paymentId = uuid();
      const amount = body.amount || { value: '1990.00', currency: 'RUB' };
      const description = body.description || 'AI Office subscription';

      const mockPayment = {
        id: paymentId,
        status: 'pending',
        amount,
        description,
        confirmation: {
          type: 'redirect',
          // В реальности — yoomoney.ru/checkout/payments/v2/contract/...
          // Здесь — наш mock-чекаут
          confirmation_url: `${location.origin}/mock-payment.html?id=${paymentId}&amount=${amount.value}&desc=${encodeURIComponent(description)}`,
        },
        created_at: new Date().toISOString(),
        test: true,
        paid: false,
        refundable: false,
      };

      pushToKey(MK?.MOCK_PAYMENTS || 'aio_mock_yookassa_payments', mockPayment);
      logMock('yookassa.create_payment', url, body, mockPayment);
      return jsonResponse(200, mockPayment);
    }

    return jsonResponse(200, { id: uuid(), status: 'mocked' });
  }

  /** Telegram Bot API mock — логируем сообщения, не шлём */
  async function mockTelegram(url, init) {
    await delay(rand(80, 200));
    let body = {};
    try { body = init && init.body ? JSON.parse(init.body) : {}; } catch {}

    // POST /bot<token>/sendMessage
    if (url.includes('/sendMessage') || url.includes('/sendPhoto')) {
      const message = {
        message_id: Math.floor(Math.random() * 1e6),
        chat: { id: body.chat_id, type: 'private' },
        date: Math.floor(Date.now() / 1000),
        text: body.text,
      };
      pushToKey(MK?.MOCK_TG_SENT || 'aio_mock_tg_sent', { ...body, at: Date.now(), id: message.message_id });
      logMock('telegram.send', url, body, message);
      return jsonResponse(200, { ok: true, result: message });
    }

    return jsonResponse(200, { ok: true });
  }

  /** Resend / Brevo email mock — логируем, не шлём */
  async function mockEmailSend(url, init) {
    await delay(rand(200, 500));
    let body = {};
    try { body = init && init.body ? JSON.parse(init.body) : {}; } catch {}

    const message = {
      id: 'mock_email_' + uuid(),
      from: body.from,
      to: body.to,
      subject: body.subject,
      html_size: (body.html || '').length,
      created_at: new Date().toISOString(),
    };
    pushToKey(MK?.MOCK_EMAILS_SENT || 'aio_mock_emails_sent', message);
    logMock('email.send', url, body, message);
    return jsonResponse(200, message);
  }

  function jsonResponse(status, payload) {
    return new Response(JSON.stringify(payload), {
      status,
      headers: {
        'Content-Type': 'application/json',
        'X-Mock-Backend': 'true',
      },
    });
  }

  // ── Pattern matching ──
  const RULES = [
    { name: 'supabase', test: (url) => /supabase\.co\/rest\/v1\//.test(url), handler: mockSupabase },
    { name: 'supabase-auth', test: (url) => /supabase\.co\/auth\//.test(url), handler: mockSupabaseAuth },
    { name: 'yookassa', test: (url) => /api\.yookassa\.ru/.test(url), handler: mockYooKassa },
    { name: 'telegram', test: (url) => /api\.telegram\.org\/bot/.test(url), handler: mockTelegram },
    { name: 'resend',   test: (url) => /api\.resend\.com\/emails/.test(url), handler: mockEmailSend },
    { name: 'brevo',    test: (url) => /api\.brevo\.com\/v3\/smtp\/email/.test(url), handler: mockEmailSend },
  ];

  /** Supabase Auth mock — magic link */
  async function mockSupabaseAuth(url, init) {
    await delay(rand(300, 600));
    let body = {};
    try { body = init && init.body ? JSON.parse(init.body) : {}; } catch {}

    if (url.includes('/otp') || url.includes('/magiclink')) {
      // Имитируем выдачу magic link
      const email = body.email;
      console.log('%c[mock] Magic link sent to ' + email, 'color:#34d058;font-weight:700');
      console.log('%c  В реальности тут уйдёт письмо. В mock — auto-login через 1 сек.', 'color:#9aa3b2');

      // Эмулируем «клик по ссылке» — устанавливаем сессию
      setTimeout(() => {
        if (S) {
          S.set(S.KEYS.PROFILE, {
            email,
            authenticated: true,
            session_id: 'mock_sess_' + uuid(),
            authenticated_at: new Date().toISOString(),
            via: 'mock_magic_link',
          });
          window.dispatchEvent(new CustomEvent('aio:auth', { detail: { email } }));
        }
      }, 1000);

      return jsonResponse(200, { user: null, session: null });
    }

    return jsonResponse(200, { mocked: true });
  }

  // ── Patch fetch ──
  const _origFetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    const url = (typeof input === 'string') ? input : (input && input.url) || '';

    for (const rule of RULES) {
      if (rule.test(url)) {
        try {
          return await rule.handler(url, init);
        } catch (e) {
          console.warn(`[mock-backend] ${rule.name} handler error:`, e);
          return jsonResponse(500, { error: String(e.message || e) });
        }
      }
    }

    return _origFetch(input, init);
  };

  // ── Helper: list captured data ──
  window.aioMockStatus = function () {
    if (!S) return { enabled: ENABLED, error: 'AIOState not available' };
    const stats = {
      enabled: ENABLED,
      payments: (S.get(MK.MOCK_PAYMENTS, []) || []).length,
      subscriptions: (S.get(MK.MOCK_SUBSCRIPTIONS, []) || []).length,
      emails: (S.get(MK.MOCK_EMAILS_SENT, []) || []).length,
      tg_messages: (S.get(MK.MOCK_TG_SENT, []) || []).length,
      supabase_tables: {},
    };
    // Найдём все mock_supabase_* ключи
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('aio_mock_supabase_')) {
          const tbl = k.replace('aio_mock_supabase_', '');
          stats.supabase_tables[tbl] = (S.get(k, []) || []).length;
        }
      }
    } catch {}
    return stats;
  };

  // ── Visible banner on load (только в /test, /dev-tools, /leads-inbox) ──
  function maybeShowBanner() {
    const showOn = ['/test.html', '/dev-tools.html', '/leads-inbox.html', '/mock-payment.html'];
    if (!showOn.some(p => location.pathname.endsWith(p))) return;
    if (document.getElementById('aio-mock-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'aio-mock-banner';
    banner.style.cssText = `
      position: fixed; left: 16px; bottom: 16px; z-index: 9999;
      background: linear-gradient(135deg, rgba(240,180,41,.18), rgba(240,96,200,.12));
      border: 1px solid rgba(240,180,41,.4);
      color: #f0b429; padding: 8px 14px; border-radius: 99px;
      font: 700 11px/1 -apple-system, sans-serif;
      letter-spacing: .4px; backdrop-filter: blur(12px);
      box-shadow: 0 4px 12px rgba(0,0,0,.4);
      cursor: pointer; user-select: none;
    `;
    banner.innerHTML = '⚠ MOCK BACKEND ACTIVE · клик для статуса';
    banner.onclick = () => {
      const s = window.aioMockStatus();
      alert(JSON.stringify(s, null, 2));
    };
    if (document.body) {
      document.body.appendChild(banner);
    } else {
      window.addEventListener('DOMContentLoaded', () => document.body.appendChild(banner));
    }
  }
  maybeShowBanner();

  // ── Console message ──
  console.log(
    '%c[mock-backend]%c ACTIVE · перехватывает Supabase/YooKassa/TG/Resend\n%cwindow.aioMockStatus() — статистика | window.AIO_MOCK_BACKEND=false — отключить',
    'background:#c8f060;color:#080808;padding:2px 6px;border-radius:3px;font-weight:700',
    'color:#34d058;font-weight:700;margin-left:6px',
    'color:#9aa3b2;font-size:11px'
  );
})();
