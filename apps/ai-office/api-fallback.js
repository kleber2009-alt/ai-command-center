/* ═══════════════════════════════════════════════════════════════════
   api-fallback.js — диагностический helper для /api/chat
   ───────────────────────────────────────────────────────────────────
   Не делает fallback на прямой Anthropic API (это было небезопасно —
   ключ в открытом виде в JS). Теперь:

   · Если /api/chat 404 → показывает понятную ошибку в DevTools
     и предлагает либо задеплоить Netlify Function, либо включить
     dev-mode через window.AIO_DEV_API_KEY (только в DevTools, не в файлах)
   · Если /api/chat работает → молча проходит мимо

   Для production-безопасности:
   1. Подключи GitHub-репо к Netlify (Site → Build → Link repo)
   2. Установи ANTHROPIC_API_KEY в Site Settings → Environment Variables
   3. Functions деплоятся автоматически

   Для локального теста (если очень нужно):
   В DevTools Console:
     window.AIO_DEV_API_KEY = 'sk-ant-api03-...'
   Этот ключ не сохраняется и не уходит в репо.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  if (window.__aioApiFallbackLoaded) return;
  window.__aioApiFallbackLoaded = true;

  const PROXY  = '/api/chat';
  const DIRECT = 'https://api.anthropic.com/v1/messages';

  const _origFetch = window.fetch.bind(window);
  let mode = null; // 'proxy' | 'dev' | null

  function logFallback() {
    if (window.__aioFallbackWarned) return;
    window.__aioFallbackWarned = true;
    console.warn(
      '%c⚠ AI Office: /api/chat недоступен\n' +
      '%cЛибо Netlify Function не задеплоена, либо ANTHROPIC_API_KEY не установлен.\n' +
      'Подключи GitHub-репо к Netlify и установи env var.\n' +
      'Для локального теста: window.AIO_DEV_API_KEY = "sk-ant-..." в DevTools.',
      'color:#f0b429;font-weight:700;font-size:13px',
      'color:#7c6e8e;font-size:11px'
    );
  }

  function logProxyOk() {
    if (window.__aioProxyOkLogged) return;
    window.__aioProxyOkLogged = true;
    console.log('%c✓ AI Office: /api/chat работает', 'color:#34d058;font-weight:700');
  }

  window.fetch = async function (input, init) {
    const url = (typeof input === 'string') ? input : (input && input.url) || '';

    if (url === PROXY || url.endsWith('/api/chat')) {
      // Если уже знаем, что прокси сломан, и пользователь поставил dev-ключ — идём напрямую
      if (mode === 'dev' && window.AIO_DEV_API_KEY) {
        return _origFetch(DIRECT, {
          ...(init || {}),
          headers: {
            ...(init && init.headers || {}),
            'Content-Type': 'application/json',
            'x-api-key': window.AIO_DEV_API_KEY,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
        });
      }

      // Пробуем proxy
      let response;
      try {
        response = await _origFetch(PROXY, init);
      } catch (e) {
        mode = 'dev';
        logFallback();
        if (window.AIO_DEV_API_KEY) {
          return window.fetch(input, init); // retry с dev-ключом
        }
        throw new Error('AI Office API недоступен (см. console). Задеплой Netlify Function или установи window.AIO_DEV_API_KEY.');
      }

      const ct = response.headers.get('content-type') || '';
      if (response.status === 404 || ct.includes('text/html')) {
        mode = 'dev';
        logFallback();
        if (window.AIO_DEV_API_KEY) {
          return window.fetch(input, init); // retry с dev-ключом
        }
        // Возвращаем response как есть — пользовательский код увидит 404 / HTML
        return response;
      }

      // Прокси работает
      if (mode !== 'proxy') {
        mode = 'proxy';
        logProxyOk();
      }
      return response;
    }

    return _origFetch(input, init);
  };

  // Helper: показать статус API в console
  window.aioApiStatus = function () {
    return {
      mode: mode || 'unknown',
      devKeyPresent: !!window.AIO_DEV_API_KEY,
      proxyEndpoint: PROXY,
    };
  };
})();
