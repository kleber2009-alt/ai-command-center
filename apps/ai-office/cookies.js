/* ═══════════════════════════════════════════════════════════════════
   cookies.js — баннер согласия (GDPR / 152-ФЗ)
   ───────────────────────────────────────────────────────────────────
   · Показывается один раз, выбор сохраняется в localStorage
   · 3 кнопки: «Только необходимые» · «Настроить» · «Принять все»
   · Эмиттит CustomEvent 'aio-cookies-changed' с consent-объектом
   · Подключение: <script src="cookies.js" defer></script>
   · Использование:
       window.addEventListener('aio-cookies-changed', e => {
         if (e.detail.analytics) { /* запустить GA4 / Метрику */ }
       });
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  if (window.__aioCookiesLoaded) return;
  window.__aioCookiesLoaded = true;

  const KEY = 'aio_cookies_consent_v1';
  const saved = (() => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } })();

  function emit(consent) {
    window.dispatchEvent(new CustomEvent('aio-cookies-changed', { detail: consent }));
  }
  function save(consent) {
    consent.ts = Date.now();
    localStorage.setItem(KEY, JSON.stringify(consent));
    emit(consent);
  }

  // Если уже есть выбор — эмиттим и выходим
  if (saved && saved.ts) {
    setTimeout(() => emit(saved), 50);
    return;
  }

  // ── CSS ──
  const css = `
    #aio-ck {
      position: fixed; left: 70px; bottom: 16px; z-index: 9500;
      max-width: 460px;
      background: rgba(13, 15, 26, .97);
      backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
      border: 1px solid rgba(200, 240, 96, .25);
      border-radius: 14px; padding: 18px 18px 14px;
      color: #e8e4f0; font: 400 13px/1.55 'Inter', -apple-system, sans-serif;
      box-shadow: 0 24px 60px rgba(0,0,0,.55), 0 0 0 1px rgba(200,240,96,.08);
      animation: aiCkIn .35s cubic-bezier(.2,.8,.4,1);
    }
    @keyframes aiCkIn { from { opacity:0; transform: translateY(20px) } to { opacity:1; transform: none } }
    #aio-ck .hd { display:flex; align-items:center; gap:10px; margin-bottom:10px }
    #aio-ck .em { font-size: 22px }
    #aio-ck .ti { font-weight: 700; font-size: 13.5px; letter-spacing:.2px }
    #aio-ck p { margin: 4px 0 12px; font-size: 12px; color: rgba(232,228,240,.7); line-height: 1.6 }
    #aio-ck p a { color: #60c8f0; text-decoration: none; border-bottom: 1px solid rgba(96,200,240,.3) }
    #aio-ck p a:hover { border-bottom-color: #60c8f0 }
    #aio-ck .btns { display: flex; gap: 6px; flex-wrap: wrap }
    #aio-ck button {
      flex: 1; min-width: 0; padding: 9px 12px; border-radius: 9px;
      font: 700 11px/1 'Inter', sans-serif; letter-spacing: .3px;
      cursor: pointer; transition: all .15s; border: 1px solid rgba(255,255,255,.12);
      background: rgba(255,255,255,.03); color: #e8e4f0; white-space: nowrap;
    }
    #aio-ck button:hover { background: rgba(255,255,255,.08); border-color: rgba(255,255,255,.2) }
    #aio-ck button.primary {
      background: linear-gradient(90deg, #c8f060, #60c8f0); color: #080808; border-color: transparent;
      box-shadow: 0 4px 14px rgba(200,240,96,.2);
    }
    #aio-ck button.primary:hover { transform: translateY(-1px); box-shadow: 0 6px 18px rgba(200,240,96,.35) }

    /* Settings panel */
    #aio-ck-set { display: none; border-top: 1px solid rgba(255,255,255,.08); margin-top: 12px; padding-top: 12px }
    #aio-ck-set.open { display: block }
    .aio-ck-row { display: flex; align-items: flex-start; gap: 10px; padding: 6px 0; font-size: 11.5px }
    .aio-ck-row .chk {
      width: 32px; height: 18px; background: rgba(255,255,255,.1); border-radius: 10px;
      position: relative; flex-shrink: 0; cursor: pointer; margin-top: 2px; transition: background .15s;
    }
    .aio-ck-row .chk.on { background: #c8f060 }
    .aio-ck-row .chk.locked { background: rgba(200,240,96,.4); cursor: not-allowed }
    .aio-ck-row .chk::after {
      content: ''; position: absolute; left: 2px; top: 2px;
      width: 14px; height: 14px; background: #fff; border-radius: 50%;
      transition: left .15s;
    }
    .aio-ck-row .chk.on::after, .aio-ck-row .chk.locked::after { left: 16px }
    .aio-ck-row .lbl { flex: 1 }
    .aio-ck-row .lbl b { display: block; color: #e8e4f0; font-size: 11.5px; font-weight: 700; margin-bottom: 2px }
    .aio-ck-row .lbl span { color: rgba(232,228,240,.55); font-size: 10.5px; line-height: 1.5 }

    @media (max-width: 600px) {
      #aio-ck { left: 12px; right: 12px; bottom: 12px; max-width: none }
      #aio-ck .btns button { font-size: 10.5px; padding: 9px 8px }
    }
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  // ── HTML ──
  const ck = document.createElement('div');
  ck.id = 'aio-ck';
  ck.setAttribute('role', 'dialog');
  ck.setAttribute('aria-label', 'Согласие на использование cookies');
  ck.innerHTML = `
    <div class="hd">
      <div class="em">🍪</div>
      <div class="ti">Мы используем cookies</div>
    </div>
    <p>Технические cookies нужны для работы Сервиса. Аналитические — для улучшения UX. Подробнее в <a href="privacy.html" target="_blank">Политике конфиденциальности</a>.</p>
    <div class="btns">
      <button id="aio-ck-min">Только необходимые</button>
      <button id="aio-ck-cfg">Настроить</button>
      <button id="aio-ck-all" class="primary">Принять все ✓</button>
    </div>
    <div id="aio-ck-set">
      <div class="aio-ck-row">
        <div class="chk locked" title="Не отключается"></div>
        <div class="lbl"><b>Необходимые</b><span>Сессия, аутентификация, API-прокси. Без них Сервис не работает.</span></div>
      </div>
      <div class="aio-ck-row" data-cat="analytics">
        <div class="chk on"></div>
        <div class="lbl"><b>Аналитика</b><span>Google Analytics 4, Яндекс.Метрика. Помогает понять, что улучшать.</span></div>
      </div>
      <div class="aio-ck-row" data-cat="marketing">
        <div class="chk on"></div>
        <div class="lbl"><b>Маркетинг</b><span>Пиксели Meta/VK. Чтобы показывать рекламу только тем, кому интересно.</span></div>
      </div>
      <div class="btns" style="margin-top:10px">
        <button id="aio-ck-save" class="primary">Сохранить выбор</button>
      </div>
    </div>
  `;
  document.body.appendChild(ck);

  // Toggle handlers
  ck.querySelectorAll('.aio-ck-row .chk:not(.locked)').forEach(chk => {
    chk.onclick = () => chk.classList.toggle('on');
  });

  document.getElementById('aio-ck-all').onclick = () => {
    save({ necessary: true, analytics: true, marketing: true });
    ck.remove();
  };
  document.getElementById('aio-ck-min').onclick = () => {
    save({ necessary: true, analytics: false, marketing: false });
    ck.remove();
  };
  document.getElementById('aio-ck-cfg').onclick = () => {
    document.getElementById('aio-ck-set').classList.toggle('open');
  };
  document.getElementById('aio-ck-save').onclick = () => {
    const analytics = ck.querySelector('[data-cat="analytics"] .chk').classList.contains('on');
    const marketing = ck.querySelector('[data-cat="marketing"] .chk').classList.contains('on');
    save({ necessary: true, analytics, marketing });
    ck.remove();
  };
})();
