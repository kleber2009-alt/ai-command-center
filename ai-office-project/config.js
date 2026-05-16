/* ═══════════════════════════════════════════════════════════════════
   config.js — единый конфиг и backend-интеграции (self-hosted)
   ───────────────────────────────────────────────────────────────────
   После миграции с Supabase/Netlify на свой сервер:
   · Lead-формы шлют POST на /api/leads (наш Fastify backend → Postgres)
   · Telegram-уведомления через /api/notify-tg (наш backend)
   · Никаких прямых обращений к Supabase REST — всё идёт same-origin.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  if (window.AIOConfig) return;

  // Все API-вызовы same-origin — никаких внешних URL.
  const LEADS_URL    = '/api/leads';
  const TG_PROXY_URL = '/api/notify-tg';

  // ── Flags ──
  if (typeof window.AIO_MOCK_BACKEND === 'undefined') window.AIO_MOCK_BACKEND = false;
  if (typeof window.AIO_GA4_ID === 'undefined') window.AIO_GA4_ID = null;
  if (typeof window.AIO_YM_ID  === 'undefined') window.AIO_YM_ID  = null;

  const S = window.AIOState;

  function _now() {
    return new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
  }

  /** Save lead via our /api/leads endpoint (writes to Postgres). */
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
      const res = await fetch(LEADS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) { console.log('%c✓ lead saved', 'color:#34d058'); return true; }
      console.warn('[leads] ' + res.status + ': ' + (await res.text()).slice(0, 200));
      return false;
    } catch (e) {
      console.warn('[leads] network fail:', e.message);
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
    LEADS_URL, TG_PROXY_URL,
    saveLead, notifyTelegram,
    submitLead, submitPartner, submitVideoLead, submitLeadMagnet,
  };

  // Legacy aliases для совместимости с index.html / onboarding.html / lead-magnet-gate.html
  if (typeof window.saveLead       !== 'function') window.saveLead       = saveLead;
  if (typeof window.notifyTelegram !== 'function') window.notifyTelegram = notifyTelegram;
  if (typeof window.submitLead     !== 'function') window.submitLead     = submitLead;
})();
