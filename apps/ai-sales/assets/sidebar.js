// AI Sales · Global sidebar navigation
// Подключается одной строкой на каждой странице:
//   <script src="/assets/sidebar.js" defer></script>
// Сам инжектит стили, разметку, активный пункт.

(function () {
  'use strict';

  // ============ Конфигурация навигации ============
  const NAV_GROUPS = [
    {
      title: 'Dashboard',
      items: [
        { num: '01', label: 'Pulse',        href: '/06-dashboard-prototype/pulse.html',        match: ['pulse.html', '/pulse'] },
        { num: '02', label: 'Inbox',        href: '/06-dashboard-prototype/inbox.html',        match: ['inbox.html', '/inbox'] },
        { num: '03', label: 'Pipeline',     href: '/06-dashboard-prototype/pipeline.html',     match: ['pipeline.html', '/pipeline'] },
        { num: '04', label: 'Conversation', href: '/06-dashboard-prototype/conversation.html', match: ['conversation.html', '/conv'] },
        { num: '05', label: 'Agents',       href: '/06-dashboard-prototype/agents.html',       match: ['agents.html', '/agents'] },
        { num: '06', label: 'Reports',      href: '/06-dashboard-prototype/reports.html',      match: ['reports.html', '/reports'] },
        { num: '07', label: 'Project',      href: '/06-dashboard-prototype/project.html',      match: ['project.html', '/project'] },
      ],
    },
    {
      title: 'Knowledge',
      items: [
        { num: '08', label: 'Knowledge Base', href: '/06-dashboard-prototype/kb.html', match: ['kb.html', '/kb'] },
      ],
    },
    {
      title: 'Контент',
      items: [
        { num: '09', label: 'Calendar',  href: '/06-dashboard-prototype/calendar.html',  match: ['calendar.html', '/calendar'] },
        { num: '10', label: 'Generator', href: '/06-dashboard-prototype/generator.html', match: ['generator.html', '/generator'] },
        { num: '11', label: 'Carousels', href: '/carousels/index.html', match: ['/carousels/'] },
        { num: '12', label: 'Reels',     href: '/reels/index.html',     match: ['/reels/'] },
      ],
    },
    {
      title: 'System',
      items: [
        { num: '13', label: 'Settings', href: '/06-dashboard-prototype/settings.html', match: ['settings.html', '/settings'] },
        { num: '00', label: 'Portal',   href: '/01-portal/ai-sales-portal.html',       match: ['/01-portal/'] },
      ],
    },
  ];

  // Searchable items для ⌘K
  const SEARCH_INDEX = [
    // Pages
    { type: 'page', label: 'Pulse · operational overview', href: '/06-dashboard-prototype/pulse.html', keywords: 'pulse дашборд метрики воронка' },
    { type: 'page', label: 'Inbox · уведомления и эскалации', href: '/06-dashboard-prototype/inbox.html', keywords: 'inbox уведомления эскалации задачи' },
    { type: 'page', label: 'Pipeline · clients list', href: '/06-dashboard-prototype/pipeline.html', keywords: 'pipeline лиды клиенты список фильтры' },
    { type: 'page', label: 'Conversation · client card', href: '/06-dashboard-prototype/conversation.html', keywords: 'conversation диалог клиент' },
    { type: 'page', label: 'Agents · 4 agents drill-down', href: '/06-dashboard-prototype/agents.html', keywords: 'agents агенты ig tg analyst rop' },
    { type: 'page', label: 'Reports · historical analytics', href: '/06-dashboard-prototype/reports.html', keywords: 'reports отчёты графики тренды аналитика период' },
    { type: 'page', label: 'Project · roadmap & tasks', href: '/06-dashboard-prototype/project.html', keywords: 'project проект задачи roadmap' },
    { type: 'page', label: 'Knowledge Base', href: '/06-dashboard-prototype/kb.html', keywords: 'kb knowledge база знаний rag коллекции' },
    { type: 'page', label: 'Content Calendar', href: '/06-dashboard-prototype/calendar.html', keywords: 'calendar контент календарь публикации' },
    { type: 'page', label: 'Content Generator', href: '/06-dashboard-prototype/generator.html', keywords: 'generator генератор ai контент карусель reel' },
    { type: 'page', label: 'Settings · system config', href: '/06-dashboard-prototype/settings.html', keywords: 'settings конфигурация api ключи' },
    { type: 'page', label: 'Carousels gallery', href: '/carousels/index.html', keywords: 'carousels карусели instagram' },
    { type: 'page', label: 'Reels scenarios', href: '/reels/index.html', keywords: 'reels видео сценарии' },
    { type: 'page', label: 'Portal · documentation', href: '/01-portal/ai-sales-portal.html', keywords: 'portal портал документация' },
    { type: 'page', label: 'Login · войти', href: '/06-dashboard-prototype/login.html', keywords: 'login войти auth авторизация' },
    { type: 'page', label: 'Onboarding · первая настройка', href: '/06-dashboard-prototype/onboarding.html', keywords: 'onboarding setup настройка первый раз wizard мастер' },
    // Mock clients
    { type: 'client', label: '@marina_v · Марина Веселова · A·78', href: '/06-dashboard-prototype/conversation.html', keywords: 'marina marina_v hot pitch agency' },
    { type: 'client', label: '@anna_volkova · Анна Волкова · ESC', href: '/06-dashboard-prototype/conversation.html', keywords: 'anna volkova escalation complaint' },
    { type: 'client', label: '@dmitry88 · Дмитрий Мельников · WON', href: '/06-dashboard-prototype/conversation.html', keywords: 'dmitry won paid' },
    { type: 'client', label: '@kate_b · Катя Берестова · A·78', href: '/06-dashboard-prototype/conversation.html', keywords: 'kate b pitch' },
    // Mock actions
    { type: 'action', label: '+ Новая карусель', href: '/carousels/index.html', keywords: 'new создать карусель' },
    { type: 'action', label: '+ Новый Reel', href: '/reels/index.html', keywords: 'new создать reel' },
    { type: 'action', label: 'Загрузить подкасты для voice', href: '/06-dashboard-prototype/kb.html', keywords: 'voice подкаст голос upload транскрипция' },
  ];

  // ============ Стили ============
  const CSS = `
.aisales-sidebar {
  position: fixed;
  left: 0; top: 0; bottom: 0;
  width: 240px;
  background: #0a0a0a;
  border-right: 1px solid #1a1a1a;
  display: flex;
  flex-direction: column;
  z-index: 100;
  font-family: Georgia, 'Times New Roman', serif;
  color: #f5f0e8;
  overflow-y: auto;
  padding: 22px 0 0;
}
.aisales-sidebar::-webkit-scrollbar { width: 4px; }
.aisales-sidebar::-webkit-scrollbar-track { background: #0a0a0a; }
.aisales-sidebar::-webkit-scrollbar-thumb { background: #1a1a1a; }

.aisales-sb-brand {
  padding: 0 22px 22px;
  border-bottom: 1px solid #1a1a1a;
  margin-bottom: 18px;
}
.aisales-sb-brand a { text-decoration: none; color: inherit; display: block; }
.aisales-sb-brand .title {
  font-family: Georgia, serif;
  font-size: 22px;
  line-height: 1.1;
  letter-spacing: -0.01em;
}
.aisales-sb-brand .title .accent { color: #c8f060; font-style: italic; }
.aisales-sb-brand .sub {
  font-family: 'SF Mono', 'JetBrains Mono', monospace;
  font-size: 9px;
  color: #5a5550;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  margin-top: 8px;
  font-weight: 700;
}

.aisales-sb-group { padding: 0 22px; margin-bottom: 20px; }
.aisales-sb-section {
  font-family: 'SF Mono', 'JetBrains Mono', monospace;
  font-size: 9px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #5a5550;
  font-weight: 700;
  padding-bottom: 8px;
  margin-bottom: 4px;
  border-bottom: 1px solid #131313;
}

.aisales-sb-item {
  display: grid;
  grid-template-columns: 26px 1fr;
  gap: 10px;
  align-items: center;
  padding: 9px 10px;
  margin: 1px -10px;
  text-decoration: none;
  color: #b8b3a8;
  font-family: 'SF Mono', 'JetBrains Mono', monospace;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-weight: 700;
  border-left: 2px solid transparent;
  transition: color 0.1s, background 0.1s, border-color 0.1s;
}
.aisales-sb-item .num { font-size: 10px; color: #3a3a3a; }
.aisales-sb-item:hover { color: #f5f0e8; background: #0f0f0f; border-left-color: #c8f060; }
.aisales-sb-item:hover .num { color: #c8f060; }
.aisales-sb-item.active { color: #c8f060; background: #0d1216; border-left-color: #c8f060; }
.aisales-sb-item.active .num { color: #c8f060; }

.aisales-sb-status {
  margin-top: auto;
  padding: 18px 22px;
  border-top: 1px solid #1a1a1a;
  font-family: 'SF Mono', 'JetBrains Mono', monospace;
  font-size: 9px;
  letter-spacing: 0.12em;
  color: #5a5550;
  line-height: 1.7;
  text-transform: uppercase;
  font-weight: 700;
}
.aisales-sb-status .live { color: #c8f060; display: flex; align-items: center; gap: 6px; }
.aisales-sb-status .live::before {
  content: '';
  width: 6px; height: 6px; border-radius: 50%;
  background: #c8f060;
  display: inline-block;
  box-shadow: 0 0 0 3px rgba(200, 240, 96, 0.12);
  animation: aisalesPulse 2s infinite;
}
@keyframes aisalesPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
.aisales-sb-status .clock { color: #b8b3a8; margin-top: 4px; }
.aisales-sb-status .ver { color: #3a3a3a; margin-top: 10px; }

/* ============ Search ⌘K modal ============ */
.aisales-search-overlay {
  display: none;
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.75);
  z-index: 200;
  align-items: flex-start;
  justify-content: center;
  padding-top: 12vh;
  backdrop-filter: blur(2px);
}
.aisales-search-overlay.open { display: flex; }
.aisales-search-modal {
  width: 100%;
  max-width: 560px;
  background: #0a0a0a;
  border: 1px solid #2a2a2a;
  display: flex;
  flex-direction: column;
  max-height: 70vh;
}
.aisales-search-modal input {
  background: transparent;
  border: none;
  border-bottom: 1px solid #1a1a1a;
  color: #f5f0e8;
  padding: 18px 22px;
  font-family: Georgia, serif;
  font-size: 17px;
  outline: none;
  width: 100%;
}
.aisales-search-modal input::placeholder { color: #5a5550; }
.aisales-search-results {
  flex: 1;
  overflow-y: auto;
}
.aisales-search-empty {
  padding: 22px;
  font-family: 'SF Mono', monospace;
  font-size: 11px;
  color: #5a5550;
  text-align: center;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.aisales-search-item {
  display: grid;
  grid-template-columns: 60px 1fr;
  gap: 12px;
  padding: 12px 22px;
  border-bottom: 1px solid #131313;
  cursor: pointer;
  text-decoration: none;
  color: #f5f0e8;
  align-items: center;
}
.aisales-search-item:last-child { border-bottom: none; }
.aisales-search-item:hover,
.aisales-search-item.kbd-active {
  background: #141414;
}
.aisales-search-item.kbd-active {
  border-left: 2px solid #c8f060;
  padding-left: 20px;
}
.aisales-search-item .type {
  font-family: 'SF Mono', monospace;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  padding: 3px 7px;
  text-align: center;
}
.aisales-search-item .type.page { background: #0f2a3a; color: #60c8f0; }
.aisales-search-item .type.client { background: #28121b; color: #f06090; }
.aisales-search-item .type.action { background: #1a2a14; color: #c8f060; }
.aisales-search-item .lbl {
  font-family: Georgia, serif;
  font-size: 14px;
  line-height: 1.3;
}
.aisales-search-foot {
  padding: 10px 22px;
  border-top: 1px solid #1a1a1a;
  font-family: 'SF Mono', monospace;
  font-size: 9px;
  color: #5a5550;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  display: flex;
  gap: 18px;
}
.aisales-search-foot kbd {
  background: #1a1a1a;
  border: 1px solid #2a2a2a;
  padding: 1px 6px;
  font-family: inherit;
  font-size: inherit;
  color: #c8f060;
}

/* Мобильный гамбургер */
.aisales-sb-toggle {
  display: none;
  position: fixed;
  left: 12px; top: 12px;
  width: 40px; height: 40px;
  background: #0a0a0a;
  border: 1px solid #2a2a2a;
  color: #c8f060;
  z-index: 110;
  cursor: pointer;
  font-family: 'SF Mono', monospace;
  font-size: 16px;
  font-weight: 700;
}
.aisales-sb-toggle:hover { border-color: #c8f060; }

/* Десктоп: сайдбар фиксирован, контент сдвинут */
@media (min-width: 901px) {
  body { padding-left: 240px !important; }
  /* Прячем существующие нав-табы в топбаре (заменены сайдбаром) */
  .topbar-nav, nav.topbar-tabs { display: none !important; }
}

/* Мобайл: сайдбар скрыт по умолчанию, гамбургер виден */
@media (max-width: 900px) {
  .aisales-sidebar {
    transform: translateX(-100%);
    transition: transform 0.2s ease-out;
    width: 88vw;
    max-width: 320px;
  }
  .aisales-sidebar.open { transform: translateX(0); }
  .aisales-sb-toggle { display: flex; align-items: center; justify-content: center; }
  .aisales-sb-overlay {
    display: none;
    position: fixed; inset: 0;
    background: rgba(0, 0, 0, 0.6);
    z-index: 99;
  }
  .aisales-sb-overlay.open { display: block; }

  /* Поднимаем гамбургер чуть ниже — чтобы не перекрывал topbar */
  .aisales-sb-toggle { top: 14px; left: 14px; }
  /* На мобайле topbar получает левый отступ — место под гамбургер */
  .topbar { padding-left: 64px !important; }
}

/* ============ ГЛОБАЛЬНЫЕ МОБИЛЬНЫЕ ПРАВКИ ============ */
@media (max-width: 700px) {
  /* Общая компактность */
  body { font-size: 14.5px; }
  .shell { padding-left: 14px !important; padding-right: 14px !important; }
  .topbar { padding: 12px 14px 12px 60px !important; gap: 10px; }
  .topbar-title { font-size: 16px !important; }
  .topbar-meta { font-size: 10px !important; }

  /* Section headers компактнее */
  .sec-head { padding: 14px 2px 8px !important; }

  /* Settings rows — стек на мобайле */
  .row {
    grid-template-columns: 1fr !important;
    gap: 8px !important;
    padding: 14px 0 !important;
  }
  .row .val { width: 100%; }
  .row .val input { width: 100%; }

  /* Conversation 3-column → tabs/stack */
  .shell:has(.client):has(.conv):has(.actions),
  .shell.has-conv {
    grid-template-columns: 1fr !important;
  }
  .client,
  .actions {
    max-height: none !important;
    border: none !important;
    border-bottom: 1px solid #1a1a1a !important;
  }
  .conv-body { max-height: 60vh !important; }
  .client-section, .actions-section { padding: 14px 18px !important; }

  /* Calendar: cells меньше, агенда-стиль */
  .cal-grid { grid-auto-rows: 80px !important; }
  .cal-day { padding: 5px 6px !important; }
  .cal-day-num .day { font-size: 13px !important; }
  .cal-weekdays .wd { padding: 6px 8px !important; font-size: 9px !important; }
  .ev { font-size: 8px !important; padding: 2px 4px !important; }
  .controls { padding: 12px 14px !important; gap: 10px; }
  .month-nav .label-current { font-size: 17px !important; }
  .filters { flex-wrap: wrap; }

  /* Pipeline filters — горизонтальный скролл */
  .shell.has-filters .filters { flex-wrap: wrap; }
  aside.filters { padding: 14px !important; }

  /* Hero numbers компактнее */
  .hero-stat .val,
  .metric-value,
  .stage-count,
  .hero-main h1,
  .step-head h1 { font-size: 28px !important; line-height: 1.05 !important; }
  .metric { min-height: 100px !important; padding: 12px !important; }
  .stat .val { font-size: 32px !important; }

  /* Карусели preview — упрощаем */
  .card-preview .slide-stack { gap: 4px; }
  .card-preview .mini-slide { padding: 6px !important; }

  /* Panels с padding меньше */
  .panel { padding: 18px 16px !important; }

  /* CTA-bar компактнее */
  .cta-bar { padding: 16px !important; flex-direction: column; align-items: flex-start; }
  .cta-bar .ttl { font-size: 16px !important; }

  /* Conversation composer фикс */
  .composer { padding: 12px 14px !important; }
  .composer-input { font-size: 14px !important; }
  .composer-send { padding: 0 14px !important; }

  /* Onboarding панели */
  .next-steps { grid-template-columns: 1fr !important; }
  .step-head h1 { font-size: 28px !important; }
  .panel h3 { font-size: 18px !important; }

  /* Sidebar item больше по высоте на мобайле */
  .aisales-sb-item { padding: 12px 10px !important; font-size: 12px !important; }

  /* Search ⌘K на мобайле во весь экран */
  .aisales-search-overlay { padding-top: 0 !important; align-items: stretch; }
  .aisales-search-modal { max-width: 100% !important; max-height: 100vh !important; }
}

/* ============ Совсем узкие экраны (телефон вертикально) ============ */
@media (max-width: 480px) {
  .hero-main h1,
  .step-head h1 { font-size: 24px !important; }
  .metric-value, .stage-count, .stat .val,
  .kpi-card .val { font-size: 26px !important; }
  .cal-grid { grid-auto-rows: 64px !important; }
  .hero-stat .val { font-size: 32px !important; }
}

/* ============ ПРИЦЕЛЬНЫЕ ПРАВКИ КОНКРЕТНЫХ ЭКРАНОВ ============ */
@media (max-width: 700px) {
  /* === PIPELINE: вертикальная компоновка фильтров === */
  .filters {
    max-height: 50vh;
    overflow-y: auto;
  }
  .filter-block { padding: 12px 14px 14px !important; }
  .chip {
    font-size: 10px !important;
    padding: 6px 10px !important;
  }
  /* Скроллим горизонтально таблицу клиентов чтобы не ломалась */
  .table { overflow-x: auto; }
  .row-head, .row {
    grid-template-columns: 200px 140px 80px 70px 200px !important;
    min-width: 690px;
  }
  .row .col-time, .row-head .col-time,
  .row .fc, .row-head .h:last-child { display: none !important; }

  /* === REPORTS: charts смещаются плотнее === */
  .line-chart { height: 180px !important; }
  .kpi-card { min-height: 130px !important; padding: 14px !important; }
  .funnel-row {
    grid-template-columns: 80px 1fr 50px !important;
    gap: 8px !important;
  }
  .funnel-row .stage-name { font-size: 12px !important; }
  .funnel-row .conv { font-size: 10px !important; }
  .bar-row {
    grid-template-columns: 50px 1fr 40px !important;
    gap: 8px !important;
  }
  .data-row {
    grid-template-columns: 1fr 50px 60px 60px !important;
    font-size: 12px !important;
  }
  .insight { padding: 12px 14px !important; }

  /* === INBOX: компактнее, без preview-строки === */
  .inbox-controls { padding: 10px 14px !important; }
  .inbox-search { min-width: 140px !important; font-size: 10px !important; padding: 6px 10px !important; }
  .item { padding: 14px 14px !important; grid-template-columns: 32px 1fr !important; gap: 10px; }
  .item-icon { width: 30px !important; height: 30px !important; }
  .item-meta {
    grid-column: 1 / -1;
    display: flex;
    justify-content: space-between;
    margin-top: 4px;
    text-align: left;
  }
  .item-quick-action { margin-top: 0 !important; }
  .item-preview { white-space: normal !important; font-size: 10px !important; }
  .item-title { font-size: 14px !important; }
  .day-sep { padding: 10px 14px 6px !important; }

  /* === KB: коллекции в 2 ряда вместо 5 === */
  .collections { grid-template-columns: repeat(2, 1fr) !important; }
  .coll { min-height: 200px !important; padding: 16px 16px 14px !important; }
  .coll-count { font-size: 30px !important; }
  .coll-icon { font-size: 26px !important; }
  .coll-name { font-size: 16px !important; }
  .coll-meta { font-size: 10px !important; }
  .gap { grid-template-columns: auto 1fr !important; }
  .gap-action { grid-column: 1 / -1; justify-self: flex-start; }

  /* === CALENDAR: переход в agenda-mode === */
  .cal-grid {
    grid-auto-rows: 70px !important;
    grid-template-columns: repeat(7, 1fr);
  }
  .cal-day {
    padding: 4px 5px !important;
    font-size: 10px;
  }
  .cal-day-num .day { font-size: 12px !important; }
  .ev {
    font-size: 7px !important;
    padding: 1px 3px !important;
    letter-spacing: 0;
  }
  .controls { padding: 10px 12px !important; flex-direction: column; align-items: stretch; }
  .month-nav { justify-content: center; }
  .filters-row { justify-content: center; flex-wrap: wrap; }
  .cta-new { width: 100%; }
  .queue-item {
    grid-template-columns: auto 1fr !important;
    gap: 10px !important;
  }
  .queue-when, .queue-status {
    grid-column: 1 / -1;
    display: flex;
    justify-content: space-between;
    margin-top: 2px;
  }

  /* === CONVERSATION: на мобиле — режим табов между панелями === */
  .shell:has(.client):has(.conv):has(.actions) {
    grid-template-columns: 1fr !important;
  }
  .conv-head { padding: 10px 14px !important; }
  .conv-tabs button, .conv-tab { font-size: 9px !important; padding: 5px 8px !important; }
  .conv-controls { display: none; }
  .msg { max-width: 90% !important; }
  .msg-bubble { font-size: 13px !important; padding: 8px 12px !important; }
  .msg-circle { width: 100px !important; height: 100px !important; }
  .composer-warn { padding: 6px 10px !important; font-size: 9px !important; }
  .composer-row { gap: 6px; }
  .composer-send { padding: 0 12px !important; font-size: 10px !important; }
  /* Прячем правую панель actions на мобиле — она доступна через свайп или кнопку */
  .actions {
    display: none !important;
  }

  /* === AGENTS drill-down === */
  .agent-tabs { grid-template-columns: 1fr !important; }
  .agent-tab { min-height: 92px !important; padding: 14px 16px !important; }

  /* === GENERATOR: компактные template-карточки === */
  .templates { grid-template-columns: 1fr !important; gap: 4px !important; }
  .template { min-height: 120px !important; }
  .seg-grid { grid-template-columns: repeat(2, 1fr) !important; }
  .seg-card { min-height: 100px !important; }
  .seg-card .s-letter { font-size: 36px !important; }
  .gen-bar { padding: 16px !important; flex-direction: column; }
  .gen-bar button { width: 100%; }

  /* === SETTINGS: уже стек, но input'ы шире === */
  .row input, .row .range-vis, .row .select-pill { width: 100% !important; }
  .save-band { padding: 12px 14px !important; flex-direction: column; gap: 10px; align-items: stretch; }
  .save-band button { width: 100%; }

  /* === PROJECT dashboard === */
  .stage-card {
    grid-template-columns: 40px 1fr !important;
    gap: 10px !important;
  }
  .stage-tasks, .stage-progress-col {
    grid-column: 1 / -1;
    padding-top: 6px;
  }
  .columns { grid-template-columns: 1fr !important; gap: 4px !important; }
  .task { padding: 11px 14px !important; }

  /* === CAROUSELS/REELS landing: cards стак === */
  .card { font-size: 14px; }
  .card-preview { aspect-ratio: 16/9 !important; }
  .card-preview .mini-slide { padding: 4px !important; }
  .card-preview .mini-slide .h { font-size: 11px !important; }
  .card-meta { grid-template-columns: 1fr 1fr !important; }

  /* === LOGIN: убираем брендинг (уже скрыто >900px) === */
  .auth-card h2 { font-size: 28px !important; }
  .form-group input { font-size: 14px !important; padding: 12px 14px !important; }

  /* === ONBOARDING: степпер горизонтальный скролл === */
  .steps-bar { padding: 10px 14px !important; }
  .step-pill { flex: 0 0 110px !important; }
  .step-pill .name { font-size: 11px !important; }

  /* === SEARCH ⌘K — fullscreen on mobile === */
  .aisales-search-modal input { font-size: 15px !important; padding: 14px 18px !important; }
}
`;

  // ============ Логика ============
  function detectActiveLabel(pathname) {
    for (const group of NAV_GROUPS) {
      for (const item of group.items) {
        for (const pattern of item.match) {
          if (pathname.includes(pattern)) return item.label;
        }
      }
    }
    return null;
  }

  function escapeHTML(str) {
    return String(str).replace(/[&<>"]/g, (s) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[s]));
  }

  function buildHTML(activeLabel) {
    const groups = NAV_GROUPS.map((group) => {
      const items = group.items
        .map((item) => {
          const cls = item.label === activeLabel ? 'aisales-sb-item active' : 'aisales-sb-item';
          return `<a href="${escapeHTML(item.href)}" class="${cls}" data-label="${escapeHTML(item.label)}">
            <span class="num">/${escapeHTML(item.num)}</span>
            <span class="lbl">${escapeHTML(item.label)}</span>
          </a>`;
        })
        .join('');
      return `<div class="aisales-sb-group">
        <div class="aisales-sb-section">${escapeHTML(group.title)}</div>
        ${items}
      </div>`;
    }).join('');

    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const months = ['ЯНВ', 'ФЕВ', 'МАР', 'АПР', 'МАЯ', 'ИЮН', 'ИЮЛ', 'АВГ', 'СЕН', 'ОКТ', 'НОЯ', 'ДЕК'];
    const clock = `${now.getDate()} ${months[now.getMonth()]} · ${pad(now.getHours())}:${pad(now.getMinutes())}`;

    return `
      <aside class="aisales-sidebar" id="aisalesSidebar">
        <div class="aisales-sb-brand">
          <a href="/01-portal/ai-sales-portal.html">
            <div class="title">AI Sales<br/><span class="accent">System</span></div>
            <div class="sub">v0.1 · multi-agent</div>
          </a>
        </div>
        ${groups}
        <div class="aisales-sb-status">
          <span class="live">4/4 ONLINE</span>
          <div class="clock" id="aisalesClock">${clock}</div>
          <div class="ver">AISALES · DEPLOY 15.05.26</div>
        </div>
      </aside>
      <button class="aisales-sb-toggle" id="aisalesSbToggle" aria-label="Toggle navigation">≡</button>
      <div class="aisales-sb-overlay" id="aisalesSbOverlay"></div>
      <div class="aisales-search-overlay" id="aisalesSearchOverlay">
        <div class="aisales-search-modal" role="dialog" aria-label="Search">
          <input id="aisalesSearchInput" type="text" placeholder="Поиск страниц, клиентов, действий..." autocomplete="off" />
          <div class="aisales-search-results" id="aisalesSearchResults"></div>
          <div class="aisales-search-foot">
            <span><kbd>↑</kbd><kbd>↓</kbd> навигация</span>
            <span><kbd>↵</kbd> открыть</span>
            <span><kbd>esc</kbd> закрыть</span>
            <span style="margin-left:auto; color:#3a3a3a;">⌘K</span>
          </div>
        </div>
      </div>
    `;
  }

  // ============ Поиск ⌘K ============
  function fuzzyMatch(query, item) {
    if (!query) return true;
    const q = query.toLowerCase().trim();
    const haystack = (item.label + ' ' + (item.keywords || '')).toLowerCase();
    return haystack.includes(q);
  }

  function renderSearchResults(query) {
    const container = document.getElementById('aisalesSearchResults');
    if (!container) return;
    const filtered = SEARCH_INDEX.filter((it) => fuzzyMatch(query, it));
    if (filtered.length === 0) {
      container.innerHTML = '<div class="aisales-search-empty">Ничего не найдено</div>';
      return;
    }
    container.innerHTML = filtered
      .map((it, i) => `
        <a href="${escapeHTML(it.href)}" class="aisales-search-item${i === 0 ? ' kbd-active' : ''}" data-idx="${i}">
          <span class="type ${escapeHTML(it.type)}">${escapeHTML(it.type)}</span>
          <span class="lbl">${escapeHTML(it.label)}</span>
        </a>
      `).join('');
  }

  function initSearch() {
    const overlay = document.getElementById('aisalesSearchOverlay');
    const input = document.getElementById('aisalesSearchInput');
    const results = document.getElementById('aisalesSearchResults');
    if (!overlay || !input || !results) return;

    let activeIdx = 0;

    const open = () => {
      overlay.classList.add('open');
      input.value = '';
      activeIdx = 0;
      renderSearchResults('');
      setTimeout(() => input.focus(), 30);
    };
    const close = () => overlay.classList.remove('open');

    input.addEventListener('input', () => {
      activeIdx = 0;
      renderSearchResults(input.value);
    });

    document.addEventListener('keydown', (e) => {
      // ⌘K / Ctrl+K — открыть
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (overlay.classList.contains('open')) close();
        else open();
        return;
      }
      if (!overlay.classList.contains('open')) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        const items = results.querySelectorAll('.aisales-search-item');
        if (!items.length) return;
        items[activeIdx]?.classList.remove('kbd-active');
        activeIdx = (activeIdx + 1) % items.length;
        items[activeIdx]?.classList.add('kbd-active');
        items[activeIdx]?.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const items = results.querySelectorAll('.aisales-search-item');
        if (!items.length) return;
        items[activeIdx]?.classList.remove('kbd-active');
        activeIdx = (activeIdx - 1 + items.length) % items.length;
        items[activeIdx]?.classList.add('kbd-active');
        items[activeIdx]?.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const items = results.querySelectorAll('.aisales-search-item');
        const target = items[activeIdx];
        if (target) window.location.href = target.getAttribute('href');
      }
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
  }

  function init() {
    // 1. Стили
    const style = document.createElement('style');
    style.id = 'aisales-sidebar-styles';
    style.textContent = CSS;
    document.head.appendChild(style);

    // 2. Разметка
    const active = detectActiveLabel(window.location.pathname);
    const wrapper = document.createElement('div');
    wrapper.innerHTML = buildHTML(active).trim();
    // переносим всех детей в начало body
    Array.from(wrapper.children).reverse().forEach((node) => {
      document.body.insertBefore(node, document.body.firstChild);
    });

    // 3. Тоггл для мобилы
    const toggle = document.getElementById('aisalesSbToggle');
    const sidebar = document.getElementById('aisalesSidebar');
    const overlay = document.getElementById('aisalesSbOverlay');
    if (toggle && sidebar && overlay) {
      const close = () => {
        sidebar.classList.remove('open');
        overlay.classList.remove('open');
      };
      toggle.addEventListener('click', () => {
        sidebar.classList.toggle('open');
        overlay.classList.toggle('open');
      });
      overlay.addEventListener('click', close);
      // Закрываем при переходе по ссылке
      sidebar.querySelectorAll('.aisales-sb-item').forEach((a) => a.addEventListener('click', close));
    }

    // 4. Поиск ⌘K
    initSearch();

    // 5. Обновление часов раз в минуту
    setInterval(() => {
      const el = document.getElementById('aisalesClock');
      if (!el) return;
      const d = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const months = ['ЯНВ', 'ФЕВ', 'МАР', 'АПР', 'МАЯ', 'ИЮН', 'ИЮЛ', 'АВГ', 'СЕН', 'ОКТ', 'НОЯ', 'ДЕК'];
      el.textContent = `${d.getDate()} ${months[d.getMonth()]} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }, 60000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
