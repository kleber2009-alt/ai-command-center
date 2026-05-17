/* ═══════════════════════════════════════════════════════════════════
   sidebar.js — единый левый сайдбар для всех страниц AI Office
   ───────────────────────────────────────────────────────────────────
   · 56px свёрнут (иконки + tooltip) → 220px при hover (с лейблами)
   · Подсветка текущей страницы по URL
   · Глассморфизм, тёмный фон, работает на любой теме
   · Mobile: кнопка-toggle, drawer
   · Подключается одной строкой: <script src="sidebar.js" defer></script>
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  if (window.__aioSidebarLoaded) return;
  window.__aioSidebarLoaded = true;

  const ITEMS = [
    // ═════════ ПРОЕКТЫ ═════════
    { sep: true, label: 'Проекты' },
    { icon: '🎙', label: 'Транскрибация',            href: '/transcribe',     highlight: true },
    { icon: '🗣', label: 'Голос · клонирование',     href: 'persona-train.html', highlight: true },

    // ═════════ ОРИЕНТАЦИЯ ═════════
    { sep: true, label: 'Ориентация' },
    { icon: '🧭', label: 'Навигация · карта сайта', href: 'navigation.html', highlight: true },
    { icon: '📱', label: 'Telegram Mini App',        href: 'mini-app-preview.html' },
    { icon: '🏠', label: 'Главная',                  href: 'index.html'      },
    { icon: '📖', label: 'Как это работает',         href: 'how-it-works.html' },
    { icon: '👋', label: 'О проекте',                href: 'about.html'      },
    { icon: '❓', label: 'FAQ',                      href: 'faq.html'        },

    // ═════════ ПУТЬ КЛИЕНТА ═════════
    { sep: true, label: 'Путь клиента' },
    { icon: '📋', label: '1 · Бриф (5 мин)',         href: 'onboarding.html' },
    { icon: '🎯', label: '2 · Подбор команды',       href: 'recommend.html'  },
    { icon: '🏢', label: '3 · Мой Офис',             href: 'dashboard.html'  },
    { icon: '🎨', label: '4 · Marketing Workspace',  href: 'marketing-workspace.html' },
    { icon: '⚙️', label: '4 · Tech Workspace',       href: 'tech-workspace.html' },
    { icon: '💼', label: '4 · Sales Workspace',      href: 'sales-workspace.html' },

    // ═════════ РЕШАЮ ПОКУПАТЬ ═════════
    { sep: true, label: 'Решаю покупать' },
    { icon: '💎', label: 'Тарифы',                   href: 'pricing.html'    },
    { icon: '🧮', label: 'ROI-калькулятор',          href: 'roi.html'        },
    { icon: '⚖️', label: 'Сравнение vs найм',        href: 'compare.html'    },
    { icon: '📈', label: 'Кейсы · 5 сценариев',      href: 'cases.html'      },
    { icon: '📊', label: 'Результаты · 60 дней',     href: 'dashboard-demo.html' },
    { icon: '📺', label: 'Видео-демо',               href: 'demo.html'       },
    { icon: '💬', label: 'Диалог 4 агентов',         href: 'demo-dialogue.html' },

    // ═════════ ИЗУЧИТЬ ═════════
    { sep: true, label: 'Изучить' },
    { icon: '🤖', label: '169 AI-агентов',           href: 'agents.html'     },
    { icon: '📚', label: 'Блог · 6 статей',          href: 'blog/'           },
    { icon: '📖', label: 'Глоссарий · 25 терминов',  href: 'glossary.html'   },
    { icon: '📄', label: 'PDF · 10 промптов',        href: 'lead-magnet-gate.html' },
    { icon: '✉️', label: '7 email-шаблонов',        href: 'emails.html'     },

    // ═════════ ПАРТНЁРКА ═════════
    { sep: true, label: 'Партнёрка' },
    { icon: '🤝', label: 'Партнёрка · 30%',          href: 'partners.html'   },
    { icon: '📊', label: 'Кабинет партнёра · demo',  href: 'partner-dashboard.html' },
    { icon: '🎨', label: 'Brand Kit',                href: 'brand-kit.html'  },

    // ═════════ 3D / PIXEL ДЕМО ═════════
    { sep: true, label: '3D / Pixel демо' },
    { icon: '🏙', label: 'Маркетинг · 3D',           href: 'ai-marketing-office-3d.html', mini: true },
    { icon: '💻', label: 'Программисты · 3D',        href: 'ai-tech-office-3d.html', mini: true },
    { icon: '🎨', label: 'Pixel · Tech',             href: 'ai-tech-office-pixel.html', mini: true },
    { icon: '🌆', label: 'Pixel · Growth',           href: 'ai-growth-office-pixel.html', mini: true },
    { icon: '🏞', label: 'Iso · v6',                 href: 'ai-growth-office-v6-upgraded.html', mini: true },
    { icon: '⚡', label: 'Pipeline (legacy)',        href: 'pipeline.html', mini: true },

    // ═════════ АДМИН / DEV ═════════
    { sep: true, label: 'Админ / Dev' },
    { icon: '📬', label: 'Leads Inbox',              href: 'leads-inbox.html', mini: true },
    { icon: '🛠', label: 'Dev Tools',                href: 'dev-tools.html', mini: true },
    { icon: '🧪', label: 'E2E Test Suite',           href: 'test.html', mini: true },
    { icon: '✨', label: 'Что нового',                href: 'whats-new.html', mini: true },
    { icon: '🗂', label: 'Hub · старый каталог',     href: 'hub.html', mini: true },

    // ═════════ ЮРИДИЧЕСКОЕ ═════════
    { sep: true, label: 'Юридическое' },
    { icon: '🔒', label: 'Приватность',              href: 'privacy.html', mini: true },
    { icon: '📜', label: 'Условия',                  href: 'terms.html', mini: true },
  ];

  // Текущая страница (по имени файла)
  const pageName = (location.pathname.split('/').pop() || '').toLowerCase();
  const current = (pageName === '' || pageName === 'index') ? 'index.html' : pageName.replace(/\.html?$/, '.html');

  // Имя/email из data-атрибутов на <body> или дефолт
  const userName  = document.body.dataset.user  || 'Илья Палий';
  const userEmail = document.body.dataset.email || 'ilia.info.paliy@gmail.com';
  const userInit  = userName.trim().charAt(0).toUpperCase() || 'I';

  /* ── CSS ── */
  const css = `
    /* A11y: Skip-link для клавиатурных пользователей */
    .aio-skip-link {
      position: absolute; top: -40px; left: 8px;
      background: #c8f060; color: #080808; padding: 8px 14px; border-radius: 8px;
      font: 800 12px/1 -apple-system, sans-serif; text-decoration: none;
      z-index: 99999; transition: top .15s;
    }
    .aio-skip-link:focus { top: 8px; outline: 2px solid #60c8f0; outline-offset: 2px }

    /* A11y: видимая фокус-рамка для Tab-навигации (не мешает мышиным юзерам) */
    *:focus-visible {
      outline: 2px solid #c8f060 !important;
      outline-offset: 2px !important;
      border-radius: 4px;
    }

    /* A11y: уважать prefers-reduced-motion */
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: .01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: .01ms !important;
        scroll-behavior: auto !important;
      }
    }

    body.has-aio-sb { padding-left: 56px !important; transition: padding-left .22s }
    #aio-sb-toggle { display: none }
    #aio-sb {
      position: fixed; left: 0; top: 0; bottom: 0; width: 56px;
      z-index: 9000;
      background: rgba(13, 15, 26, .94);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      border-right: 1px solid rgba(255,255,255,.08);
      display: flex; flex-direction: column;
      transition: width .22s cubic-bezier(.2,.8,.4,1);
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif;
      color: #fff;
    }
    #aio-sb:hover { width: 220px; box-shadow: 8px 0 32px rgba(0,0,0,.45) }
    .aio-sb-logo {
      height: 50px; display: flex; align-items: center; padding: 0 16px;
      border-bottom: 1px solid rgba(255,255,255,.06);
      text-decoration: none; color: inherit; flex-shrink: 0;
    }
    .aio-sb-logo .em { font-size: 20px; flex-shrink: 0 }
    .aio-sb-logo .lbl {
      margin-left: 12px; font-size: 11px; font-weight: 800;
      letter-spacing: .8px; white-space: nowrap;
      background: linear-gradient(90deg,#c8f060,#60c8f0);
      -webkit-background-clip: text; -webkit-text-fill-color: transparent;
      opacity: 0; transition: opacity .15s;
    }
    #aio-sb:hover .aio-sb-logo .lbl { opacity: 1; transition-delay: .05s }

    .aio-sb-search-wrap { padding: 8px 12px 4px; overflow:hidden }
    .aio-sb-search {
      width: 100%; max-width: 100%;
      background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.08);
      color: #fff; padding: 7px 12px 7px 30px; border-radius: 8px;
      font: 600 11.5px/1.2 inherit; outline: none;
      transition: border-color .15s, background .15s, opacity .15s;
      opacity: 0; pointer-events: none;
      background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'%3e%3cpath stroke='rgba(255,255,255,.4)' stroke-width='1.5' stroke-linecap='round' fill='none' d='M9 3a6 6 0 1 0 0 12 6 6 0 0 0 0-12zm9 14l-4.5-4.5'/%3e%3c/svg%3e");
      background-repeat:no-repeat; background-position: 8px center; background-size: 14px;
    }
    .aio-sb-search:focus { border-color: rgba(200,240,96,.4); background-color: rgba(255,255,255,.07) }
    .aio-sb-search::placeholder { color: rgba(255,255,255,.35) }
    #aio-sb:hover .aio-sb-search { opacity: 1; pointer-events: auto; transition-delay: .05s }
    .aio-sb-item.hidden { display: none !important }

    .aio-sb-items { flex: 1; padding: 6px 0; overflow-y: auto; overflow-x: hidden }
    .aio-sb-items::-webkit-scrollbar { width: 0 }
    .aio-sb-item {
      display: flex; align-items: center; height: 38px; padding: 0 16px;
      color: rgba(255,255,255,.65); font-size: 12px; text-decoration: none;
      position: relative; cursor: pointer; transition: background .15s, color .15s;
    }
    .aio-sb-item:hover { background: rgba(255,255,255,.07); color: #fff }
    .aio-sb-item.active { color: #c8f060; background: rgba(200,240,96,.06) }
    .aio-sb-item.active::before {
      content: ''; position: absolute; left: 0; top: 8px; bottom: 8px;
      width: 3px; background: #c8f060; border-radius: 0 3px 3px 0;
    }
    .aio-sb-icon { font-size: 17px; width: 24px; flex-shrink: 0; text-align: center; line-height: 1 }
    .aio-sb-lbl {
      margin-left: 12px; font-size: 12px; font-weight: 600;
      letter-spacing: .2px; white-space: nowrap;
      opacity: 0; transition: opacity .15s;
    }
    #aio-sb:hover .aio-sb-lbl { opacity: 1; transition-delay: .05s }
    .aio-sb-item.mini { height: 30px }
    .aio-sb-item.mini .aio-sb-icon { font-size: 14px; opacity: .8 }
    .aio-sb-item.mini .aio-sb-lbl { font-size: 11px; opacity: 0 }
    #aio-sb:hover .aio-sb-item.mini .aio-sb-lbl { opacity: .85 }

    /* Highlighted item (для «🧭 Навигация») */
    .aio-sb-item.highlight {
      background: linear-gradient(90deg, rgba(200,240,96,.07), rgba(96,200,240,.04));
      border-left: 2px solid rgba(200,240,96,.4);
    }
    .aio-sb-item.highlight .aio-sb-icon { animation: aio-pulse 2.5s infinite }
    .aio-sb-item.highlight .aio-sb-lbl { color: #c8f060; font-weight: 800 }
    @keyframes aio-pulse {
      0%, 100% { transform: scale(1); filter: drop-shadow(0 0 0 rgba(200,240,96,0)) }
      50%      { transform: scale(1.08); filter: drop-shadow(0 0 6px rgba(200,240,96,.4)) }
    }

    /* Section labels (на разделителях) */
    .aio-sb-sep {
      margin: 10px 0 3px; padding: 0 16px;
      font-size: 8.5px; font-weight: 800; letter-spacing: 1.4px;
      color: rgba(255,255,255,.28); text-transform: uppercase;
      opacity: 0; transition: opacity .15s;
      border-top: 1px solid rgba(255,255,255,.05); padding-top: 8px;
    }
    .aio-sb-sep.no-label { height: 1px; padding: 0; margin: 8px 14px;
      background: rgba(255,255,255,.06); border: 0; font-size: 0;
    }
    #aio-sb:hover .aio-sb-sep { opacity: 1; transition-delay: .05s }

    .aio-sb-foot {
      padding: 10px 14px; border-top: 1px solid rgba(255,255,255,.06);
      display: flex; align-items: center; flex-shrink: 0;
    }
    .aio-sb-foot .av {
      width: 30px; height: 30px; border-radius: 50%;
      background: linear-gradient(135deg, #c8f060, #60c8f0);
      color: #0a0d1a; display: flex; align-items: center; justify-content: center;
      font-weight: 800; font-size: 12px; flex-shrink: 0;
      box-shadow: 0 0 0 2px rgba(96, 200, 240, .35);
    }
    .aio-sb-foot .info { margin-left: 10px; opacity: 0; transition: opacity .15s; min-width: 0 }
    #aio-sb:hover .aio-sb-foot .info { opacity: 1; transition-delay: .05s }
    .aio-sb-foot .nm  { color: #fff; font-size: 11.5px; font-weight: 700; line-height: 1.2 }
    .aio-sb-foot .em2 { color: rgba(255,255,255,.45); font-size: 10px; line-height: 1.2; margin-top: 2px; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }

    /* Mobile */
    @media (max-width: 760px) {
      body.has-aio-sb { padding-left: 0 !important }
      #aio-sb { transform: translateX(-100%); transition: transform .26s cubic-bezier(.2,.8,.4,1); width: 240px }
      #aio-sb.open { transform: translateX(0) }
      #aio-sb-toggle {
        display: flex !important; position: fixed; top: 8px; left: 8px; z-index: 9001;
        width: 38px; height: 38px; background: rgba(13,15,26,.92);
        border: 1px solid rgba(255,255,255,.15); border-radius: 9px;
        align-items: center; justify-content: center;
        color: #fff; cursor: pointer; font-size: 17px;
        backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
      }
      #aio-sb-toggle:hover { background: rgba(40,40,60,.92) }
      #aio-sb .aio-sb-lbl, #aio-sb .aio-sb-logo .lbl, #aio-sb .aio-sb-foot .info { opacity: 1 }
    }
  `;

  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  /* ── HTML сборка ── */
  const sb = document.createElement('nav');
  sb.id = 'aio-sb';
  sb.setAttribute('aria-label', 'Главное меню');

  let html = '';
  html += `<a class="aio-sb-logo" href="index.html" title="AI Office"><span class="em">🏢</span><span class="lbl">AI&nbsp;OFFICE</span></a>`;
  // Search box (visible on hover)
  html += `<div class="aio-sb-search-wrap"><input type="search" class="aio-sb-search" placeholder="Поиск…" id="aio-sb-srch" aria-label="Поиск по меню" autocomplete="off"></div>`;
  html += '<div class="aio-sb-items">';
  for (const item of ITEMS) {
    if (item.sep) {
      if (item.label) {
        html += `<div class="aio-sb-sep">${item.label}</div>`;
      } else {
        html += '<div class="aio-sb-sep no-label"></div>';
      }
      continue;
    }
    const isActive = current === item.href.toLowerCase();
    const cls = 'aio-sb-item' + (isActive ? ' active' : '') + (item.mini ? ' mini' : '') + (item.highlight ? ' highlight' : '');
    const ariaCurrent = isActive ? ' aria-current="page"' : '';
    html += `<a class="${cls}" data-lbl="${item.label.toLowerCase()}" href="${item.href}" title="${item.label}" aria-label="${item.label}"${ariaCurrent}><span class="aio-sb-icon" aria-hidden="true">${item.icon}</span><span class="aio-sb-lbl">${item.label}</span></a>`;
  }
  html += '</div>';
  html += `<div class="aio-sb-foot"><div class="av">${userInit}</div><div class="info"><div class="nm">${userName}</div><div class="em2">${userEmail}</div></div></div>`;
  sb.innerHTML = html;

  // Mobile toggle button
  const toggle = document.createElement('button');
  toggle.id = 'aio-sb-toggle';
  toggle.setAttribute('aria-label', 'Открыть меню');
  toggle.innerHTML = '☰';
  toggle.onclick = () => sb.classList.toggle('open');

  document.body.classList.add('has-aio-sb');
  document.body.appendChild(sb);
  document.body.appendChild(toggle);

  // Search filter
  const srch = document.getElementById('aio-sb-srch');
  if (srch) {
    let lastSeps = null;
    srch.addEventListener('input', () => {
      const q = srch.value.trim().toLowerCase();
      const items = sb.querySelectorAll('.aio-sb-item');
      const seps  = sb.querySelectorAll('.aio-sb-sep');
      items.forEach(it => {
        const lbl = it.getAttribute('data-lbl') || '';
        const match = !q || lbl.includes(q);
        it.classList.toggle('hidden', !match);
      });
      // Hide separators if no visible items between them
      seps.forEach(sep => sep.style.display = q ? 'none' : '');
    });
    srch.addEventListener('keydown', e => {
      if (e.key === 'Escape') { srch.value = ''; srch.dispatchEvent(new Event('input')); }
      if (e.key === 'Enter') {
        const first = sb.querySelector('.aio-sb-item:not(.hidden)');
        if (first) location.href = first.getAttribute('href');
      }
    });
  }

  // Resize-trigger для Three.js / canvas-сцен — они пересчитают свой размер
  setTimeout(() => window.dispatchEvent(new Event('resize')), 80);
  setTimeout(() => window.dispatchEvent(new Event('resize')), 320);
})();
