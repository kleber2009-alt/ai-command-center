// Hono server hosting:
//   - POST /webhook/sendpulse        — unauthenticated, gated by shared token
//   - GET  /healthz                  — liveness
//   - GET  /login, /logout           — magic-link flow
//   - GET  /                         — inbox.html (default landing)
//   - GET  /<page>                   — every prototype page (pipeline, conversation, ...)
//   - GET  /api/...                  — JSON data endpoints (auth required)
//
// Static UI files live under dist/admin/ui/ (or src/admin/ui/ in dev).
// Auth uses the same magic-link scheme as tg-agent so muscle memory carries.

import { dirname, join, resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Hono } from 'hono';
import { serve } from '@hono/node-server';

import {
  buildClearCookie,
  buildSessionCookie,
  COOKIE_NAME,
  createThrottle,
  createTokenSigner,
  safeEqual,
  type TokenSigner,
} from './auth.js';
import type { Config } from '../config.js';
import type { Logger } from '../logger.js';
import { query, type DbPool } from '../db/index.js';
import type { ContactService, LeadStatus } from '../db/contacts.js';
import type { ConversationService } from '../db/conversations.js';
import type { MessageStore } from '../db/messages.js';
import type { RecommendationStore } from '../db/recommendations.js';
import type { PromptStore } from '../db/prompts.js';
import type { SettingsService } from '../db/settings.js';
import type { DigestStore } from '../db/digests.js';
import type { Notifier } from '../notifier.js';
import type { Pipeline } from '../pipeline.js';
import type { Analyst } from '../analyst.js';
import type { SendPulseClient } from '../sendpulse/client.js';
import type { DigestSchedulerHandle } from '../scheduler.js';
import type { HealthMonitor } from '../health.js';
import { parseWebhookBody } from '../webhook.js';

const here = dirname(fileURLToPath(import.meta.url));
// Try both layouts: compiled (dist/admin/ui) and dev (src/admin/ui).
const UI_DIRS = [resolve(here, 'ui'), resolve(here, '..', '..', 'src', 'admin', 'ui')];

// Slugs the SPA exposes — each maps to <slug>.html. Adding `/` falls back
// to inbox.html so the landing route works.
const PAGES = [
  'inbox',
  'conversation',
  'pipeline',
  'pulse',
  'agents',
  'reports',
  'daily',
  'kb',
  'settings',
] as const;

// Shared CSS module — design tokens + primitives reused across every admin
// page. Lifted from the conversation prototype's visual language and made
// the single source of truth so all pages stay coherent.
const IG_ADMIN_CSS = `
/* === DESIGN TOKENS ======================================================= */
:root{
  --bg-main:#0a0a0a; --bg-surface:#101010; --bg-card:#161616; --bg-card-2:#1f1f1f;
  --border-soft:#262626; --border-mid:#333;
  --text-main:#f5f0e8; --text-mid:#c8c4ba; --text-muted:#8a8378; --text-mute:#665f55;
  --green:#9fd368; --yellow:#f0c060; --red:#f06090; --blue:#60a8f0; --purple:#a88af0;
  --green-edge:rgba(159,211,104,.35); --yellow-edge:rgba(240,192,96,.35);
  --red-edge:rgba(240,96,144,.35); --blue-edge:rgba(96,168,240,.35);
  --r-sm:6px; --r-md:10px; --r-lg:14px;
  --font-mono:'SF Mono','JetBrains Mono','Menlo',monospace;
}
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
html,body{background:var(--bg-main);color:var(--text-main);min-height:100vh}
body{font-family:Georgia,'Times New Roman',serif;font-size:14px;line-height:1.5;overflow-x:hidden}
a{color:inherit;text-decoration:none}
button{font:inherit;color:inherit;background:none;border:0;cursor:pointer}
::-webkit-scrollbar{width:8px;height:8px}
::-webkit-scrollbar-thumb{background:#2a2a2a;border-radius:4px}
::-webkit-scrollbar-thumb:hover{background:#3a3a3a}
::-webkit-scrollbar-track{background:transparent}

/* === TYPOGRAPHY ========================================================== */
.mono{font-family:var(--font-mono)}
.muted{color:var(--text-muted)}
.t-sm{font-size:12.5px}.t-md{font-size:14px}.t-lg{font-size:17px}.t-xl{font-size:22px}
.fw6{font-weight:600}.fw7{font-weight:700}
.c-green{color:var(--green)}.c-yellow{color:var(--yellow)}.c-red{color:var(--red)}.c-blue{color:var(--blue)}.c-purple{color:var(--purple)}
.section-h{font-family:var(--font-mono);font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--text-muted);font-weight:700;margin-bottom:8px}

/* === LAYOUT HELPERS ====================================================== */
.row{display:flex;align-items:center}
.col{display:flex;flex-direction:column}
.gap-2{gap:8px}.gap-3{gap:12px}.gap-4{gap:16px}
.mt-2{margin-top:8px}.mt-3{margin-top:12px}.mt-4{margin-top:16px}
.mb-2{margin-bottom:8px}.mb-3{margin-bottom:12px}
.row--between{display:flex;justify-content:space-between;align-items:center;gap:12px}

/* === BAR (topbar) ======================================================== */
.bar{
  position:sticky;top:0;z-index:50;display:flex;align-items:center;gap:18px;
  padding:10px 18px;background:var(--bg-main);border-bottom:1px solid var(--border-soft);
}
.bar__brand{display:flex;align-items:baseline;gap:6px;font-family:Georgia,serif;font-size:16px;white-space:nowrap}
.bar__brand-mark{font-family:var(--font-mono);font-size:10px;color:#080808;background:var(--green);padding:2px 5px;border-radius:3px;letter-spacing:.06em}
.bar__brand span:last-child{color:var(--green);font-style:italic}
.bar__right{margin-left:auto;display:flex;align-items:center;gap:12px}
.bar__clock{font-family:var(--font-mono);font-size:11px;color:var(--text-muted);letter-spacing:.08em}

/* === SHELL containers ==================================================== */
.shell{max-width:1480px;margin:0 auto;padding:24px;display:flex;flex-direction:column;gap:20px}
.shell--narrow{max-width:980px}

/* === SECTION HEADER ====================================================== */
.sec-head{display:flex;align-items:baseline;gap:14px;padding:8px 2px 6px}
.sec-num{font-family:var(--font-mono);font-size:10px;color:var(--green);letter-spacing:.18em;font-weight:700}
.sec-title{font-family:Georgia,serif;font-size:14px;font-style:italic;color:var(--text-muted)}
.sec-spacer{flex:1;border-bottom:1px solid var(--border-soft);transform:translateY(-2px)}

/* === CARDS ============================================================== */
.card{padding:16px 18px;border-radius:var(--r-md);background:var(--bg-card);border:1px solid var(--border-soft);display:flex;flex-direction:column;gap:8px}
.card--surface{background:var(--bg-surface)}
.card--alert{background:linear-gradient(180deg,rgba(240,192,96,.06),var(--bg-card));border-color:var(--yellow-edge)}
.card--rec{background:linear-gradient(180deg,rgba(96,168,240,.05),var(--bg-card));border-color:var(--blue-edge)}
.panel{background:var(--bg-card);border:1px solid var(--border-soft);padding:22px 26px;border-radius:var(--r-md)}

/* === BADGES ============================================================= */
.badge{
  display:inline-flex;align-items:center;gap:5px;font-family:var(--font-mono);font-size:9.5px;letter-spacing:.1em;
  text-transform:uppercase;font-weight:700;padding:3px 7px;border-radius:4px;border:1px solid var(--border-mid);color:var(--text-mid);
  white-space:nowrap;
}
.badge--green,.badge--customer{color:var(--blue);border-color:var(--blue-edge);background:rgba(96,168,240,.06)}
.badge--yellow,.badge--warm{color:var(--yellow);border-color:var(--yellow-edge);background:rgba(240,192,96,.06)}
.badge--red,.badge--hot{color:var(--red);border-color:var(--red-edge);background:rgba(240,96,144,.06)}
.badge--blue{color:var(--blue);border-color:var(--blue-edge);background:rgba(96,168,240,.06)}
.badge--purple{color:var(--purple);border-color:rgba(168,138,240,.35);background:rgba(168,138,240,.06)}
.badge--lime{color:var(--green);border-color:var(--green-edge);background:rgba(159,211,104,.06)}
.badge--new,.badge--ghost{color:var(--text-muted);border-color:var(--border-soft)}
.badge--lost{color:#666;border-color:#333}
.badge--pulse .dot,.badge--pulse{animation:pulse 1.8s infinite}
.badge--ok{color:var(--green);border-color:var(--green-edge);background:rgba(159,211,104,.06)}
.badge--warn{color:var(--yellow);border-color:var(--yellow-edge);background:rgba(240,192,96,.08)}
.badge--err{color:var(--red);border-color:var(--red-edge);background:rgba(240,96,144,.06)}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.55}}

/* === BUTTONS ============================================================ */
.btn{
  display:inline-flex;align-items:center;justify-content:center;gap:6px;
  height:34px;padding:0 14px;border-radius:6px;font-size:12.5px;font-weight:600;
  border:1px solid var(--border-mid);background:var(--bg-card);color:var(--text-main);transition:all .12s ease;font-family:inherit;
}
.btn:hover{border-color:var(--green-edge);color:var(--green)}
.btn--primary{background:var(--green);color:#080808;border-color:var(--green)}
.btn--primary:hover{background:#b3df87;border-color:#b3df87;color:#080808}
.btn--secondary{background:var(--bg-card);color:var(--text-main)}
.btn--ghost{background:transparent;border-color:var(--border-soft);color:var(--text-mid)}
.btn--ghost:hover{color:var(--text-main);border-color:var(--border-mid)}
.btn--icon{width:34px;padding:0}
.btn--block{width:100%}
.btn--sm{height:28px;padding:0 10px;font-size:11.5px}
.btn:disabled{opacity:.55;cursor:not-allowed}

/* === CHIPS (filters) ===================================================== */
.chip{
  display:inline-flex;align-items:center;justify-content:space-between;gap:8px;
  font-family:var(--font-mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;
  padding:8px 12px;border-radius:var(--r-sm);border:1px solid var(--border-soft);background:var(--bg-card);
  color:var(--text-mid);cursor:pointer;transition:all .12s ease;
}
.chip:hover{color:var(--text-main);border-color:var(--border-mid)}
.chip.is-on{background:rgba(159,211,104,.08);color:var(--green);border-color:var(--green-edge)}
.chip .n{font-size:11px;color:var(--text-mute);font-weight:600}
.chip.is-on .n{color:var(--green)}
.chip--block{width:100%}
.chip--warm.is-on{background:rgba(240,192,96,.08);color:var(--yellow);border-color:var(--yellow-edge)}
.chip--warm.is-on .n{color:var(--yellow)}
.chip--hot.is-on{background:rgba(240,96,144,.08);color:var(--red);border-color:var(--red-edge)}
.chip--hot.is-on .n{color:var(--red)}
.chip--customer.is-on{background:rgba(96,168,240,.08);color:var(--blue);border-color:var(--blue-edge)}
.chip--customer.is-on .n{color:var(--blue)}

/* === SEARCH INPUT ======================================================== */
.search-input,.input{
  width:100%;background:var(--bg-card);border:1px solid var(--border-soft);color:var(--text-main);
  padding:10px 12px;font-family:var(--font-mono);font-size:12px;border-radius:var(--r-sm);
}
.search-input:focus,.input:focus{outline:none;border-color:var(--blue-edge)}
.search-input::placeholder,.input::placeholder{color:var(--text-mute)}

/* === AVATARS ============================================================ */
.av{
  display:inline-flex;align-items:center;justify-content:center;background:var(--bg-card-2);color:var(--text-main);
  font-family:var(--font-mono);font-weight:700;border-radius:50%;
}
.av--sm{width:32px;height:32px;font-size:12px}
.av--md{width:44px;height:44px;font-size:15px}
.av--xl{width:64px;height:64px;font-size:22px}
.av-g4{background:linear-gradient(135deg,#5a4b8e,#3a6f9e);color:#fff}
.av-warm{background:linear-gradient(135deg,#7a5a2e,#a8843e);color:#fff}
.av-hot{background:linear-gradient(135deg,#7a2e5a,#a83e7a);color:#fff}
.av-customer{background:linear-gradient(135deg,#2e5a7a,#3e7aa8);color:#fff}
.av-lost{background:#2a2a2a;color:#666}

/* === MESSAGE BUBBLES ===================================================== */
.msg{
  max-width:72%;padding:10px 14px;border-radius:12px;font-size:14px;line-height:1.55;
  color:var(--text-main);background:var(--bg-card);border:1px solid var(--border-soft);
}
.msg__t{display:block;font-family:var(--font-mono);font-size:10px;color:var(--text-muted);letter-spacing:.06em;margin-top:6px}
.msg--in{align-self:flex-start}
.msg--ai{align-self:flex-end;background:rgba(96,168,240,.07);border-color:var(--blue-edge)}
.msg--manual{align-self:flex-end;background:rgba(240,192,96,.07);border-color:var(--yellow-edge)}

/* === KEY-VALUE row (cl-field) ============================================ */
.cl-field{display:flex;justify-content:space-between;font-size:12.5px;padding:5px 0;gap:12px}
.cl-field span:first-child{color:var(--text-muted)}
.cl-field span:last-child{color:var(--text-main);text-align:right;word-break:break-word}

/* === STATS TILE (for dashboards) ======================================== */
.tile{background:var(--bg-card);border:1px solid var(--border-soft);padding:16px 18px;display:flex;flex-direction:column;gap:6px;border-radius:var(--r-md);min-height:120px}
.tile .num{font-family:var(--font-mono);font-size:10px;color:#3a3a3a;letter-spacing:.18em;font-weight:700}
.tile .lbl{font-family:var(--font-mono);font-size:10px;color:var(--text-mid);letter-spacing:.14em;font-weight:700;text-transform:uppercase;line-height:1.3}
.tile .val{font-family:Georgia,serif;font-size:36px;line-height:1;letter-spacing:-.02em;margin-top:auto;color:var(--text-main)}
.tile .val.lime{color:var(--green)}.tile .val.cyan{color:var(--blue)}.tile .val.pink{color:var(--red)}.tile .val.yellow{color:var(--yellow)}
.tile .sub{font-family:var(--font-mono);font-size:11px;color:var(--text-muted)}
.tile-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
@media (max-width:900px){.tile-grid{grid-template-columns:repeat(2,1fr)}}

/* === STATUS STAT (for pulse breakdown) =================================== */
.stat{background:var(--bg-card);border:1px solid var(--border-soft);padding:16px;display:flex;flex-direction:column;gap:6px;border-radius:var(--r-md);cursor:pointer;transition:border-color .12s ease}
.stat:hover{border-color:var(--border-mid)}
.stat .v{font-family:Georgia,serif;font-size:28px;line-height:1}
.stat .l{font-family:var(--font-mono);font-size:10px;letter-spacing:.14em;text-transform:uppercase;font-weight:700}
.stat-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}
@media (max-width:700px){.stat-grid{grid-template-columns:repeat(2,1fr)}}

/* === LOGIN AUX (only used by login.html) ================================ */
.auth-shell{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
.auth-card{
  background:var(--bg-card);border:1px solid var(--border-soft);border-radius:var(--r-lg);
  padding:36px;max-width:440px;width:100%;display:flex;flex-direction:column;gap:18px;
}
.auth-card h2{font-family:Georgia,serif;font-size:24px;font-weight:normal}
.auth-card h2 .accent{color:var(--green);font-style:italic}
.auth-card .sub{color:var(--text-muted);font-size:13.5px;line-height:1.55}
.auth-card .foot{font-family:var(--font-mono);font-size:11px;color:var(--text-muted);line-height:1.6;border-top:1px solid var(--border-soft);padding-top:16px}
.auth-card code{color:var(--green);font-family:var(--font-mono);font-size:10.5px;word-break:break-all;display:block;margin-top:6px}
.status-strip{font-family:var(--font-mono);font-size:11px;color:var(--text-muted);min-height:18px;padding:6px 0;text-align:center}
`;

// Shared browser-side client. Inlined as a string so we don't need a
// bundler and so it can be served via /assets/ig-admin.js.
const IG_ADMIN_JS = `
// Tiny helper module loaded by every admin page.
window.IG = (function () {
  async function api(path, init) {
    const res = await fetch(path, Object.assign({ credentials: 'same-origin', headers: { 'content-type': 'application/json' } }, init || {}));
    if (res.status === 401) { location.href = '/'; throw new Error('unauthorized'); }
    if (!res.ok) {
      let body = ''; try { body = await res.text(); } catch (_) {}
      throw new Error('HTTP ' + res.status + ' ' + path + ' ' + body.slice(0, 200));
    }
    const ct = res.headers.get('content-type') || '';
    if (ct.indexOf('application/json') >= 0) return res.json();
    return res.text();
  }
  function fmtTime(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var hh = String(d.getHours()).padStart(2, '0');
    var mm = String(d.getMinutes()).padStart(2, '0');
    return hh + ':' + mm;
  }
  function fmtDay(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var M = ['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек'];
    return d.getDate() + ' ' + M[d.getMonth()];
  }
  function nameOf(c) {
    if (!c) return '—';
    if (c.ig_username) return '@' + c.ig_username;
    var fn = (c.first_name || '') + ' ' + (c.last_name || '');
    fn = fn.trim();
    if (fn) return fn;
    return (c.sendpulse_contact_id || '').slice(0, 10);
  }
  function statusBadge(s) {
    var map = { new: '#b8b3a8', warm: '#f0c060', hot: '#f06090', customer: '#60c8f0', lost: '#666' };
    var lbl = { new: 'NEW', warm: 'WARM', hot: 'HOT', customer: 'CUSTOMER', lost: 'LOST' };
    var color = map[s] || '#b8b3a8';
    return '<span style="font-family:monospace;font-size:10px;letter-spacing:.1em;color:' + color + ';border:1px solid ' + color + ';padding:2px 6px;border-radius:3px">' + (lbl[s] || s || 'NEW') + '</span>';
  }
  function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }
  function getParam(name) {
    return new URLSearchParams(location.search).get(name);
  }

  // Mounts a unified primary navigation into a container. Used by every
  // page so cross-navigation works the same everywhere. The first call
  // also injects the .ig-nav stylesheet.
  var navStylesInjected = false;
  function injectNavStyles() {
    if (navStylesInjected) return;
    navStylesInjected = true;
    var s = document.createElement('style');
    s.textContent = '' +
      '.ig-nav{display:flex;gap:2px;flex-wrap:wrap;align-items:center}' +
      '.ig-nav__link{font-family:"SF Mono",monospace;font-size:10px;letter-spacing:.14em;' +
      'text-transform:uppercase;font-weight:700;padding:6px 10px;color:#b8b3a8;background:transparent;' +
      'border:1px solid #2a2a2a;border-radius:4px;text-decoration:none;transition:all .12s ease}' +
      '.ig-nav__link:hover{color:#f5f0e8;border-color:#c8f060}' +
      '.ig-nav__link.is-active{background:#c8f060;color:#080808;border-color:#c8f060}';
    document.head.appendChild(s);
  }
  function mountNav(container, current) {
    if (!container) return;
    injectNavStyles();
    var items = [
      { slug: 'inbox',     label: 'Inbox',     href: '/' },
      { slug: 'pipeline',  label: 'Pipeline',  href: '/pipeline' },
      { slug: 'pulse',     label: 'Pulse',     href: '/pulse' },
      { slug: 'agents',    label: 'Agents',    href: '/agents' },
      { slug: 'daily',     label: 'Сводки 24ч', href: '/daily' },
      { slug: 'reports',   label: 'Reports',   href: '/reports' },
      { slug: 'kb',        label: 'KB',        href: '/kb' },
      { slug: 'settings',  label: 'Settings',  href: '/settings' },
    ];
    container.classList.add('ig-nav');
    container.innerHTML = items.map(function (it) {
      var active = it.slug === current ? ' is-active' : '';
      return '<a class="ig-nav__link' + active + '" href="' + it.href + '">' + it.label + '</a>';
    }).join('');
  }

  // Mounts the global auto-reply toggle button into a container.
  // The button reflects /api/settings.auto_reply_enabled and flips it on
  // click. Other pages just call IG.mountAutoReplyToggle(containerEl).
  function mountAutoReplyToggle(container) {
    if (!container) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'btnAutoReplyToggle';
    btn.style.cssText =
      'display:inline-flex;align-items:center;gap:6px;font-family:monospace;font-size:10px;' +
      'letter-spacing:.1em;padding:5px 10px;border-radius:4px;cursor:pointer;font-weight:700;' +
      'background:transparent;color:#8a8378;border:1px solid #262626;';
    btn.textContent = '… autoreply';
    container.appendChild(btn);

    var current = null;
    function render() {
      if (current === null) {
        btn.textContent = '…';
        return;
      }
      if (current) {
        btn.textContent = '🟢 AUTO-REPLY: ON';
        btn.style.color = '#9fd368';
        btn.style.borderColor = 'rgba(159,211,104,.35)';
        btn.style.background = 'rgba(159,211,104,.06)';
        btn.title = 'AI отвечает автоматически. Клик чтобы выключить — останется только анализ.';
      } else {
        btn.textContent = '⏸ AUTO-REPLY: OFF';
        btn.style.color = '#FFC56F';
        btn.style.borderColor = 'rgba(240,192,96,.4)';
        btn.style.background = 'rgba(240,192,96,.08)';
        btn.title = 'Агент только анализирует диалоги. AI-ответы не уходят. Клик чтобы включить.';
      }
    }

    async function load() {
      try {
        var data = await api('/api/settings');
        var s = (data && data.settings) || {};
        current = s.auto_reply_enabled === 'true' || s.auto_reply_enabled === undefined;
        render();
      } catch (e) {
        btn.textContent = '⚠ ' + (e.message || 'err');
      }
    }

    btn.addEventListener('click', async function () {
      if (current === null) return;
      var next = !current;
      btn.disabled = true;
      try {
        await api('/api/settings', {
          method: 'POST',
          body: JSON.stringify({ auto_reply_enabled: next }),
        });
        current = next;
        render();
      } catch (e) {
        alert(e.message);
      } finally {
        btn.disabled = false;
      }
    });

    load();
  }

  return {
    api: api, fmtTime: fmtTime, fmtDay: fmtDay, nameOf: nameOf,
    statusBadge: statusBadge, escapeHtml: escapeHtml, getParam: getParam,
    mountAutoReplyToggle: mountAutoReplyToggle,
    mountNav: mountNav,
  };
})();
`;

export interface AdminDeps {
  config: Config;
  logger: Logger;
  pool: DbPool;
  contacts: ContactService;
  conversations: ConversationService;
  messages: MessageStore;
  recommendations: RecommendationStore;
  prompts: PromptStore;
  settings: SettingsService;
  pipeline: Pipeline;
  analyst: Analyst;
  sendPulse: SendPulseClient;
  notifier: Notifier;
  digests: DigestStore;
  digestScheduler: DigestSchedulerHandle;
  health: HealthMonitor;
}

export interface AdminHandle {
  close(): Promise<void>;
}

function readUiFile(name: string): string | null {
  for (const dir of UI_DIRS) {
    const candidate = join(dir, name);
    if (existsSync(candidate)) return readFileSync(candidate, 'utf8');
  }
  return null;
}

function parseCookies(header: string | null | undefined): Record<string, string> {
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const [k, ...vs] = part.trim().split('=');
    if (!k) continue;
    out[k] = decodeURIComponent(vs.join('='));
  }
  return out;
}

function isSecureRequest(url: string, xForwardedProto: string | null): boolean {
  if (xForwardedProto?.toLowerCase() === 'https') return true;
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

export function startAdminServer(deps: AdminDeps): AdminHandle {
  const { config, logger } = deps;
  const app = new Hono();

  const signer: TokenSigner | null = config.adminSessionSecret
    ? createTokenSigner(config.adminSessionSecret)
    : null;
  const magicThrottle = createThrottle();

  const basicAuthEnabled = !!config.adminUsername && !!config.adminPassword;
  if (!signer && !basicAuthEnabled) {
    logger.warn('admin auth disabled — set ADMIN_SESSION_SECRET or ADMIN_PASSWORD');
  }

  // ---- Public routes ---------------------------------------------------

  app.get('/healthz', (c) => c.json({ ok: true }));

  // Static asset shims. The prototype HTML references /assets/sidebar.js
  // and (in conversation.html) os.css — both are no-ops here. We also
  // ship our own /assets/ig-admin.js with the small shared client helper
  // each page uses.
  app.get('/assets/sidebar.js', (c) => c.body('/* sidebar shim */', 200, {
    'content-type': 'application/javascript; charset=utf-8',
  }));
  app.get('/os.css', (c) => c.body('/* os.css shim */', 200, {
    'content-type': 'text/css; charset=utf-8',
  }));
  app.get('/assets/ig-admin.js', (c) => c.body(IG_ADMIN_JS, 200, {
    'content-type': 'application/javascript; charset=utf-8',
  }));
  app.get('/assets/ig-admin.css', (c) => c.body(IG_ADMIN_CSS, 200, {
    'content-type': 'text/css; charset=utf-8',
  }));

  app.post('/webhook/sendpulse', async (c) => {
    const token = c.req.query('token');
    if (!token || !safeEqual(token, config.sendPulseWebhookToken)) {
      return c.json({ ok: false, error: 'invalid token' }, 401);
    }
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      body = null;
    }
    const parsed = parseWebhookBody(body);
    logger.info('webhook received', {
      events: Array.isArray(body) ? body.length : 1,
      messages: parsed.messages.length,
      ignored: parsed.ignored,
    });

    // Process events sequentially — Instagram DM rate is low and ordered
    // delivery matters for conversation flow. If volume grows, batch this
    // through a queue.
    for (const event of parsed.messages) {
      try {
        await deps.pipeline.handle(event);
        deps.health.recordSuccess();
      } catch (err) {
        logger.error('pipeline handle failed', {
          err: err instanceof Error ? err.message : String(err),
          sendpulseContactId: event.sendpulseContactId,
        });
        deps.health.recordFailure(err);
      }
    }

    // Always 200 — SendPulse retries 5xx, but we never want to replay an
    // already-persisted message.
    return c.json({ ok: true, processed: parsed.messages.length });
  });

  // ---- Magic link ------------------------------------------------------

  app.post('/api/request-link', async (c) => {
    if (!signer) return c.json({ ok: false, error: 'magic link disabled' }, 503);
    if (!magicThrottle.take()) {
      return c.json({ ok: false, error: 'throttled' }, 429);
    }
    const { token } = signer.issueMagic();
    const base = config.adminPublicUrl ?? new URL(c.req.url).origin;
    const url = `${base}/login?token=${encodeURIComponent(token)}`;
    await deps.notifier.send(`🔐 ig-agent admin link (10 min):\n\n${url}`, {
      silent: false,
    });
    logger.info('magic link issued');
    return c.json({ ok: true });
  });

  app.get('/login', (c) => {
    const token = c.req.query('token');
    if (!signer || !signer.verifyMagic(token)) {
      return c.html('<h1>Invalid or expired link</h1>', 401);
    }
    const session = signer.issueSession();
    const secure = isSecureRequest(c.req.url, c.req.header('x-forwarded-proto') ?? null);
    c.header('Set-Cookie', buildSessionCookie(session.token, secure));
    return c.redirect('/');
  });

  app.post('/logout', (c) => {
    const secure = isSecureRequest(c.req.url, c.req.header('x-forwarded-proto') ?? null);
    c.header('Set-Cookie', buildClearCookie(secure));
    return c.json({ ok: true });
  });

  // ---- Auth middleware (applies to / and /api/*) ----------------------

  app.use('*', async (c, next) => {
    const path = new URL(c.req.url).pathname;
    // Public paths.
    if (
      path === '/healthz' ||
      path === '/login' ||
      path === '/webhook/sendpulse' ||
      path === '/api/request-link' ||
      path === '/os.css' ||
      path.startsWith('/assets/') ||
      path.startsWith('/static/')
    ) {
      return next();
    }

    // Internal proxy bypass. The aisales dashboard origin reverse-proxies
    // /ig-api/* here with an X-Internal-Auth header set by Caddy. The
    // header can't be forged by a browser (Caddy strips client-supplied
    // copies via header_up), and the secret never leaves the Hetzner box.
    if (config.internalApiToken) {
      const hdr = c.req.header('x-internal-auth') ?? '';
      if (hdr && safeEqual(hdr, config.internalApiToken)) return next();
    }

    // Session cookie path.
    if (signer) {
      const cookies = parseCookies(c.req.header('cookie'));
      if (signer.verifySession(cookies[COOKIE_NAME])) return next();
    }

    // Basic auth fallback.
    if (basicAuthEnabled) {
      const header = c.req.header('authorization') ?? '';
      if (header.startsWith('Basic ')) {
        const [user, pass] = Buffer.from(header.slice(6), 'base64')
          .toString('utf8')
          .split(':');
        if (
          user &&
          pass &&
          safeEqual(user, config.adminUsername!) &&
          safeEqual(pass, config.adminPassword!)
        ) {
          return next();
        }
      }
      c.header('WWW-Authenticate', 'Basic realm="ig-agent"');
      return c.text('Unauthorized', 401);
    }

    // No auth configured → render a self-serve "request link" page so the
    // owner can trigger the bot DM without ever typing credentials.
    if (path === '/' || PAGES.some((p) => path === `/${p}`)) {
      const login = readUiFile('login.html');
      if (login) return c.html(login, 401);
    }
    return c.text('Unauthorized', 401);
  });

  // ---- Static UI -------------------------------------------------------

  app.get('/', (c) => {
    const html = readUiFile('inbox.html');
    if (!html) return c.text('inbox.html missing', 500);
    return c.html(html);
  });

  for (const page of PAGES) {
    app.get(`/${page}`, (c) => {
      const html = readUiFile(`${page}.html`);
      if (!html) return c.text(`${page}.html missing`, 500);
      return c.html(html);
    });
  }

  // ---- JSON API --------------------------------------------------------

  function asLeadStatus(raw: string | undefined): LeadStatus | undefined {
    if (!raw) return undefined;
    if (
      raw === 'new' ||
      raw === 'warm' ||
      raw === 'hot' ||
      raw === 'customer' ||
      raw === 'lost'
    ) {
      return raw;
    }
    return undefined;
  }

  app.get('/api/contacts', async (c) => {
    const status = asLeadStatus(c.req.query('status'));
    const limitRaw = c.req.query('limit');
    const limit = limitRaw ? Math.min(Math.max(Number(limitRaw), 1), 500) : 100;
    const rows = await deps.contacts.list({ status, limit });
    return c.json({ contacts: rows });
  });

  app.get('/api/contacts/:id', async (c) => {
    const id = c.req.param('id');
    const contact = await deps.contacts.byId(id);
    if (!contact) return c.json({ error: 'not found' }, 404);
    const conv = await deps.conversations.byContact(id);
    return c.json({ contact, conversations: conv });
  });

  app.get('/api/contacts/:id/messages', async (c) => {
    const id = c.req.param('id');
    const limit = Math.min(Math.max(Number(c.req.query('limit') ?? 200), 1), 1000);
    const rows = await deps.messages.listForContact(id, limit);
    return c.json({ messages: rows });
  });

  app.get('/api/contacts/:id/recommendations', async (c) => {
    const id = c.req.param('id');
    const rows = await deps.recommendations.forContact(id, 50);
    return c.json({ recommendations: rows });
  });

  app.post('/api/contacts/:id/status', async (c) => {
    const id = c.req.param('id');
    const body = (await c.req.json().catch(() => ({}))) as { lead_status?: unknown };
    const v = body.lead_status;
    if (
      v !== 'new' && v !== 'warm' && v !== 'hot' && v !== 'customer' && v !== 'lost'
    ) {
      return c.json({ error: 'lead_status must be one of new|warm|hot|customer|lost' }, 400);
    }
    const contact = await deps.contacts.byId(id);
    if (!contact) return c.json({ error: 'not found' }, 404);
    await deps.contacts.setLeadStatus(id, v);
    return c.json({ ok: true, lead_status: v });
  });

  app.post('/api/contacts/:id/takeover', async (c) => {
    const id = c.req.param('id');
    let body: { ai_handled?: boolean } = {};
    try {
      body = (await c.req.json()) as typeof body;
    } catch {
      body = {};
    }
    const aiHandled = body.ai_handled === true;
    await deps.conversations.setAiHandled(id, aiHandled);
    return c.json({ ok: true, ai_handled: aiHandled });
  });

  app.post('/api/contacts/:id/reply', async (c) => {
    const id = c.req.param('id');
    const body = (await c.req.json().catch(() => ({}))) as { text?: string };
    const text = body.text?.trim();
    if (!text) return c.json({ error: 'text required' }, 400);
    const contact = await deps.contacts.byId(id);
    if (!contact) return c.json({ error: 'not found' }, 404);
    let sendpulseMessageId: string | null = null;
    try {
      const r = await deps.sendPulse.sendText(contact.sendpulse_contact_id, text);
      sendpulseMessageId = r.sendpulseMessageId;
    } catch (err) {
      logger.error('manual reply send failed', {
        err: err instanceof Error ? err.message : String(err),
      });
      return c.json({ error: 'send failed' }, 502);
    }
    const msg = await deps.messages.insert({
      contactId: id,
      direction: 'outgoing',
      source: 'manual',
      text,
      sendpulseMessageId,
    });
    return c.json({ ok: true, message: msg });
  });

  app.post('/api/contacts/:id/analyze', async (c) => {
    const id = c.req.param('id');
    const contact = await deps.contacts.byId(id);
    if (!contact) return c.json({ error: 'not found' }, 404);
    const conversations = await deps.conversations.byContact(id);
    const active = conversations.find((cv) => cv.status === 'active') ?? null;
    const history = await deps.messages.recentForContact(id, 10);
    // Use the most recent incoming message as the "trigger" the analyst
    // is reasoning about. If there are no incoming messages, refuse —
    // analyzing an empty context wastes tokens.
    const lastIncoming = [...history].reverse().find((m) => m.direction === 'incoming' && m.text);
    if (!lastIncoming) {
      return c.json({ error: 'no incoming message to analyze' }, 400);
    }
    try {
      const result = await deps.analyst.analyze({
        contact,
        conversation: active,
        history,
        incomingMessageId: lastIncoming.id,
        incomingText: lastIncoming.text ?? '',
      });
      return c.json({ ok: true, result });
    } catch (err) {
      logger.error('manual analyze failed', {
        err: err instanceof Error ? err.message : String(err),
      });
      return c.json({ error: 'analyze failed' }, 502);
    }
  });

  // Aggregate dashboard counters. One round-trip for all pulse / reports
  // / agents tiles — cheaper than 6 separate calls from the SPA.
  app.get('/api/stats', async (c) => {
    const [contacts, messageStats, recCount, prompts, settings] = await Promise.all([
      deps.contacts.list({ limit: 1000 }),
      deps.messages.stats(),
      deps.recommendations.count(),
      deps.prompts.list(),
      deps.settings.all(),
    ]);
    const byStatus: Record<string, number> = { new: 0, warm: 0, hot: 0, customer: 0, lost: 0 };
    for (const ct of contacts) {
      const k = ct.lead_status || 'new';
      byStatus[k] = (byStatus[k] ?? 0) + 1;
    }
    return c.json({
      contacts: { total: contacts.length, by_status: byStatus },
      messages: messageStats,
      recommendations: { total: recCount },
      prompts: {
        total: prompts.length,
        active: prompts.find((p) => p.active)?.version ?? null,
      },
      settings,
      models: {
        responder: config.responderModel,
        analyst: config.analystModel,
        classifier: config.classifierModel,
      },
    });
  });

  // ---- Journey (kanban) -----------------------------------------------
  //
  // Classifies every contact into one of 7 funnel stages from real signals:
  //   - last incoming intent (set by the analyst)
  //   - presence of any outgoing reply (= AI/operator engaged)
  //   - lead_status (customer/lost = terminal stages)
  //   - recency (silent threads → follow-up)
  //
  // One SQL per call (LATERAL joins keep it cheap). The classification
  // mirrors the prototype's 7 columns: Hello / Discovery / Pitch /
  // Objections / Close / Follow-up / Won-Lost.
  app.get('/api/journey', async (c) => {
    const limit = Math.min(Math.max(Number(c.req.query('limit') ?? 800), 1), 2000);
    const rows = await query<{
      id: string;
      ig_username: string | null;
      first_name: string | null;
      last_name: string | null;
      lead_status: string | null;
      qualification: string | null;
      first_seen_at: string;
      last_message_at: string | null;
      last_intent: string | null;
      last_sentiment: string | null;
      last_incoming_text: string | null;
      last_incoming_at: string | null;
      has_outgoing: boolean;
      last_outgoing_at: string | null;
      msg_count: number;
    }>(
      deps.pool,
      `SELECT c.id, c.ig_username, c.first_name, c.last_name,
              c.lead_status, c.qualification, c.first_seen_at, c.last_message_at,
              li.intent     AS last_intent,
              li.sentiment  AS last_sentiment,
              li.text       AS last_incoming_text,
              li.created_at AS last_incoming_at,
              EXISTS (
                SELECT 1 FROM messages mo
                WHERE mo.contact_id = c.id AND mo.direction = 'outgoing'
              ) AS has_outgoing,
              (SELECT MAX(created_at) FROM messages mo
                 WHERE mo.contact_id = c.id AND mo.direction = 'outgoing') AS last_outgoing_at,
              (SELECT COUNT(*)::int FROM messages mm WHERE mm.contact_id = c.id) AS msg_count
         FROM contacts c
         LEFT JOIN LATERAL (
           SELECT m.intent, m.sentiment, m.text, m.created_at
             FROM messages m
            WHERE m.contact_id = c.id
              AND m.direction = 'incoming'
              AND m.text IS NOT NULL
            ORDER BY m.created_at DESC
            LIMIT 1
         ) li ON true
         WHERE EXISTS (SELECT 1 FROM messages mx WHERE mx.contact_id = c.id)
         ORDER BY c.last_message_at DESC NULLS LAST
         LIMIT $1`,
      [limit],
    );

    // Stage classification rules — applied in order; first match wins.
    // Intent vocabulary comes from the analyst's actual outputs (verified
    // against `SELECT DISTINCT intent FROM messages`):
    const GREETING_INTENTS = new Set([
      'subscription_check', 'new_subscriber', 'new_follower', 'new_subscription',
      'subscription', 'subscription_confirmed', 'greeting', 'keyword_trigger',
    ]);
    const QUESTION_INTENTS = new Set([
      'question_format', 'question_product', 'question_price', 'question_service',
      'product_inquiry', 'lead_magnet_request', 'tool_recommendation',
      'profile_request', 'support_request',
    ]);
    const OBJECTION_INTENTS = new Set(['off_topic', 'reel_share', 'shared_reel', 'content_share', 'media_shared']);
    const NOW = Date.now();
    const STALE_MS = 24 * 60 * 60 * 1000;

    function classify(r: typeof rows[number]): string {
      if (r.lead_status === 'customer') return 'won_lost';
      if (r.lead_status === 'lost') return 'won_lost';
      if (r.last_intent === 'ready_to_buy') return 'close';
      if (r.lead_status === 'hot') return 'objections';
      if (r.last_intent && OBJECTION_INTENTS.has(r.last_intent)) return 'objections';
      if (r.last_sentiment === 'negative' && r.has_outgoing) return 'objections';
      // Stale conversations that had an outgoing reply — operator needs to revisit
      const lastTs = r.last_message_at ? Date.parse(r.last_message_at) : 0;
      if (r.has_outgoing && lastTs && NOW - lastTs > STALE_MS) return 'follow_up';
      if (r.last_intent && QUESTION_INTENTS.has(r.last_intent)) {
        return r.has_outgoing ? 'pitch' : 'discovery';
      }
      if (r.last_intent && GREETING_INTENTS.has(r.last_intent)) return 'hello';
      // Fallback bucket — incoming exists but intent unknown.
      return r.has_outgoing ? 'pitch' : 'hello';
    }

    function fmtCard(r: typeof rows[number], stage: string) {
      const fullName = [r.first_name, r.last_name].filter(Boolean).join(' ');
      const name = fullName || (r.ig_username ? '@' + r.ig_username : 'Контакт');
      return {
        id: r.id,
        name,
        ig_username: r.ig_username,
        lead_status: r.lead_status,
        qualification: r.qualification,
        preview: (r.last_incoming_text || '').slice(0, 140),
        last_intent: r.last_intent,
        last_sentiment: r.last_sentiment,
        last_message_at: r.last_message_at,
        first_seen_at: r.first_seen_at,
        msg_count: r.msg_count,
        has_outgoing: r.has_outgoing,
        stage,
        // For Won/Lost column the UI needs to know which sub-status.
        won_status:
          r.lead_status === 'customer' ? 'won' :
          r.lead_status === 'lost' ? 'lost' : null,
      };
    }

    const stages: Record<string, ReturnType<typeof fmtCard>[]> = {
      hello: [], discovery: [], pitch: [], objections: [], close: [], follow_up: [], won_lost: [],
    };
    for (const r of rows) {
      const stage = classify(r);
      stages[stage]!.push(fmtCard(r, stage));
    }
    return c.json({ stages, total: rows.length });
  });

  // Free-text search over message bodies. Matches incoming OR outgoing,
  // ranked by recency. Returns one row per matched message + the contact
  // that owns it. Used by /research and the ⌘K command palette.
  app.get('/api/search', async (c) => {
    const q = (c.req.query('q') ?? '').trim();
    if (!q || q.length < 2) return c.json({ results: [], q });
    const limit = Math.min(Math.max(Number(c.req.query('limit') ?? 50), 1), 200);
    const rows = await query<{
      message_id: string;
      contact_id: string;
      created_at: string;
      direction: string;
      text: string;
      intent: string | null;
      ig_username: string | null;
      first_name: string | null;
      last_name: string | null;
      lead_status: string | null;
    }>(
      deps.pool,
      `SELECT m.id AS message_id, m.contact_id, m.created_at, m.direction, m.text, m.intent,
              c.ig_username, c.first_name, c.last_name, c.lead_status
         FROM messages m
         JOIN contacts c ON c.id = m.contact_id
        WHERE m.text ILIKE $1
        ORDER BY m.created_at DESC
        LIMIT $2`,
      ['%' + q.replace(/[%_]/g, '\\$&') + '%', limit],
    );
    return c.json({
      q,
      results: rows.map((r) => ({
        message_id: r.message_id,
        contact_id: r.contact_id,
        created_at: r.created_at,
        direction: r.direction,
        text: r.text,
        intent: r.intent,
        ig_username: r.ig_username,
        name: [r.first_name, r.last_name].filter(Boolean).join(' ') ||
              (r.ig_username ? '@' + r.ig_username : 'Контакт'),
        lead_status: r.lead_status,
      })),
    });
  });

  // Reports aggregate — one round-trip for every chart on /reports:
  //   - funnel: counts by lead_status
  //   - intents: top intents from incoming messages
  //   - daily: last 14 days of incoming/outgoing volume
  //   - qualification: A/B/C/D segment mix
  //   - recent_wins: contacts who transitioned to customer
  app.get('/api/reports', async (c) => {
    const [funnel, intents, daily, qual] = await Promise.all([
      query<{ lead_status: string; n: string }>(
        deps.pool,
        `SELECT COALESCE(lead_status, 'new') AS lead_status, COUNT(*)::text AS n
           FROM contacts GROUP BY lead_status`,
      ),
      query<{ intent: string; n: string }>(
        deps.pool,
        `SELECT intent, COUNT(*)::text AS n FROM messages
            WHERE direction='incoming' AND intent IS NOT NULL
            GROUP BY intent ORDER BY COUNT(*) DESC LIMIT 12`,
      ),
      query<{ day: string; incoming: string; outgoing: string }>(
        deps.pool,
        `SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
                COUNT(*) FILTER (WHERE direction='incoming')::text AS incoming,
                COUNT(*) FILTER (WHERE direction='outgoing')::text AS outgoing
           FROM messages
          WHERE created_at >= NOW() - INTERVAL '14 days'
          GROUP BY 1 ORDER BY 1 ASC`,
      ),
      query<{ qualification: string | null; n: string }>(
        deps.pool,
        `SELECT qualification, COUNT(*)::text AS n FROM contacts GROUP BY qualification`,
      ),
    ]);

    const funnelObj: Record<string, number> = { new: 0, warm: 0, hot: 0, customer: 0, lost: 0 };
    for (const r of funnel) funnelObj[r.lead_status] = Number(r.n);

    const qualObj: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, unknown: 0 };
    for (const r of qual) qualObj[r.qualification ?? 'unknown'] = Number(r.n);

    return c.json({
      funnel: funnelObj,
      intents: intents.map((r) => ({ intent: r.intent, n: Number(r.n) })),
      daily: daily.map((r) => ({
        day: r.day,
        incoming: Number(r.incoming),
        outgoing: Number(r.outgoing),
      })),
      qualification: qualObj,
    });
  });

  app.get('/api/prompts', async (c) => {
    const rows = await deps.prompts.list();
    return c.json({ prompts: rows });
  });

  app.post('/api/prompts/:id/activate', async (c) => {
    const id = c.req.param('id');
    await deps.prompts.activate(id);
    return c.json({ ok: true });
  });

  // Global system settings — small k/v store. Only whitelisted keys can
  // be mutated through the UI; everything else is read-only on this API.
  const WRITABLE_SETTINGS = new Set(['auto_reply_enabled']);

  app.get('/api/settings', async (c) => {
    const all = await deps.settings.all();
    return c.json({ settings: all });
  });

  app.post('/api/settings', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const updates: Record<string, string> = {};
    for (const k of Object.keys(body)) {
      if (!WRITABLE_SETTINGS.has(k)) continue;
      const v = body[k];
      if (typeof v === 'boolean') updates[k] = v ? 'true' : 'false';
      else if (typeof v === 'string') updates[k] = v;
    }
    for (const [k, v] of Object.entries(updates)) {
      await deps.settings.set(k, v);
    }
    const all = await deps.settings.all();
    logger.info('settings updated', { keys: Object.keys(updates) });
    return c.json({ ok: true, settings: all });
  });

  // ---- Daily digests ---------------------------------------------------

  // List latest digest per contact, newest first. Default 100 cards —
  // enough for any single morning's traffic.
  app.get('/api/digests', async (c) => {
    const limit = Math.min(Math.max(Number(c.req.query('limit') ?? 100), 1), 500);
    const rows = await deps.digests.latestPerContact(limit);
    return c.json({ digests: rows });
  });

  // Full history (last N) for one contact — feeds the "history" tab
  // on the per-contact digest detail view.
  app.get('/api/digests/contact/:id', async (c) => {
    const id = c.req.param('id');
    const limit = Math.min(Math.max(Number(c.req.query('limit') ?? 30), 1), 200);
    const rows = await deps.digests.historyForContact(id, limit);
    return c.json({ digests: rows });
  });

  app.get('/api/digests/:id', async (c) => {
    const id = c.req.param('id');
    const row = await deps.digests.byId(id);
    if (!row) return c.json({ error: 'not found' }, 404);
    return c.json({ digest: row });
  });

  // Manual trigger — useful for "preview the morning briefing now" and
  // for the very first day after deploy when the cron hasn't fired yet.
  // Runs in the background so the HTTP request returns promptly even if
  // the sweep takes 30+s; client polls /api/digests for results.
  app.post('/api/digests/run-now', async (c) => {
    logger.info('digest: manual sweep requested via admin');
    void deps.digestScheduler.runOnce().catch((err) => {
      logger.error('digest: manual sweep failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    });
    return c.json({ ok: true, status: 'started' });
  });

  // ---- Boot ------------------------------------------------------------

  const server = serve({ fetch: app.fetch, port: config.adminPort, hostname: '0.0.0.0' });
  logger.info('admin server listening', { port: config.adminPort });

  return {
    async close() {
      await new Promise<void>((res) => server.close(() => res()));
    },
  };
}
