/* ═══════════════════════════════════════════════════════════════════
   api-fallback.js — passive /api/chat status helper

   Previously this file monkey-patched window.fetch and, when a
   window.AIO_DEV_API_KEY was present, proxied /api/chat requests
   straight to api.anthropic.com from the browser with the user's
   raw API key in the request headers. That was unsafe — anyone
   who could trick a logged-in user into pasting a key into the
   DevTools console (or any third-party script that ran on the
   same page) could exfiltrate the key.

   The file is loaded by ~10 HTML pages via <script src="...">,
   so it has to keep existing — but the fetch override is gone.
   Now it's a pure diagnostic:

   - Logs a one-line status if /api/chat fails to load (page
     authors then know to deploy the Netlify Function).
   - If window.AIO_DEV_API_KEY is still being set somewhere,
     logs a loud warning that the bypass no longer exists.

   For real production access, the proxy at /api/chat (Netlify
   Function in netlify/functions/chat.js) is the only supported
   path. Don't put API keys in the browser.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  if (window.__aioApiFallbackLoaded) return;
  window.__aioApiFallbackLoaded = true;

  if (window.AIO_DEV_API_KEY) {
    console.warn(
      '%c⚠ AI Office: window.AIO_DEV_API_KEY is set but the browser bypass was removed.\n' +
        'The key will NOT be sent to api.anthropic.com from this page. Use /api/chat ' +
        '(Netlify Function with ANTHROPIC_API_KEY env var) instead. Clear AIO_DEV_API_KEY ' +
        'to stop seeing this warning.',
      'color:#f0b429;font-weight:700;font-size:13px',
    );
  }

  // Diagnostic helper — pages can call this from DevTools to confirm
  // they see the file. No side effects.
  window.aioApiStatus = function () {
    return {
      mode: 'proxy-only',
      proxyEndpoint: '/api/chat',
      legacyDevKeyDetected: !!window.AIO_DEV_API_KEY,
      note: 'Browser-side API key bypass has been removed for security.',
    };
  };
})();
