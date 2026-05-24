/* ═══════════════════════════════════════════════════════════════════
   alisa-widget.js — плавающий AI-консьерж Алиса в правом нижнем углу
   ───────────────────────────────────────────────────────────────────
   · 60px кнопка-FAB снизу справа → 380x540 чат при клике
   · Использует /api/chat (через api-fallback.js если задеплоен)
   · Streaming SSE Anthropic Claude Sonnet 4.5
   · Знает: текущую страницу, бриф из localStorage, продукт
   · Сохраняет историю в localStorage['aio_alisa_chat']
   · 4 быстрых чипа: что это, тариф, кейсы, помоги
   · Не показывается если ?no-alisa в URL или на печатной странице
   · Skip на: lead-magnet.html (для печати), emails.html (тех. инструмент)
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  if (window.__aioAlisaLoaded) return;
  window.__aioAlisaLoaded = true;

  // Skip conditions
  if (new URLSearchParams(location.search).has('no-alisa')) return;
  const pageName = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  const SKIP_PAGES = ['lead-magnet.html', 'emails.html'];
  if (SKIP_PAGES.includes(pageName)) return;

  const S = window.AIOState; // central state (если подключён state.js)
  const STORAGE_KEY = (S && S.KEYS.ALISA_CHAT) || 'aio_alisa_chat';
  const MAX_HISTORY = 40; // turns kept in context

  // ── System prompt: Alisa знает продукт от и до ──
  const SYSTEM_PROMPT = `Ты — Алиса, AI-консьерж сайта AI Growth Office (https://ai-office.46-62-215-11.nip.io).

ПРОДУКТ:
AI Growth Office — это персональный AI-офис под бизнес клиента: 169 AI-агентов, объединённых в 4 отдела (Growth, Marketing, Tech, Sales). Клиент заполняет бриф → AI подбирает команду → клиент работает в личном кабинете с готовыми пайплайнами и чатом с каждым агентом.

ТАРИФЫ:
· Free — 0₽/мес. 3 запуска сценариев/мес, 1 отдел, 20 сообщений/день
· Pro — 1 990₽/мес (или 19 900₽/год — экономия 3 980₽). Безлимит запусков, все 4 отдела, 1 место
· Team — 4 990₽/мес (или 49 900₽/год). 5 мест, командная работа
· Enterprise — от 25 000₽/мес. Безлимит мест, кастомные агенты, SLA

CUSTOMER JOURNEY:
1. Главная (index.html) → демо живого офиса
2. Брифинг (onboarding.html) — 10 шагов, 5 минут
3. AI-рекомендации (recommend.html) — must/recommended/optional агенты
4. Личный AI-офис (dashboard.html) — твоя команда с чатом
5. Рабочие пространства: Marketing/Tech/Sales workspace — 4 готовые задачи в каждом

ОСНОВНЫЕ СТРАНИЦЫ:
· /navigation.html — КАРТА САЙТА (если клиент запутался — отправь сюда первым)
· /mini-app-preview.html — превью Telegram Mini App в макете телефона
· /mini-app/ — сам Telegram Mini App (5 экранов: welcome→brief→team→office→chat)
· /index.html — главная с демо
· /how-it-works.html — 5 шагов customer journey с анимацией
· /demo.html — видео-демо (placeholder, скоро)
· /dashboard-demo.html — мокап результатов клиента через 60 дней (KPI, контент, воронка)
· /onboarding.html — бриф 10 шагов
· /recommend.html — подбор команды
· /dashboard.html — мой офис
· /agents.html — каталог 169 агентов
· /pricing.html — тарифы
· /roi.html — калькулятор экономии
· /compare.html — сравнение AI Office vs найм/фриланс/курсы
· /cases.html — 5 модельных сценариев применения
· /faq.html — частые вопросы
· /lead-magnet-gate.html — бесплатный PDF с 10 промптами
· /partners.html — партнёрская программа 30%
· /glossary.html — 25 AI-терминов простыми словами (агент, промпт, RAG, MCP, токен, embedding)
· /about.html — о проекте, кто создаёт, философия, roadmap, контакты
· /marketing-workspace.html, /tech-workspace.html, /sales-workspace.html — рабочие пространства
· Чистые URL работают: /about, /pricing, /cases, /roi, /compare, /demo, /glossary, /partners, /faq, /onboarding, /agents, /dashboard, /whats-new

Если клиент спрашивает про админку — отправь его к /leads-inbox.html (просмотр всех заявок) и /dev-tools.html (диагностика). Это служебные страницы.

ЦА: эксперты, онлайн-школы, инфо-предприниматели, SMM-агентства, tech-стартапы с выручкой 200К-5М₽/мес.

ТВОЙ СТИЛЬ:
· Дружелюбная, на «ты», по делу
· Отвечаешь коротко (3-7 предложений), без воды
· Если уместно — даёшь ссылку на конкретную страницу
· Не врёшь и не выдумываешь — если не знаешь, говоришь честно
· Не агрессивная sales-подача, но мягко веди к брифу или калькулятору
· Если клиент жалуется/возражает — отвечаешь как FAQ (см. /faq.html)

ЕСЛИ КЛИЕНТ ХОЧЕТ КУПИТЬ:
Веди на /pricing.html → выбор тарифа → onboarding.html (бриф).
Если сомневается — предложи /roi.html или /cases.html.
Если хочет «попробовать без оплаты» — Free-тариф или PDF (/lead-magnet-gate.html).

НЕ ДЕЛАЙ:
· Не упоминай Anthropic, Claude, OpenAI
· Не давай советы по психологии/медицине/праву
· Не обсуждай конкурентов конкретно — говори общими фразами
· Не пиши длинные стены текста

Текущая страница клиента: ${pageName}`;

  // Quick chips
  const CHIPS = [
    { lbl: 'Что такое AI Office?',       msg: 'Расскажи коротко, что такое AI Growth Office и кому подойдёт?' },
    { lbl: 'Какой тариф мне подойдёт?',   msg: 'У меня малый бизнес/эксперт. Какой тариф мне выбрать?' },
    { lbl: 'Покажи кейсы',                msg: 'Покажи примеры, как AI Office помог реальным клиентам' },
    { lbl: 'Я не уверен, что нужно',      msg: 'Я не уверен, нужен ли мне AI Office. Помоги разобраться' },
  ];

  /* ── CSS ── */
  const css = `
  #aio-alisa-fab {
    position: fixed; right: 22px; bottom: 22px; z-index: 9500;
    width: 60px; height: 60px; border-radius: 50%; border: 0;
    background: linear-gradient(135deg, #c8f060, #60c8f0);
    color: #080808; font-size: 28px; cursor: pointer;
    box-shadow: 0 8px 28px rgba(96, 200, 240, .35), 0 4px 12px rgba(200, 240, 96, .25);
    display: flex; align-items: center; justify-content: center;
    transition: transform .18s cubic-bezier(.2,.8,.4,1), box-shadow .18s;
    animation: aio-alisa-pulse 3s ease-in-out infinite;
  }
  #aio-alisa-fab:hover { transform: translateY(-3px) scale(1.04); box-shadow: 0 12px 32px rgba(96, 200, 240, .5) }
  #aio-alisa-fab.open { animation: none }
  #aio-alisa-fab .badge {
    position: absolute; top: 2px; right: 2px;
    width: 16px; height: 16px; border-radius: 50%;
    background: #f04060; color: #fff; font-size: 10px; font-weight: 800;
    display: flex; align-items: center; justify-content: center;
    border: 2px solid #0a0c14;
    animation: aio-alisa-badge-pop .4s cubic-bezier(.4,1.6,.4,1);
  }
  @keyframes aio-alisa-pulse {
    0%, 100% { box-shadow: 0 8px 28px rgba(96, 200, 240, .35), 0 4px 12px rgba(200, 240, 96, .25), 0 0 0 0 rgba(200, 240, 96, .5) }
    50%      { box-shadow: 0 8px 28px rgba(96, 200, 240, .35), 0 4px 12px rgba(200, 240, 96, .25), 0 0 0 14px rgba(200, 240, 96, 0)   }
  }
  @keyframes aio-alisa-badge-pop { from { transform: scale(0) } to { transform: scale(1) } }

  #aio-alisa-panel {
    position: fixed; right: 22px; bottom: 94px; z-index: 9499;
    width: 380px; max-width: calc(100vw - 32px);
    height: 540px; max-height: calc(100vh - 130px);
    background: rgba(13, 15, 26, .96);
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
    border: 1px solid rgba(255, 255, 255, .1);
    border-radius: 16px;
    box-shadow: 0 24px 64px rgba(0, 0, 0, .55);
    display: none; flex-direction: column; overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif;
    color: #e9eef7;
    transform: translateY(8px) scale(.96); opacity: 0;
    transition: transform .22s cubic-bezier(.2,.8,.4,1), opacity .22s;
  }
  #aio-alisa-panel.show { display: flex; transform: translateY(0) scale(1); opacity: 1 }

  .aio-alisa-head {
    padding: 14px 16px; display: flex; align-items: center; gap: 12px;
    border-bottom: 1px solid rgba(255, 255, 255, .07);
    background: linear-gradient(180deg, rgba(96,200,240,.07), transparent);
  }
  .aio-alisa-head .av {
    width: 38px; height: 38px; border-radius: 50%; flex-shrink: 0;
    background: linear-gradient(135deg, #c8f060, #60c8f0);
    color: #080808; font-size: 18px; font-weight: 800;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 0 0 2px rgba(200, 240, 96, .25);
  }
  .aio-alisa-head .nm-wrap { flex: 1; min-width: 0 }
  .aio-alisa-head .nm { font-size: 13.5px; font-weight: 800; letter-spacing: .2px }
  .aio-alisa-head .st { font-size: 10.5px; color: #34d058; display: flex; align-items: center; gap: 5px; margin-top: 1px }
  .aio-alisa-head .st::before {
    content: ''; width: 6px; height: 6px; background: #34d058; border-radius: 50%;
    box-shadow: 0 0 0 0 rgba(52, 208, 88, .6); animation: aio-alisa-dot 2s infinite;
  }
  @keyframes aio-alisa-dot {
    0%, 100% { box-shadow: 0 0 0 0 rgba(52, 208, 88, .6) }
    50%      { box-shadow: 0 0 0 5px rgba(52, 208, 88, 0)   }
  }
  .aio-alisa-head .acts { display: flex; gap: 6px }
  .aio-alisa-head .acts button {
    background: transparent; border: 0; color: rgba(255,255,255,.55); font-size: 16px;
    width: 28px; height: 28px; border-radius: 7px; cursor: pointer;
    display: flex; align-items: center; justify-content: center; transition: background .15s, color .15s;
  }
  .aio-alisa-head .acts button:hover { background: rgba(255,255,255,.08); color: #fff }

  .aio-alisa-body {
    flex: 1; overflow-y: auto; padding: 14px 16px; display: flex; flex-direction: column; gap: 10px;
  }
  .aio-alisa-body::-webkit-scrollbar { width: 4px }
  .aio-alisa-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,.1); border-radius: 99px }

  .aio-alisa-msg {
    font-size: 13px; line-height: 1.5; padding: 10px 13px; border-radius: 12px;
    max-width: 86%; word-wrap: break-word; white-space: pre-wrap;
  }
  .aio-alisa-msg.bot { background: rgba(255,255,255,.05); align-self: flex-start; border-bottom-left-radius: 4px }
  .aio-alisa-msg.bot a { color: #c8f060; text-decoration: none; border-bottom: 1px dotted rgba(200,240,96,.5) }
  .aio-alisa-msg.bot a:hover { border-bottom-style: solid }
  .aio-alisa-msg.usr { background: linear-gradient(135deg, rgba(96,200,240,.16), rgba(200,240,96,.12)); align-self: flex-end; border-bottom-right-radius: 4px; color: #fff }
  .aio-alisa-msg.typing { background: rgba(255,255,255,.05); align-self: flex-start; padding: 12px 14px }
  .aio-alisa-msg.typing .dots { display: inline-flex; gap: 3px }
  .aio-alisa-msg.typing .dots span {
    width: 5px; height: 5px; border-radius: 50%; background: rgba(255,255,255,.4);
    animation: aio-alisa-blink 1.2s infinite;
  }
  .aio-alisa-msg.typing .dots span:nth-child(2) { animation-delay: .15s }
  .aio-alisa-msg.typing .dots span:nth-child(3) { animation-delay: .3s }
  @keyframes aio-alisa-blink {
    0%, 60%, 100% { opacity: .3 }
    30%           { opacity: 1   }
  }

  .aio-alisa-chips {
    padding: 0 16px 12px; display: flex; flex-wrap: wrap; gap: 6px; flex-shrink: 0;
  }
  .aio-alisa-chips.hidden { display: none }
  .aio-alisa-chip {
    background: rgba(96,200,240,.08); border: 1px solid rgba(96,200,240,.22);
    color: #60c8f0; font-size: 11.5px; font-weight: 600;
    padding: 7px 11px; border-radius: 99px; cursor: pointer;
    transition: background .15s, transform .12s;
  }
  .aio-alisa-chip:hover { background: rgba(96,200,240,.16); transform: translateY(-1px) }

  .aio-alisa-foot {
    padding: 12px 14px; border-top: 1px solid rgba(255,255,255,.07);
    display: flex; gap: 8px; align-items: flex-end; flex-shrink: 0;
    background: rgba(13, 15, 26, .8);
  }
  .aio-alisa-foot textarea {
    flex: 1; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.1);
    color: #e9eef7; padding: 9px 11px; border-radius: 10px; font-size: 13px;
    font-family: inherit; resize: none; outline: none; min-height: 38px; max-height: 110px; line-height: 1.4;
    transition: border-color .15s;
  }
  .aio-alisa-foot textarea:focus { border-color: rgba(200, 240, 96, .35) }
  .aio-alisa-foot textarea::placeholder { color: rgba(255,255,255,.3) }
  .aio-alisa-foot button {
    background: linear-gradient(135deg, #c8f060, #60c8f0);
    color: #080808; border: 0; width: 38px; height: 38px; border-radius: 10px;
    font-size: 16px; cursor: pointer; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    transition: transform .12s, opacity .15s;
  }
  .aio-alisa-foot button:hover:not(:disabled) { transform: scale(1.06) }
  .aio-alisa-foot button:disabled { opacity: .4; cursor: not-allowed }

  .aio-alisa-hint {
    padding: 6px 16px 10px; font-size: 10px; color: rgba(255,255,255,.32); text-align: center;
  }

  @media (max-width: 480px) {
    #aio-alisa-fab { right: 14px; bottom: 14px; width: 54px; height: 54px; font-size: 24px }
    #aio-alisa-panel { right: 8px; bottom: 78px; width: calc(100vw - 16px); height: calc(100vh - 100px) }
  }
  `;
  const styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  /* ── DOM ── */
  const fab = document.createElement('button');
  fab.id = 'aio-alisa-fab';
  fab.setAttribute('aria-label', 'Открыть чат с Алисой');
  fab.innerHTML = '💬';
  document.body.appendChild(fab);

  const panel = document.createElement('div');
  panel.id = 'aio-alisa-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Чат с Алисой');
  panel.innerHTML = `
    <div class="aio-alisa-head">
      <div class="av">А</div>
      <div class="nm-wrap">
        <div class="nm">Алиса · AI-консьерж</div>
        <div class="st">онлайн · отвечает за секунды</div>
      </div>
      <div class="acts">
        <button id="aio-alisa-reset" title="Начать заново">↻</button>
        <button id="aio-alisa-close" title="Закрыть">✕</button>
      </div>
    </div>
    <div class="aio-alisa-body" id="aio-alisa-body"></div>
    <div class="aio-alisa-chips" id="aio-alisa-chips">
      ${CHIPS.map(c => `<button class="aio-alisa-chip" data-msg="${c.msg.replace(/"/g, '&quot;')}">${c.lbl}</button>`).join('')}
    </div>
    <div class="aio-alisa-foot">
      <textarea id="aio-alisa-input" rows="1" placeholder="Спроси что угодно про AI Office..."></textarea>
      <button id="aio-alisa-send" aria-label="Отправить">↑</button>
    </div>
    <div class="aio-alisa-hint">Powered by AI — иногда может ошибаться</div>
  `;
  document.body.appendChild(panel);

  const $body  = document.getElementById('aio-alisa-body');
  const $chips = document.getElementById('aio-alisa-chips');
  const $input = document.getElementById('aio-alisa-input');
  const $send  = document.getElementById('aio-alisa-send');

  /* ── State ── */
  let history = []; // [{role, content}]
  let busy = false;

  function loadHistory() {
    if (S) {
      history = S.get(STORAGE_KEY, []) || [];
    } else {
      try { history = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { history = []; }
    }
    if (!Array.isArray(history)) history = [];
  }
  function saveHistory() {
    const trimmed = history.slice(-MAX_HISTORY);
    if (S) { S.set(STORAGE_KEY, trimmed); }
    else { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed)); } catch {} }
  }

  function bubble(role, content) {
    const div = document.createElement('div');
    div.className = 'aio-alisa-msg ' + (role === 'user' ? 'usr' : 'bot');
    div.innerHTML = linkify(escapeHtml(content));
    $body.appendChild(div);
    $body.scrollTop = $body.scrollHeight;
    return div;
  }

  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function linkify(s) {
    // bold **x**
    s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    // /path.html → link
    s = s.replace(/(^|[\s(])\/(?!\/)([a-z0-9\-]+\.html)/gi, '$1<a href="/$2">/$2</a>');
    // bare https://
    s = s.replace(/(https?:\/\/[^\s)]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
    return s;
  }

  function typingBubble() {
    const div = document.createElement('div');
    div.className = 'aio-alisa-msg typing';
    div.innerHTML = '<span class="dots"><span></span><span></span><span></span></span>';
    $body.appendChild(div);
    $body.scrollTop = $body.scrollHeight;
    return div;
  }

  function renderAll() {
    $body.innerHTML = '';
    if (history.length === 0) {
      bubble('assistant', 'Привет! Я Алиса — помогаю разобраться с AI Growth Office.\n\nМогу:\n• Объяснить, как работает продукт\n• Подсказать тариф под твою задачу\n• Помочь с брифом\n• Рассказать о кейсах\n\nС чего начнём?');
      $chips.classList.remove('hidden');
    } else {
      history.forEach(m => bubble(m.role === 'user' ? 'user' : 'assistant', m.content));
      $chips.classList.add('hidden');
    }
  }

  /* ── Brief context (если есть) ── */
  function getBriefContext() {
    try {
      const brief = S ? S.get(S.KEYS.BRIEF) : JSON.parse(localStorage.getItem('aio_brief') || 'null');
      if (!brief) return '';
      const bits = [];
      if (brief.type)      bits.push(`Тип: ${brief.type}`);
      if (brief.niche)     bits.push(`Ниша: ${brief.niche}`);
      if (brief.product)   bits.push(`Продукт: ${brief.product}`);
      if (brief.goal90)    bits.push(`Цель на 90 дней: ${brief.goal90}`);
      if (brief.rev_now)   bits.push(`Текущая выручка: ${brief.rev_now}`);
      if (brief.team)      bits.push(`Команда: ${brief.team}`);
      if (brief.pain)      bits.push(`Боль: ${brief.pain}`);
      return bits.length ? ('\n\nКЛИЕНТ УЖЕ ЗАПОЛНИЛ БРИФ:\n' + bits.join('\n')) : '';
    } catch { return ''; }
  }

  /* ── Send to /api/chat ── */
  async function send(text) {
    text = (text || '').trim();
    if (!text || busy) return;
    busy = true;
    $send.disabled = true;
    $chips.classList.add('hidden');

    history.push({ role: 'user', content: text, ts: Date.now() });
    bubble('user', text);
    saveHistory();
    if (window.AIOAnalytics) window.AIOAnalytics.track('alisa_message', { length: text.length });

    const typing = typingBubble();
    let streamBubble = null;
    let full = '';

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5',
          max_tokens: 600,
          stream: true,
          system: SYSTEM_PROMPT + getBriefContext(),
          messages: history.slice(-MAX_HISTORY).map(m => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.ok || !res.body) throw new Error('API ' + res.status);

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });

        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith('data:')) continue;
          const data = t.slice(5).trim();
          if (data === '[DONE]') continue;
          try {
            const j = JSON.parse(data);
            const delta = j.delta?.text;
            if (delta) {
              full += delta;
              if (!streamBubble) {
                typing.remove();
                streamBubble = bubble('assistant', '');
              }
              streamBubble.innerHTML = linkify(escapeHtml(full));
              $body.scrollTop = $body.scrollHeight;
            }
          } catch {}
        }
      }

      if (!streamBubble) {
        typing.remove();
        streamBubble = bubble('assistant', full || 'Извини, не удалось ответить. Попробуй ещё раз.');
      }
      history.push({ role: 'assistant', content: full, ts: Date.now() });
      saveHistory();
    } catch (e) {
      typing.remove();
      bubble('assistant', '⚠ Не удалось связаться с AI. Проверь интернет или попробуй позже. А пока загляни в /faq.html или /cases.html.');
      console.warn('Alisa error:', e);
      if (window.AIOAnalytics) window.AIOAnalytics.track('alisa_error', { error: String(e.message || e) });
    } finally {
      busy = false;
      $send.disabled = false;
      $input.focus();
    }
  }

  /* ── Events ── */
  let opened = false;
  function open() {
    if (opened) return;
    opened = true;
    panel.classList.add('show');
    fab.classList.add('open');
    fab.innerHTML = '✕';
    setTimeout(() => $input.focus(), 250);
    try { sessionStorage.setItem('aio_alisa_seen', '1'); } catch {}
    const badge = fab.querySelector('.badge');
    if (badge) badge.remove();
  }
  function close() {
    opened = false;
    panel.classList.remove('show');
    fab.classList.remove('open');
    fab.innerHTML = '💬';
  }
  fab.addEventListener('click', () => opened ? close() : open());
  document.getElementById('aio-alisa-close').addEventListener('click', close);
  document.getElementById('aio-alisa-reset').addEventListener('click', () => {
    if (!confirm('Очистить историю с Алисой?')) return;
    history = [];
    saveHistory();
    renderAll();
  });

  $chips.querySelectorAll('.aio-alisa-chip').forEach(c => {
    c.addEventListener('click', () => send(c.dataset.msg));
  });

  $send.addEventListener('click', () => {
    const v = $input.value;
    $input.value = '';
    autoResize();
    send(v);
  });
  $input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      $send.click();
    }
  });
  function autoResize() {
    $input.style.height = 'auto';
    $input.style.height = Math.min($input.scrollHeight, 110) + 'px';
  }
  $input.addEventListener('input', autoResize);

  // First-time badge
  try {
    if (!sessionStorage.getItem('aio_alisa_seen')) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = '1';
      fab.appendChild(badge);
    }
  } catch {}

  loadHistory();
  renderAll();
})();
