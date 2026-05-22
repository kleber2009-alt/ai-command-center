/* ═══════════════════════════════════════════════════════════════════
   analytics.js — лёгкий трекер событий AI Growth Office
   ───────────────────────────────────────────────────────────────────
   · Зависит от state.js (должен быть подключён ранее)
   · Сейчас пишет события в localStorage (max 500 последних)
   · Готов под GA4 и Yandex.Metrika — задай AIO_GA4_ID / AIO_YM_ID
   · API: AIOAnalytics.track(event, props), .pageView(), .ctaClick(label)
   · Авто-page_view при загрузке, авто-tracking кликов по [data-track]
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  if (window.AIOAnalytics) return;
  if (!window.AIOState) {
    console.warn('[analytics] state.js not loaded — events будут только в console');
  }

  const MAX_EVENTS = 500;
  const KEY = (window.AIOState && window.AIOState.KEYS.ANALYTICS) || 'aio_analytics_queue';
  const DEBUG = !!window.AIO_ANALYTICS_DEBUG;

  // ── External providers — задаются на странице через window.AIO_GA4_ID / AIO_YM_ID ──
  const GA4_ID = window.AIO_GA4_ID || null;
  const YM_ID  = window.AIO_YM_ID  || null;

  function pushEvent(ev) {
    if (!window.AIOState) return;
    const arr = window.AIOState.get(KEY, []) || [];
    arr.push(ev);
    // обрезаем до MAX_EVENTS — храним только последние
    if (arr.length > MAX_EVENTS) arr.splice(0, arr.length - MAX_EVENTS);
    window.AIOState.set(KEY, arr);
  }

  function buildEvent(name, props) {
    return {
      event: name,
      props: props || {},
      ts: Date.now(),
      iso: new Date().toISOString(),
      url: location.pathname,
      title: document.title,
      session: window.AIOState ? window.AIOState.getSessionId() : null,
      ref: window.AIOState ? window.AIOState.getReferral() : null,
    };
  }

  const api = {
    /** Track arbitrary event. */
    track(name, props) {
      const ev = buildEvent(name, props);
      pushEvent(ev);
      if (DEBUG) console.log('[track]', name, props);

      // GA4 (gtag)
      if (GA4_ID && window.gtag) {
        try { window.gtag('event', name, props || {}); } catch {}
      }
      // Yandex.Metrika
      if (YM_ID && window.ym) {
        try { window.ym(YM_ID, 'reachGoal', name, props); } catch {}
      }
    },

    pageView() {
      this.track('page_view', { title: document.title, path: location.pathname });
    },

    ctaClick(label, extra = {}) {
      this.track('cta_click', { label, ...extra });
    },

    formSubmit(formName, extra = {}) {
      this.track('form_submit', { form: formName, ...extra });
    },

    formError(formName, error, extra = {}) {
      this.track('form_error', { form: formName, error: String(error), ...extra });
    },

    /** Get recent events. */
    recent(limit = 50) {
      if (!window.AIOState) return [];
      const arr = window.AIOState.get(KEY, []) || [];
      return arr.slice(-limit).reverse();
    },

    /** Clear all events. */
    clear() {
      if (!window.AIOState) return;
      window.AIOState.delete(KEY);
    },

    /** Stats summary. */
    stats() {
      if (!window.AIOState) return { total: 0 };
      const arr = window.AIOState.get(KEY, []) || [];
      const by = {};
      arr.forEach(e => { by[e.event] = (by[e.event] || 0) + 1; });
      return { total: arr.length, byEvent: by };
    },
  };

  // ── Auto-pageview on load ──
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(() => api.pageView(), 0);
  } else {
    window.addEventListener('DOMContentLoaded', () => api.pageView());
  }

  // ── Auto-track clicks on [data-track] ──
  document.addEventListener('click', e => {
    const target = e.target.closest('[data-track]');
    if (!target) return;
    const name = target.dataset.track;
    const label = target.dataset.trackLabel || target.textContent.trim().slice(0, 80);
    api.track(name, { label, href: target.href || null });
  }, { capture: true });

  window.AIOAnalytics = api;
})();
