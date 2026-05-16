/* ═══════════════════════════════════════════════════════════════════
   config.js — единый конфиг и backend-интеграции
   ───────────────────────────────────────────────────────────────────
   Что внутри:
   · Supabase URL + ANON (anon-key безопасно — RLS защищает данные)
   · Telegram-уведомления через /api/notify-tg (Netlify Function,
     токен НЕ виден в браузере — лежит в env vars)
   · Глобальные функции для всех форм проекта

   ⚠ Безопасность:
   · Supabase anon-key безопасен (так задумано Supabase)
   · TG-токен НЕ должен быть в client JS (мы выводим через Netlify Fn)
   · Если /api/notify-tg возвращает 503 — задеплой через GitHub
     + установи env vars TG_BOT_TOKEN + TG_CHAT_ID
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  if (window.AIOConfig) return;

  // ── Supabase (anon-key public OK · RLS-protected) ──
  const SUPABASE_URL  = 'https://cslvbnladhfjrdbtnwkm.supabase.co';
  const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNzbHZibmxhZGhmanJkYnRud2ttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1ODk2NzYsImV4cCI6MjA5NDE2NTY3Nn0.0VjY3ihxWMjDRBoWpPQiAAKEYRveKKbUHzt4969kATk';

  // ── Telegram через серверный proxy (токен в Netlify env vars) ──
  const TG_PROXY_URL = '/api/notify-tg';

  // ── Flags ──
  if (typeof window.AIO_MOCK_BACKEND === 'undefined') window.AIO_MOCK_BACKEND = false;
  if (typeof window.AIO_GA4_ID === 'undefined') window.AIO_GA4_ID = null;
  if (typeof window.AIO_YM_ID  === 'undefined') window.AIO_YM_ID  = null;

  const S = window.AIOState;

  function _now() {
    return new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
  }

  /** Save lead into Supabase /leads (RLS-protected anon insert). */
  async function saveLead(data) {
    try {
      const payload = {
        niche:              data.niche      || null,
        to_improve:         data.toImprove  || data.focus || [],
        current_revenue:    data.revenue    || data.rev_now || null,
        goal:               data.goal       || null,
        main_problem:       data.problem    || data.pain || null,
        recommended_agents: data.agents     || [],
        email:              data.email      || null,
        name:               data.name       || null,
        telegram:           data.tg         || data.telegram || null,
        source:             data.source     || 'ai_office_form',
        ref_data:           S ? S.getReferral() : null,
      };
      const res = await fetch(`${SUPABASE_URL}/rest/v1/leads`, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'apikey':         SUPABASE_ANON,
          'Authorization': `Bearer ${SUPABASE_ANON}`,
          'Prefer':        'return=minimal',
        },
        body: JSON.stringify(payload),
      });
      if (res.ok) { console.log('%c✓ Supabase: lead saved', 'color:#34d058'); return true; }
      console.warn('[supabase] ' + res.status + ': ' + (await res.text()));
      return false;
    } catch (e) {
      console.warn('[supabase] network fail:', e.message);
      return false;
    }
  }

  /** Notify admin via Telegram (через серверный proxy /api/notify-tg). */
  async function notifyTelegram(text, opts = {}) {
    try {
      const res = await fetch(TG_PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, chat_id: opts.chat_id, parse_mode: opts.parse_mode || 'Markdown' }),
      });
      if (res.ok) { console.log('%c✓ TG notified (via /api/notify-tg)', 'color:#34d058'); return true; }
      if (res.status === 404) {
        console.warn('[tg] /api/notify-tg not deployed yet — see netlify/functions/notify-tg.js');
      } else if (res.status === 503) {
        console.warn('[tg] Netlify env vars TG_BOT_TOKEN / TG_CHAT_ID не установлены');
      } else if (res.status === 429) {
        console.warn('[tg] Rate limit — повтори через минуту');
      } else {
        console.warn('[tg] error:', res.status);
      }
      return false;
    } catch (e) {
      console.warn('[tg] network fail:', e.message);
      return false;
    }
  }

  function _fmtLead(data, title = '🏢 Новая заявка') {
    return [
      `*${title}*`, '',
      data.niche      ? `📌 *Ниша:* ${data.niche}` : '',
      data.goal       ? `🎯 *Цель:* ${data.goal}` : '',
      data.revenue || data.rev_now ? `💰 *Доход:* ${data.revenue || data.rev_now}` : '',
      data.problem || data.pain    ? `🔥 *Затык:* ${data.problem || data.pain}` : '',
      data.toImprove?.length || data.focus?.length ? `⚡ *Усилить:* ${(data.toImprove||data.focus||[]).join(', ')}` : '',
      data.agents?.length      ? `🤖 *Агенты:* ${data.agents.join(', ')}` : '',
      data.name                ? `👤 ${data.name}` : '',
      data.tg || data.telegram ? `💬 ${data.tg || data.telegram}` : '',
      data.email               ? `📧 ${data.email}` : '',
      data._ref                ? `🔗 *Реферал:* ${data._ref}` : '',
      '',
      `🕐 ${_now()} МСК`,
    ].filter(Boolean).join('\n');
  }

  /** Главная функция отправки лида — Supabase + TG + state + analytics. */
  async function submitLead(data, opts = {}) {
    if (window.AIOAnalytics) {
      window.AIOAnalytics.track('lead_submitted', {
        source: data.source || opts.source || 'unknown',
        has_email: !!data.email,
        has_tg: !!(data.tg || data.telegram),
      });
    }

    const enriched = (S && S.withReferral) ? S.withReferral(data) : data;
    if (S) S.push('aio_submitted_leads', { ...enriched, at: Date.now() });

    const tgTitle = opts.tgTitle || '🏢 Новая заявка — AI Growth Office';
    const tgText  = opts.tgText  || _fmtLead(enriched, tgTitle);

    const results = await Promise.allSettled([
      saveLead(enriched),
      notifyTelegram(tgText),
    ]);
    return {
      supabase: results[0].status === 'fulfilled' && results[0].value === true,
      telegram: results[1].status === 'fulfilled' && results[1].value === true,
    };
  }

  /** Partner application form. */
  async function submitPartner(data) {
    if (S) S.push(S.KEYS.PARTNER_APPS, { ...data, at: Date.now() });
    if (window.AIOAnalytics) window.AIOAnalytics.formSubmit('partner', { type: data.type });

    const text = [
      '*🤝 Новая заявка в партнёрку*', '',
      `👤 *Имя:* ${data.name}`,
      `🏷 *Тип:* ${data.type}`,
      `📧 *Email:* ${data.email}`,
      `💬 *TG:* ${data.tg}`,
      `🎯 *Ниша:* ${data.niche}`,
      data.aud  ? `👥 *Аудитория:* ${data.aud}` : '',
      data.plan ? `📋 *План:* ${data.plan}` : '',
      data._ref ? `🔗 *Реферал:* ${data._ref}` : '',
      '', `🕐 ${_now()} МСК`,
    ].filter(Boolean).join('\n');

    return notifyTelegram(text);
  }

  /** Video subscribe form. */
  async function submitVideoLead(email, extra = {}) {
    if (S) S.push(S.KEYS.VIDEO_LEADS, { email, ...extra, at: Date.now() });
    if (window.AIOAnalytics) window.AIOAnalytics.formSubmit('video_subscribe');

    const text = [
      '*📺 Подписка на видео-демо*', '',
      `📧 *Email:* ${email}`,
      extra._ref ? `🔗 *Реферал:* ${extra._ref}` : '',
      '', `🕐 ${_now()} МСК`,
    ].filter(Boolean).join('\n');

    return notifyTelegram(text);
  }

  /** Lead-magnet (PDF gate) form. */
  async function submitLeadMagnet(data) {
    if (S) S.set(S.KEYS.LEAD_MAGNET, { ...data, at: Date.now() });
    if (window.AIOAnalytics) window.AIOAnalytics.formSubmit('lead_magnet');

    saveLead({ ...data, source: 'lead_magnet_v1', niche: 'PDF — 10 промптов' });

    const text = [
      '*📄 Скачали PDF лид-магнит*', '',
      data.name  ? `👤 ${data.name}` : '',
      `📧 ${data.email}`,
      data.tg    ? `💬 ${data.tg}` : '',
      data._ref  ? `🔗 *Реферал:* ${data._ref}` : '',
      '', `🕐 ${_now()} МСК`,
    ].filter(Boolean).join('\n');

    return notifyTelegram(text);
  }

  window.AIOConfig = {
    SUPABASE_URL, SUPABASE_ANON,
    TG_PROXY_URL,
    saveLead, notifyTelegram,
    submitLead, submitPartner, submitVideoLead, submitLeadMagnet,
  };

  // Legacy aliases для совместимости с index.html / onboarding.html / lead-magnet-gate.html
  if (typeof window.saveLead       !== 'function') window.saveLead       = saveLead;
  if (typeof window.notifyTelegram !== 'function') window.notifyTelegram = notifyTelegram;
  if (typeof window.submitLead     !== 'function') window.submitLead     = submitLead;
})();
