/* ═══════════════════════════════════════════════════════════════════
   state.js — центральный менеджер состояния AI Growth Office
   ───────────────────────────────────────────────────────────────────
   · Единый API над localStorage для всех страниц
   · Cross-tab sync через storage event
   · Same-tab pubsub
   · Capture ?ref= и UTM-параметров из URL при загрузке
   · Export/import JSON всего состояния
   · Подключается одной строкой: <script src="state.js"></script>
   · Доступен везде как window.AIOState
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  if (window.AIOState) return;

  const VERSION = '1.0.0';

  // ── Структурированные ключи (single source of truth) ──
  const KEYS = {
    BRIEF:        'aio_brief',                  // объект — onboarding form data
    TEAM:         'aio_team',                   // массив — выбранные агенты
    RECS:         'aio_recommendations',        // объект — кэш AI-рекомендаций
    RUNS:         'aio_runs',                   // массив — история запусков
    LEAD_MAGNET:  'aio_lead_magnet_v1',         // объект — email/tg захват PDF
    PARTNER_APPS: 'aio_partner_apps',           // массив — заявки в партнёрку
    VIDEO_LEADS:  'aio_video_leads',            // массив — подписки на видео
    ALISA_CHAT:   'aio_alisa_chat',             // массив — история чата с Алисой
    REFERRAL:     'aio_referral',               // объект — { ref, utm_*, captured_at }
    ANALYTICS:    'aio_analytics_queue',        // массив — события для отправки
    COOKIES:      'aio_cookies_consent_v1',     // строка — согласие на cookies
    PROFILE:      'aio_profile',                // объект — имя, email, settings
    SESSION:      'aio_session_id',             // строка — UUID сессии для аналитики
  };

  // ── Pubsub для same-tab подписчиков ──
  const listeners = new Map(); // key → Set<callback>

  function emit(key, value, oldValue) {
    const subs = listeners.get(key);
    if (!subs) return;
    subs.forEach(cb => { try { cb(value, oldValue, key); } catch (e) { console.warn('[state] listener error', e); } });
  }

  // ── Cross-tab sync через storage event ──
  window.addEventListener('storage', e => {
    if (!e.key || !e.key.startsWith('aio_')) return;
    const newVal = e.newValue ? safeParse(e.newValue) : null;
    const oldVal = e.oldValue ? safeParse(e.oldValue) : null;
    emit(e.key, newVal, oldVal);
  });

  function safeParse(s) {
    if (s === null || s === undefined) return null;
    try { return JSON.parse(s); } catch { return s; }
  }
  function safeStringify(v) {
    if (typeof v === 'string') return v;
    try { return JSON.stringify(v); } catch { return ''; }
  }

  // ── Core API ──
  const api = {
    KEYS,
    version: VERSION,

    get(key, fallback = null) {
      try {
        const raw = localStorage.getItem(key);
        if (raw === null) return fallback;
        return safeParse(raw);
      } catch (e) {
        console.warn('[state] get failed', key, e);
        return fallback;
      }
    },

    set(key, value) {
      const oldVal = api.get(key);
      try {
        localStorage.setItem(key, safeStringify(value));
        emit(key, value, oldVal);
        return true;
      } catch (e) {
        console.warn('[state] set failed (probably quota)', key, e);
        return false;
      }
    },

    /** Push item to array under key. Auto-creates array if missing. */
    push(key, item) {
      const arr = api.get(key, []);
      const list = Array.isArray(arr) ? arr : [];
      list.push(item);
      return api.set(key, list);
    },

    /** Merge object into existing object under key. */
    merge(key, partial) {
      const cur = api.get(key, {});
      const obj = (typeof cur === 'object' && cur !== null) ? cur : {};
      const next = { ...obj, ...partial };
      return api.set(key, next);
    },

    delete(key) {
      const oldVal = api.get(key);
      try {
        localStorage.removeItem(key);
        emit(key, null, oldVal);
        return true;
      } catch (e) { return false; }
    },

    /** Subscribe to changes. Returns unsubscribe function. */
    subscribe(key, callback) {
      if (!listeners.has(key)) listeners.set(key, new Set());
      listeners.get(key).add(callback);
      return () => listeners.get(key)?.delete(callback);
    },

    /** Export entire AI Office state as JSON-serializable object. */
    exportAll() {
      const out = { __version: VERSION, __exported_at: new Date().toISOString(), data: {} };
      for (const [name, key] of Object.entries(KEYS)) {
        const v = api.get(key);
        if (v !== null) out.data[key] = v;
      }
      return out;
    },

    /** Import previously-exported state. Returns count of imported keys. */
    importAll(json, opts = { overwrite: true }) {
      if (!json || !json.data) return 0;
      let count = 0;
      for (const [key, val] of Object.entries(json.data)) {
        if (!opts.overwrite && api.get(key) !== null) continue;
        api.set(key, val);
        count++;
      }
      return count;
    },

    /** Clear all aio_* keys. Use with care. */
    clear() {
      let count = 0;
      try {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith('aio_')) keys.push(k);
        }
        keys.forEach(k => { localStorage.removeItem(k); count++; });
      } catch {}
      return count;
    },

    /** Storage usage stats (approximate). */
    stats() {
      let total = 0, count = 0;
      const breakdown = {};
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (!k || !k.startsWith('aio_')) continue;
          const v = localStorage.getItem(k) || '';
          const size = (k.length + v.length) * 2; // approx bytes (UTF-16)
          total += size;
          count++;
          breakdown[k] = size;
        }
      } catch {}
      return { count, totalBytes: total, totalKB: (total/1024).toFixed(1), breakdown };
    },

    // ── Referral / UTM tracking ──
    /** Capture ?ref= and utm_* from URL. Stores in REFERRAL key (first-touch wins). */
    captureReferral() {
      const params = new URLSearchParams(location.search);
      const ref = params.get('ref');
      const utmSource = params.get('utm_source');
      const utmMedium = params.get('utm_medium');
      const utmCampaign = params.get('utm_campaign');
      const utmContent = params.get('utm_content');
      const utmTerm = params.get('utm_term');

      if (!ref && !utmSource && !utmMedium && !utmCampaign && !utmContent && !utmTerm) return null;

      const existing = api.get(KEYS.REFERRAL);
      if (existing && existing.captured_at) {
        // first-touch wins — не перезаписываем
        return existing;
      }

      const data = {
        ref: ref || null,
        utm_source: utmSource || null,
        utm_medium: utmMedium || null,
        utm_campaign: utmCampaign || null,
        utm_content: utmContent || null,
        utm_term: utmTerm || null,
        landing_page: location.pathname,
        landing_url: location.href,
        referrer: document.referrer || null,
        captured_at: new Date().toISOString(),
      };
      api.set(KEYS.REFERRAL, data);
      return data;
    },

    /** Get current referral attribution (read-only). */
    getReferral() {
      return api.get(KEYS.REFERRAL);
    },

    /** Attach referral data to any payload. Use in form submissions. */
    withReferral(payload = {}) {
      const ref = api.getReferral();
      if (!ref) return payload;
      return {
        ...payload,
        _ref: ref.ref,
        _utm_source: ref.utm_source,
        _utm_medium: ref.utm_medium,
        _utm_campaign: ref.utm_campaign,
        _landing: ref.landing_page,
        _referrer: ref.referrer,
        _captured_at: ref.captured_at,
      };
    },

    // ── Session ID для аналитики ──
    /** Get or create a stable session UUID. */
    getSessionId() {
      let id = api.get(KEYS.SESSION);
      if (!id) {
        id = 'sess_' + Math.random().toString(36).slice(2, 10) + '_' + Date.now().toString(36);
        api.set(KEYS.SESSION, id);
      }
      return id;
    },
  };

  // ── Auto-init на загрузке ──
  api.captureReferral();
  api.getSessionId(); // ensure session ID exists

  window.AIOState = api;
})();
