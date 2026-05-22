/*!
 * AI Sales — Demo Simulation Engine
 * Вставляет живые события в интерфейс: feed, метрики, тосты
 */
(function() {
'use strict';

// ─── HELPERS ────────────────────────────────────────────────────────────────
function nowTs() {
  const d = new Date(), p = n => String(n).padStart(2,'0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}
function rand(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// ─── TOAST ──────────────────────────────────────────────────────────────────
let toastContainer;
function ensureToastContainer() {
  if (toastContainer) return;
  toastContainer = document.createElement('div');
  toastContainer.style.cssText = `
    position:fixed; bottom:24px; right:24px; z-index:9999;
    display:flex; flex-direction:column; gap:8px; align-items:flex-end;
    pointer-events:none;
  `;
  document.body.appendChild(toastContainer);
}

function showToast(text, type) {
  ensureToastContainer();
  const colors = { payment:'#30D158', alert:'#FF453A', info:'#0A84FF', hot:'#FF9F0A' };
  const toast = document.createElement('div');
  toast.style.cssText = `
    background:rgba(28,28,30,0.96);
    border:0.5px solid ${colors[type]||colors.info};
    border-left:3px solid ${colors[type]||colors.info};
    color:#fff; font-size:13px; line-height:1.4;
    padding:10px 16px; border-radius:10px;
    box-shadow:0 4px 24px rgba(0,0,0,.5);
    max-width:300px; word-break:break-word;
    pointer-events:auto; cursor:pointer;
    transform:translateX(100%); opacity:0;
    transition:transform .3s cubic-bezier(.4,0,.2,1), opacity .3s;
    font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif;
  `;
  toast.textContent = text;
  toastContainer.appendChild(toast);
  toast.addEventListener('click', () => dismissToast(toast));

  requestAnimationFrame(() => {
    toast.style.transform = 'translateX(0)';
    toast.style.opacity = '1';
  });

  setTimeout(() => dismissToast(toast), 5000);
}

function dismissToast(toast) {
  toast.style.transform = 'translateX(110%)';
  toast.style.opacity = '0';
  setTimeout(() => toast.remove(), 350);
}

// ─── FEED EVENTS (pulse.html) ────────────────────────────────────────────────
const FEED_EVENTS = [
  () => ({ ch:'ig', who:'@yuliya_smm',  act:`hello → <em>discovery</em>`,               by:'agent',  toast:null }),
  () => ({ ch:'tg', who:'@max_biz',     act:`scoring <em>${rand(40,60)}→${rand(70,90)}</em>`, by:'analyst', toast:null }),
  () => ({ ch:'ig', who:'@polina_k',    act:`pitch — отправил видео`,                    by:'agent',  toast:null }),
  () => ({ ch:'tg', who:'@roman_shop',  act:`<em>payment ${rand(40,120)}к ₽</em> → won`, by:'agent',  toast:'payment' }),
  () => ({ ch:'ig', who:'@anya_blog',   act:`objections «дорого» → <em>handled</em>`,    by:'agent',  toast:null }),
  () => ({ ch:'tg', who:'@kirill_pro',  act:`hello → квалифицирован · ICP ${rand(70,95)}%`, by:'analyst',toast:null }),
  () => ({ ch:'ig', who:'@natasha_v',   act:`<span class="ev-red">ESCALATION</span> → передан Илье`, by:'agent', toast:'alert' }),
  () => ({ ch:'tg', who:'@boris_food',  act:`discovery → <em>pitch</em>`,               by:'agent',  toast:null }),
  () => ({ ch:'ig', who:'@lida_shop',   act:`followup → ответила «да, записывайте»`,    by:'agent',  toast:'hot' }),
  () => ({ ch:'tg', who:'@artem_ceo',   act:`<em>payment 89к ₽</em> → closed_won`,      by:'agent',  toast:'payment' }),
  () => ({ ch:'ig', who:'@oksana_m',    act:`кружочек 0:${rand(10,30)}с — ответил`,     by:'agent',  toast:null }),
  () => ({ ch:'tg', who:'@vova_mark',   act:`RAG hit — вытащил кейс SMM`,               by:'analyst',toast:null }),
  () => ({ ch:'ig', who:'@dasha_coach', act:`scoring <em>${rand(30,55)}→${rand(70,85)}</em> (C→B)`, by:'analyst',toast:null }),
  () => ({ ch:'tg', who:'@igor_dev',    act:`hello · новый лид · геолокация Казань`,    by:'agent',  toast:null }),
  () => ({ ch:'ig', who:'@sveta_pr',    act:`close → won <em>120к ₽</em>`,              by:'agent',  toast:'payment' }),
];

const TOAST_TEXTS = {
  payment: ev => `💰 Оплата ${ev.act.match(/[\d]+к/)? ev.act.match(/[\d]+к/)[0] : ''} ₽ — ${ev.who}`,
  alert:   ev => `🚨 Эскалация — ${ev.who} требует менеджера`,
  hot:     ev => `🔥 Горячий лид — ${ev.who} говорит «да»`,
};

function insertFeedRow(ev) {
  const feed = document.querySelector('.feed');
  if (!feed) return;

  const firstRow = feed.querySelector('.feed-row');
  if (!firstRow) return;

  const row = document.createElement('div');
  row.className = 'feed-row';
  row.style.cssText = 'animation:fadeInFeed .4s ease;';
  row.innerHTML = `
    <span class="feed-row__time mono">${nowTs()}</span>
    <span class="feed-row__ch ch ${ev.ch === 'ig' ? 'ch--ig' : 'ch--tg'}"></span>
    <span class="feed-row__who">${ev.who}</span>
    <span class="feed-row__act">${ev.act}</span>
    <span class="feed-row__by">${ev.by}</span>
  `;
  feed.insertBefore(row, firstRow);

  // Remove oldest rows beyond 15
  const rows = feed.querySelectorAll('.feed-row');
  if (rows.length > 15) rows[rows.length - 1].remove();

  // Toast
  if (ev.toast && TOAST_TEXTS[ev.toast]) {
    showToast(TOAST_TEXTS[ev.toast](ev), ev.toast);
  }
}

// Inject keyframe if not present
if (!document.getElementById('demo-style')) {
  const s = document.createElement('style');
  s.id = 'demo-style';
  s.textContent = `
    @keyframes fadeInFeed {
      from { opacity:0; background:rgba(10,132,255,.08); }
      to   { opacity:1; background:transparent; }
    }
  `;
  document.head.appendChild(s);
}

// ─── METRIC UPDATES (pulse.html) ─────────────────────────────────────────────
let metricState = {
  leads: 47, active: 128, hot: 23, wonToday: 6, wonAmount: 4820000, autoPct: 87
};

function bumpMetrics() {
  // Small random drifts to make it feel live
  if (Math.random() > 0.5) {
    metricState.leads += rand(0, 2);
    const el = document.getElementById('m-new-leads');
    if (el) { el.textContent = metricState.leads; el.style.color = 'var(--green)'; setTimeout(()=> el.style.color='',600); }
  }
  if (Math.random() > 0.7) {
    metricState.wonToday += 1;
    const el = document.getElementById('m-won-today');
    if (el) { el.textContent = metricState.wonToday; el.style.color='var(--green)'; setTimeout(()=>el.style.color='',600); }

    const addAmt = rand(30, 120) * 1000;
    metricState.wonAmount += addAmt;
    const wa = document.getElementById('m-won-amount');
    if (wa) wa.textContent = (metricState.wonAmount / 1e6).toFixed(2);

    // Sync ROI
    if (typeof wonAmount !== 'undefined') { window.wonAmount = metricState.wonAmount; if(typeof updateROI==='function') updateROI(); }
    const roiAmt = document.getElementById('m-roi-amount');
    if (roiAmt) roiAmt.textContent = (metricState.wonAmount / 1e6).toFixed(2) + 'М ₽';
  }
}

// ─── BOOT ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
  const isPulse = document.title.includes('Pulse');
  const isConversation = document.title.includes('Conversation');

  // Toast demo — show first toast after 8s on any page
  setTimeout(() => showToast('💰 Оплата 45к ₽ — @dmitry88', 'payment'), 8000);
  setTimeout(() => showToast('🔥 Горячий лид — @_lera_ говорит «беру!»', 'hot'), 22000);
  setTimeout(() => showToast('💰 Оплата 89к ₽ — @_lera_', 'payment'), 35000);

  if (isPulse) {
    // Feed events every 7–12 seconds
    let feedIdx = 0;
    function scheduleFeed() {
      const delay = rand(7000, 12000);
      setTimeout(() => {
        const ev = FEED_EVENTS[feedIdx % FEED_EVENTS.length]();
        feedIdx++;
        insertFeedRow(ev);
        scheduleFeed();
      }, delay);
    }
    scheduleFeed();

    // Metrics bump every 25–40 seconds
    setInterval(bumpMetrics, rand(25000, 40000));
  }
});

})();
