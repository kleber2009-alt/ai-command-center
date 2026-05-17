/* ═══════════════════════════════════════════════════════════════════
   sw-register.js — единый registration helper для PWA
   ───────────────────────────────────────────────────────────────────
   · Регистрирует /sw.js
   · Слушает обновления — показывает toast «новая версия» с кнопкой Reload
   · Опционально: можно включить через window.AIO_SW_AUTO_UPDATE = true
     для авто-обновления без подтверждения
   · Заменяет inline-блок `navigator.serviceWorker.register(...)` на каждой странице
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  if (window.__aioSwLoaded) return;
  window.__aioSwLoaded = true;

  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;

  function showUpdateToast(registration) {
    // Avoid showing on admin/dev pages
    if (window.AIO_SW_AUTO_UPDATE) {
      registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
      return;
    }

    // Build floating toast
    if (document.getElementById('aio-sw-toast')) return;

    const css = `
      #aio-sw-toast {
        position: fixed; left: 50%; bottom: 22px; transform: translateX(-50%) translateY(120%);
        z-index: 10000; max-width: 380px; width: calc(100% - 24px);
        background: linear-gradient(135deg, rgba(13,15,26,.96), rgba(20,24,40,.96));
        border: 1px solid rgba(200,240,96,.35);
        border-radius: 14px; padding: 14px 18px;
        box-shadow: 0 16px 48px rgba(0,0,0,.55), 0 0 0 1px rgba(200,240,96,.15);
        backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
        font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
        color: #e9eef7; transition: transform .35s cubic-bezier(.2,.8,.4,1);
        display: flex; align-items: center; gap: 12px;
      }
      #aio-sw-toast.show { transform: translateX(-50%) translateY(0) }
      #aio-sw-toast .em { font-size: 24px; flex-shrink: 0 }
      #aio-sw-toast .tx { flex: 1; min-width: 0 }
      #aio-sw-toast .nm { font-size: 13.5px; font-weight: 800; line-height: 1.2 }
      #aio-sw-toast .ds { font-size: 11.5px; color: #9aa3b2; margin-top: 3px; line-height: 1.4 }
      #aio-sw-toast .btns { display: flex; gap: 6px; flex-shrink: 0 }
      #aio-sw-toast button {
        padding: 8px 14px; border-radius: 8px; border: 0;
        font: 800 11.5px/1 inherit; cursor: pointer; letter-spacing: .3px;
        transition: transform .15s;
      }
      #aio-sw-toast button:hover { transform: translateY(-1px) }
      #aio-sw-toast .pri {
        background: linear-gradient(135deg, #c8f060, #60c8f0);
        color: #080808;
      }
      #aio-sw-toast .sec {
        background: transparent; color: #9aa3b2;
        border: 1px solid rgba(255,255,255,.1);
      }
      @media (max-width: 480px) {
        #aio-sw-toast { flex-wrap: wrap }
        #aio-sw-toast .btns { width: 100%; justify-content: flex-end }
      }
    `;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    const toast = document.createElement('div');
    toast.id = 'aio-sw-toast';
    toast.innerHTML = `
      <div class="em">✨</div>
      <div class="tx">
        <div class="nm">Доступна новая версия</div>
        <div class="ds">Обнови, чтобы увидеть последние изменения</div>
      </div>
      <div class="btns">
        <button class="sec" id="aio-sw-later">Позже</button>
        <button class="pri" id="aio-sw-update">Обновить</button>
      </div>
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 80);

    document.getElementById('aio-sw-update').onclick = () => {
      registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
      toast.classList.remove('show');
      // Wait for controller change then reload
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        location.reload();
      }, { once: true });
    };
    document.getElementById('aio-sw-later').onclick = () => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 400);
    };
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(reg => {
      // Уже есть ожидающий SW → показываем toast сразу
      if (reg.waiting) {
        showUpdateToast(reg);
      }

      reg.addEventListener('updatefound', () => {
        const installing = reg.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            // Новая версия установилась поверх старой
            showUpdateToast(reg);
          }
        });
      });
    }).catch(e => console.warn('[SW] register failed:', e.message));

    // Опрос обновлений раз в 30 минут (если страница висит долго)
    setInterval(() => {
      navigator.serviceWorker.getRegistration().then(reg => reg?.update());
    }, 30 * 60 * 1000);
  });
})();
