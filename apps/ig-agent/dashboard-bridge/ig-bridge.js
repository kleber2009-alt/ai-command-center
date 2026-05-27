/*
 * ig-bridge.js — wires the static aisales dashboard prototype
 * (dashboard.46-62-215-11.nip.io/06-dashboard-prototype/*.html) to the
 * live ig-agent backend via a same-origin /ig-api/* Caddy proxy.
 *
 * Each page initializer is wrapped in try/catch; broken data must never
 * break the visual prototype. Selectors prefer existing classes
 * (.tray, .conv-feed, .ai-rec, ...) so the markup stays untouched.
 */
(function () {
  'use strict';

  const API = '/ig-api';
  const STATUS_LABELS = { new: 'новый', warm: 'тёплый', hot: 'горячий', customer: 'клиент', lost: 'потерян' };
  const STATUS_BADGE = { new: 'badge--blue', warm: 'badge--yellow', hot: 'badge--red badge--pulse', customer: 'badge--green', lost: 'badge--lost' };

  // ---------- fetch helpers --------------------------------------------

  async function api(path, opts) {
    const init = Object.assign({ credentials: 'same-origin' }, opts || {});
    if (init.body && typeof init.body !== 'string') {
      init.body = JSON.stringify(init.body);
      init.headers = Object.assign({ 'content-type': 'application/json' }, init.headers || {});
    }
    const res = await fetch(API + path, init);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error('HTTP ' + res.status + (text ? ': ' + text.slice(0, 200) : ''));
    }
    return res.json();
  }

  // ---------- DOM helpers ----------------------------------------------

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function el(tag, attrs, ...kids) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'style' && typeof attrs[k] === 'object') Object.assign(node.style, attrs[k]);
        else if (k.startsWith('on') && typeof attrs[k] === 'function') node.addEventListener(k.slice(2), attrs[k]);
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (attrs[k] != null) node.setAttribute(k, attrs[k]);
      }
    }
    for (const kid of kids) {
      if (kid == null || kid === false) continue;
      if (typeof kid === 'string') node.appendChild(document.createTextNode(kid));
      else node.appendChild(kid);
    }
    return node;
  }

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function relativeTime(iso) {
    if (!iso) return '';
    const t = typeof iso === 'number' ? iso : Date.parse(iso);
    if (!Number.isFinite(t)) return '';
    const diffSec = Math.max(0, Math.floor((Date.now() - t) / 1000));
    if (diffSec < 60) return diffSec + ' сек';
    if (diffSec < 3600) return Math.floor(diffSec / 60) + ' мин';
    if (diffSec < 86400) return Math.floor(diffSec / 3600) + ' ч';
    if (diffSec < 86400 * 7) return Math.floor(diffSec / 86400) + ' д';
    const d = new Date(t);
    return d.getDate() + '.' + String(d.getMonth() + 1).padStart(2, '0');
  }

  function formatTimeShort(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function formatDay(iso) {
    if (!iso) return '';
    const M = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.getDate() + ' ' + M[d.getMonth()] + ' · ' + formatTimeShort(iso);
  }

  function initials(name) {
    if (!name) return '··';
    const parts = String(name).trim().split(/\s+/).slice(0, 2);
    return parts.map((p) => p.charAt(0).toUpperCase()).join('') || '··';
  }

  function avatarTone(seed) {
    const palette = ['av-g1', 'av-g2', 'av-g3', 'av-g4', 'av-g5', 'av-g6', 'av-g7'];
    let h = 0;
    for (let i = 0; i < String(seed || '').length; i++) h = (h * 31 + String(seed).charCodeAt(i)) | 0;
    return palette[Math.abs(h) % palette.length];
  }

  function toast(text, level) {
    let host = $('#ig-toast-host');
    if (!host) {
      host = el('div', { id: 'ig-toast-host', style: { position: 'fixed', right: '20px', bottom: '20px', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '8px', pointerEvents: 'none' } });
      document.body.appendChild(host);
    }
    const t = el('div', {
      style: {
        background: level === 'err' ? '#3a1424' : '#142a3a',
        color: level === 'err' ? '#f06090' : '#9fd368',
        border: '1px solid ' + (level === 'err' ? 'rgba(240,96,144,.4)' : 'rgba(159,211,104,.4)'),
        padding: '10px 14px',
        borderRadius: '8px',
        fontFamily: "'SF Mono','JetBrains Mono','Menlo',monospace",
        fontSize: '12px',
        maxWidth: '360px',
        pointerEvents: 'auto',
      },
    }, text);
    host.appendChild(t);
    setTimeout(() => t.remove(), 4000);
  }

  function ensureStyles() {
    if ($('#ig-bridge-style')) return;
    const css = `
      .ig-loading{display:flex;align-items:center;gap:8px;color:var(--text-muted);font-family:var(--font-mono);font-size:11px;padding:14px 16px}
      .ig-loading::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--green);animation:ig-pulse 1.4s infinite}
      @keyframes ig-pulse{0%,100%{opacity:.3}50%{opacity:1}}
      .ig-err{color:var(--red);font-family:var(--font-mono);font-size:11px;padding:14px 16px}
      .thread{cursor:pointer}
      .thread.is-active{outline:1px solid var(--green-edge);background:rgba(159,211,104,.04)}
    `;
    document.head.appendChild(el('style', { id: 'ig-bridge-style' }, css));
  }

  // ---------- page detection -------------------------------------------

  function detectPage() {
    const p = location.pathname.replace(/\/$/, '');
    const last = p.split('/').pop() || '';
    if (last === '' || last === 'index.html') return 'pulse'; // dashboard root redirects to pulse
    const name = last.replace(/\.html$/, '');
    return name;
  }

  // ---------- INBOX ----------------------------------------------------

  async function initInbox() {
    const tray = $('.tray');
    if (!tray) return;
    ensureStyles();
    const trayHead = $('.tray__h', tray);
    // wipe sample threads + footer, keep header
    Array.from(tray.children).forEach((c) => { if (c !== trayHead) c.remove(); });
    const list = el('div', { class: 'ig-thread-list' });
    tray.appendChild(list);
    list.appendChild(el('div', { class: 'ig-loading' }, 'Загружаю диалоги…'));

    let currentFilter = 'all';
    const filterChips = $$('.page-h .chips .chip');
    const filterMap = ['all', 'new', 'hot']; // matches three default chips: Все / Непрочитанные / Hot
    filterChips.forEach((chip, i) => {
      chip.addEventListener('click', () => {
        filterChips.forEach((c) => c.classList.remove('chip--on'));
        chip.classList.add('chip--on');
        currentFilter = filterMap[i] || 'all';
        load();
      });
    });

    const titleEl = $('.page-h__title');
    const subEl = $('.page-h__subtitle');
    const countEl = $('.tray__count', tray);

    async function load() {
      try {
        const status = currentFilter === 'all' ? '' : currentFilter;
        const qs = status ? '?status=' + encodeURIComponent(status) + '&limit=200' : '?limit=200';
        const data = await api('/contacts' + qs);
        const contacts = data.contacts || [];
        list.innerHTML = '';
        if (titleEl) titleEl.textContent = 'Inbox · ' + contacts.length + ' диалогов';
        if (countEl) countEl.textContent = contacts.length;
        if (!contacts.length) {
          list.appendChild(el('div', { class: 'ig-loading', style: { color: 'var(--text-mute)' } }, 'Нет диалогов под фильтр'));
          return;
        }
        for (const c of contacts) {
          list.appendChild(renderThreadCard(c));
        }
        // also load stats for subtitle
        try {
          const s = await api('/stats');
          const ai = (s.contacts && s.contacts.by_status) ? (s.contacts.by_status.warm + s.contacts.by_status.new) : 0;
          const hot = (s.contacts && s.contacts.by_status) ? s.contacts.by_status.hot : 0;
          const customer = (s.contacts && s.contacts.by_status) ? s.contacts.by_status.customer : 0;
          if (subEl) subEl.textContent = 'AI ведёт ' + ai + ' · нужен ты — ' + hot + ' · клиентов — ' + customer;
        } catch (_) { /* ignore */ }
      } catch (e) {
        list.innerHTML = '';
        list.appendChild(el('div', { class: 'ig-err' }, 'Ошибка загрузки: ' + e.message));
      }
    }

    function renderThreadCard(c) {
      const status = c.lead_status || 'new';
      const aiHandled = c.ai_handled !== false; // default true; conversations API holds the real flag
      const username = c.ig_username ? '@' + c.ig_username : (c.sendpulse_contact_id ? 'id:' + c.sendpulse_contact_id.slice(0, 8) : '');
      const fullName = [c.first_name, c.last_name].filter(Boolean).join(' ');
      const name = fullName || (c.ig_username ? '@' + c.ig_username : '') || 'Контакт';
      const last = '—'; // listing endpoint doesn't include message preview; skip
      const time = relativeTime(c.last_message_at || c.updated_at || c.created_at);
      const badgeCls = STATUS_BADGE[status] || '';
      const card = el('div', {
        class: 'thread' + (status === 'hot' ? ' is-hot needs-h is-unread' : '') + (status === 'new' ? ' is-unread' : ''),
        onclick: () => { location.href = 'conversation.html?id=' + encodeURIComponent(c.id); },
      });
      card.innerHTML =
        '<span class="av ' + avatarTone(c.id || name) + '">' + escapeHtml(initials(name)) + '</span>' +
        '<div class="thread__body">' +
          '<div class="thread__top">' +
            '<div class="thread__name">' + escapeHtml(name) +
              (status === 'hot' ? ' <span class="badge ' + badgeCls + '"><span class="dot"></span>hot</span>' : '') +
            '</div>' +
            '<span class="thread__time">' + escapeHtml(time) + '</span>' +
          '</div>' +
          '<div class="thread__sub">' + escapeHtml(username) + ' · IG · ' + escapeHtml(STATUS_LABELS[status] || status) + '</div>' +
          '<div class="thread__msg">' + escapeHtml(String(last).slice(0, 140)) + '</div>' +
          '<div class="thread__meta">' +
            '<span class="badge ' + (badgeCls || 'badge--ghost') + '">' + escapeHtml(STATUS_LABELS[status] || status) + '</span>' +
            '<span class="badge ' + (aiHandled ? 'badge--green' : 'badge--yellow') + '">' +
              (aiHandled ? '<span class="dot"></span>AI ведёт' : '✋ ручной') +
            '</span>' +
          '</div>' +
        '</div>';
      return card;
    }

    // Header "Pause AI" → toggle global auto_reply_enabled
    const pauseBtn = Array.from($$('.page-h .btn')).find((b) => /pause ai/i.test(b.textContent || ''));
    if (pauseBtn) {
      pauseBtn.addEventListener('click', async () => {
        try {
          const cur = await api('/settings');
          const on = String(cur.settings && cur.settings.auto_reply_enabled || 'true') === 'true';
          await api('/settings', { method: 'POST', body: { auto_reply_enabled: !on } });
          toast('Авто-ответ: ' + (!on ? 'включён' : 'выключен'));
        } catch (e) {
          toast('Ошибка: ' + e.message, 'err');
        }
      });
    }

    load();
  }

  // ---------- CONVERSATION --------------------------------------------

  async function initConversation() {
    ensureStyles();
    const params = new URLSearchParams(location.search);
    let contactId = params.get('id');

    // If no id in URL, pick the most-recent contact and redirect.
    if (!contactId) {
      try {
        const list = await api('/contacts?limit=1');
        if (list.contacts && list.contacts.length) {
          contactId = list.contacts[0].id;
          history.replaceState(null, '', 'conversation.html?id=' + encodeURIComponent(contactId));
        }
      } catch (_) { /* ignore */ }
    }
    if (!contactId) {
      toast('Нет контактов в базе', 'err');
      return;
    }

    let contact = null;
    let conversation = null;
    let messages = [];
    let recommendations = [];

    async function reload() {
      try {
        const [c, m, r] = await Promise.all([
          api('/contacts/' + contactId),
          api('/contacts/' + contactId + '/messages?limit=200'),
          api('/contacts/' + contactId + '/recommendations'),
        ]);
        contact = c.contact;
        const convs = c.conversations || [];
        conversation = convs.find((cv) => cv.status === 'active') || convs[0] || null;
        messages = m.messages || [];
        recommendations = r.recommendations || [];
        renderHeader();
        renderSidebar();
        renderFeed();
        renderAnalysis();
      } catch (e) {
        toast('Ошибка загрузки диалога: ' + e.message, 'err');
      }
    }

    function renderHeader() {
      const fullName = [contact.first_name, contact.last_name].filter(Boolean).join(' ');
      const username = contact.ig_username ? '@' + contact.ig_username : 'id:' + (contact.sendpulse_contact_id || '').slice(0, 8);
      const name = fullName || (contact.ig_username ? '@' + contact.ig_username : '') || 'Контакт';
      const status = contact.lead_status || 'new';
      const head = $('.cl-head');
      if (head) {
        const av = $('.av', head);
        if (av) {
          av.textContent = initials(name);
          av.className = 'av av--xl ' + avatarTone(contact.id);
        }
        const labels = $$('.t-lg, .t-sm', head);
        if (labels[0]) labels[0].textContent = name;
        if (labels[1]) labels[1].textContent = username + ' · IG';
        const badges = $('.row.gap-2', head);
        if (badges) {
          badges.innerHTML = '<span class="badge ' + (STATUS_BADGE[status] || 'badge--ghost') + '">' +
            escapeHtml(STATUS_LABELS[status] || status) + '</span>' +
            '<span class="badge ' + ((conversation && conversation.ai_handled === false) ? 'badge--yellow' : 'badge--green') + '">' +
            ((conversation && conversation.ai_handled === false) ? '✋ ручной' : '<span class="dot"></span>AI ведёт') + '</span>';
        }
      }
      const convHead = $('.conv-head');
      if (convHead) {
        const center = $('.row.gap-3', convHead);
        if (center) {
          center.innerHTML =
            '<a href="inbox.html" class="t-sm muted">← Inbox</a>' +
            '<span class="muted">/</span>' +
            '<span class="t-md c-blue">' + escapeHtml(username) + '</span>' +
            '<span class="badge ' + (STATUS_BADGE[status] || 'badge--ghost') + '">' + escapeHtml(STATUS_LABELS[status] || status) + '</span>';
        }
        // Pause AI / takeover toggle
        const pauseBtn = Array.from($$('.btn', convHead)).find((b) => /pause ai/i.test(b.textContent || ''));
        if (pauseBtn) {
          const aiHandled = !(conversation && conversation.ai_handled === false);
          pauseBtn.textContent = aiHandled ? '⏸ Pause AI' : '▶ Resume AI';
          pauseBtn.onclick = async () => {
            try {
              const next = !aiHandled;
              await api('/contacts/' + contactId + '/takeover', { method: 'POST', body: { ai_handled: next } });
              if (conversation) conversation.ai_handled = next;
              toast('AI ' + (next ? 'возобновлён' : 'на паузе'));
              renderHeader();
            } catch (e) { toast('Ошибка: ' + e.message, 'err'); }
          };
        }
      }
    }

    function renderSidebar() {
      const pane = $('.cl-pane');
      if (!pane) return;
      // Find each section by `.section-h` text and rewrite the following `.cl-field`s.
      function fieldsAfter(label, fields) {
        const heads = $$('.section-h', pane);
        const head = heads.find((h) => h.textContent.trim().toLowerCase().startsWith(label.toLowerCase()));
        if (!head) return;
        // Remove subsequent .cl-field siblings up to the next .section-h or end.
        let node = head.parentElement;
        // The section-h sits *inside* a wrapper div above .cl-field's, so re-find by parent.
        // We'll just remove all .cl-field in same parent and append new ones.
        const parent = head.parentElement;
        if (!parent) return;
        $$('.cl-field', parent).forEach((f) => f.remove());
        for (const [k, v] of fields) {
          parent.appendChild(el('div', { class: 'cl-field', html: '<span>' + escapeHtml(k) + '</span><span>' + v + '</span>' }));
        }
      }

      fieldsAfter('Контакт', [
        ['Канал', '<span class="badge badge--ig">IG</span>'],
        ['Username', '<span class="mono c-blue">' + escapeHtml(contact.ig_username ? '@' + contact.ig_username : '—') + '</span>'],
        ['SendPulse ID', '<span class="mono">' + escapeHtml((contact.sendpulse_contact_id || '').slice(0, 14)) + '</span>'],
        ['Квалификация', '<span class="badge badge--purple">' + escapeHtml(contact.qualification || '—') + '</span>'],
        ['Статус', '<span class="badge ' + (STATUS_BADGE[contact.lead_status || 'new'] || 'badge--ghost') + '">' + escapeHtml(STATUS_LABELS[contact.lead_status || 'new']) + '</span>'],
      ]);

      fieldsAfter('Активность', [
        ['Первый контакт', '<span class="mono">' + escapeHtml(formatDay(contact.first_seen_at || contact.created_at)) + '</span>'],
        ['Последнее', '<span class="mono">' + escapeHtml(formatDay(contact.last_message_at || contact.updated_at)) + '</span>'],
        ['Сообщений', '<span class="mono">' + (messages.length || 0) + '</span>'],
        ['Рекомендаций', '<span class="mono c-blue">' + (recommendations.length || 0) + '</span>'],
      ]);

      // Update AI summary block (the <p class="t-sm"> right after section-h "AI-сводка")
      const heads = $$('.section-h', pane);
      const aiHead = heads.find((h) => /сводка/i.test(h.textContent));
      if (aiHead) {
        const parent = aiHead.parentElement;
        const p = parent && parent.querySelector('p');
        // Prefer the highest-priority "action" recommendation as the summary.
        const action = recommendations.find((r) => r.type === 'action');
        const fallback = recommendations[0];
        if (p) {
          if (action) p.textContent = action.content;
          else if (fallback) p.textContent = fallback.content;
          else {
            const lastInc = [...messages].reverse().find((m) => m.direction === 'incoming' && m.text);
            p.textContent = lastInc ? lastInc.text : 'Аналитики пока нет. Нажми «🤖 Анализ» чтобы получить рекомендацию.';
          }
        }
      }

      // Lost button — bottom action
      const lostBtn = Array.from($$('.btn', pane)).find((b) => /lost/i.test(b.textContent || ''));
      if (lostBtn) {
        lostBtn.onclick = async () => {
          if (!confirm('Перевести в Lost?')) return;
          try {
            await api('/contacts/' + contactId + '/status', { method: 'POST', body: { lead_status: 'lost' } });
            toast('Статус: lost');
            reload();
          } catch (e) { toast('Ошибка: ' + e.message, 'err'); }
        };
      }
    }

    function renderFeed() {
      const feed = $('.conv-feed');
      if (!feed) return;
      feed.innerHTML = '';
      if (!messages.length) {
        feed.appendChild(el('div', { class: 'ig-loading' }, 'Сообщений пока нет'));
        return;
      }
      let lastDay = '';
      for (const m of messages) {
        const d = new Date(m.created_at || Date.now());
        const dayKey = d.toDateString();
        if (dayKey !== lastDay) {
          lastDay = dayKey;
          feed.appendChild(el('div', { class: 'conv-msg-day' }, formatDay(m.created_at)));
        }
        const out = m.direction === 'outgoing';
        const cls = out ? (m.source === 'manual' ? 'msg msg--ai' : 'msg msg--ai') : 'msg msg--in';
        const tag = out ? (m.source === 'manual' ? 'Ручной' : (m.intent || 'AI')) : '';
        const time = formatTimeShort(m.created_at);
        const node = el('div', { class: cls });
        node.innerHTML = escapeHtml(m.text || '').replace(/\n/g, '<br>') +
          '<span class="msg__time">' + (tag ? '🤖 ' + escapeHtml(tag) + ' · ' : '') + escapeHtml(time) + '</span>';
        feed.appendChild(node);
      }
      // pin-to-bottom
      feed.scrollTop = feed.scrollHeight;
    }

    function renderAnalysis() {
      const aiRec = $('.ai-rec');
      const rec = recommendations[0];
      if (aiRec) {
        const textEl = $('.ai-rec__text', aiRec);
        const headEl = $('.ai-rec__h', aiRec);
        if (textEl) {
          if (rec && rec.recommendation) textEl.textContent = rec.recommendation;
          else if (rec && rec.summary) textEl.textContent = rec.summary;
          else textEl.textContent = 'Рекомендаций пока нет — нажми «🤖 Анализ» ниже.';
        }
        if (headEl && rec) {
          const badge = $('.badge', headEl);
          if (badge) badge.textContent = 'AI · ' + (rec.model || 'analyst');
        }
        // Wire CTA buttons
        const insertBtn = $('[data-action="insert"]', aiRec);
        const sendBtn = $('[data-action="send"]', aiRec);
        const rewriteBtn = $('[data-action="rewrite"]', aiRec);
        const softerBtn = $('[data-action="softer"]', aiRec);
        const harderBtn = $('[data-action="harder"]', aiRec);
        const ta = $('.conv-input textarea');
        if (insertBtn && ta) insertBtn.onclick = () => { ta.value = (rec && rec.recommendation) || ''; ta.focus(); };
        if (sendBtn) sendBtn.onclick = async () => {
          const text = (rec && rec.recommendation) || (ta && ta.value) || '';
          if (!text.trim()) return toast('Пустой ответ', 'err');
          await sendReply(text);
        };
        if (rewriteBtn) rewriteBtn.onclick = analyzeNow;
        if (softerBtn) softerBtn.onclick = analyzeNow;
        if (harderBtn) harderBtn.onclick = analyzeNow;
      }

      // Timeline panel
      const timelinePanel = $('[data-panel="timeline"]');
      if (timelinePanel) {
        const tlList = $('.tl-list', timelinePanel);
        if (tlList) {
          tlList.innerHTML = '';
          for (const m of messages.slice(-15)) {
            const tone = m.direction === 'incoming' ? 'c-blue' : (m.source === 'manual' ? 'c-yellow' : 'c-green');
            const stage = m.intent ? '<span class="stage">' + escapeHtml(m.intent) + '</span>' : '';
            const text = (m.text || '').slice(0, 80);
            tlList.appendChild(el('div', { class: 'tl-item', html:
              '<span class="tl-t ' + tone + '">' + escapeHtml(formatDay(m.created_at).replace(' · ', '<br>')) + '</span>' +
              '<span class="tl-ev">' + escapeHtml(text) + ' ' + stage + '</span>',
            }));
          }
        }
      }

      // Status quick-picker — re-purpose existing "Перенести встречу" button row
      const moveBtn = $$('.btn').find((b) => /перенести/i.test(b.textContent || ''));
      if (moveBtn) {
        moveBtn.textContent = '🤖 Анализ';
        moveBtn.onclick = analyzeNow;
      }
    }

    async function analyzeNow() {
      toast('Запускаю анализ…');
      try {
        const r = await api('/contacts/' + contactId + '/analyze', { method: 'POST', body: {} });
        if (r && r.result) toast('Анализ готов');
        await reload();
      } catch (e) {
        toast('Анализ не удался: ' + e.message, 'err');
      }
    }

    async function sendReply(text) {
      try {
        await api('/contacts/' + contactId + '/reply', { method: 'POST', body: { text } });
        toast('Отправлено');
        const ta = $('.conv-input textarea');
        if (ta) ta.value = '';
        await reload();
      } catch (e) {
        toast('Не отправилось: ' + e.message, 'err');
      }
    }

    // Wire main send button + hint chips
    const sendMainBtn = Array.from($$('.conv-input .btn')).find((b) => /отправить/i.test(b.textContent || ''));
    if (sendMainBtn) {
      sendMainBtn.addEventListener('click', () => {
        const ta = $('.conv-input textarea');
        if (ta && ta.value.trim()) sendReply(ta.value.trim());
      });
    }
    const ta = $('.conv-input textarea');
    if (ta) {
      ta.value = '';
      ta.placeholder = 'Напиши ответ или нажми «AI: ответить»…';
      ta.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          if (ta.value.trim()) sendReply(ta.value.trim());
        }
      });
    }
    const hintChips = $$('.conv-input__hints .chip');
    if (hintChips[0]) hintChips[0].onclick = analyzeNow; // "AI: ответить"
    if (hintChips[3]) hintChips[3].onclick = async () => {
      try {
        await api('/contacts/' + contactId + '/takeover', { method: 'POST', body: { ai_handled: true } });
        toast('AI возобновлён');
        reload();
      } catch (e) { toast('Ошибка: ' + e.message, 'err'); }
    };

    await reload();
  }

  // ---------- PULSE ----------------------------------------------------

  async function initPulse() {
    ensureStyles();
    try {
      const s = await api('/stats');
      const by = (s.contacts && s.contacts.by_status) || {};
      const total = (s.contacts && s.contacts.total) || 0;
      const msgs = (s.messages && (s.messages.total || s.messages.last_7d || s.messages.count)) || 0;
      const recs = (s.recommendations && s.recommendations.total) || 0;
      const mapping = {
        'новые лиды': by.new || 0,
        'в работе': (by.warm || 0) + (by.new || 0),
        'горячих': by.hot || 0,
        'оплат сегодня': by.customer || 0,
        'клиентов': by.customer || 0,
        'lost': by.lost || 0,
        'диалогов': total,
        'сообщений': msgs,
        'рекомендаций': recs,
      };
      const cards = $$('.card');
      for (const card of cards) {
        const title = $('.card__title', card);
        const num = $('.card__num', card);
        if (!title || !num) continue;
        const key = (title.textContent || '').trim().toLowerCase().replace(/\s+/g, ' ');
        for (const k in mapping) {
          if (key.startsWith(k)) {
            num.textContent = mapping[k];
            break;
          }
        }
      }
      // Replace the chip "Сегодня/7д/30д/90д" with a static label since we have all-time data only.
      const exportBtn = $$('.btn').find((b) => /экспорт/i.test(b.textContent || ''));
      if (exportBtn) {
        exportBtn.onclick = () => {
          const blob = new Blob([JSON.stringify(s, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = el('a', { href: url, download: 'ig-agent-stats.json' });
          document.body.appendChild(a); a.click(); a.remove();
          URL.revokeObjectURL(url);
        };
      }
    } catch (e) {
      toast('Pulse: ' + e.message, 'err');
    }
  }

  // ---------- SETTINGS -------------------------------------------------

  async function initSettings() {
    ensureStyles();
    try {
      const s = await api('/settings');
      const autoOn = String((s.settings && s.settings.auto_reply_enabled) || 'true') === 'true';
      // Find the "Instagram Direct" row → bind its toggle.
      const ints = $$('.int');
      const igRow = ints.find((r) => /instagram/i.test(($('.int__name', r) || {}).textContent || ''));
      if (igRow) {
        const tgl = $('.toggle', igRow);
        if (tgl) {
          tgl.classList.toggle('is-on', autoOn);
          tgl.style.cursor = 'pointer';
          tgl.onclick = async () => {
            try {
              const next = !tgl.classList.contains('is-on');
              await api('/settings', { method: 'POST', body: { auto_reply_enabled: next } });
              tgl.classList.toggle('is-on', next);
              toast('Авто-ответ Instagram: ' + (next ? 'вкл' : 'выкл'));
            } catch (e) { toast('Ошибка: ' + e.message, 'err'); }
          };
        }
        const badge = $('.badge', igRow);
        if (badge) {
          badge.textContent = autoOn ? 'live' : 'paused';
          badge.className = 'badge ' + (autoOn ? 'badge--green' : 'badge--yellow');
        }
        const sub = $('.int__sub', igRow);
        if (sub) {
          try {
            const stats = await api('/stats');
            const total = (stats.contacts && stats.contacts.total) || 0;
            sub.innerHTML = '<b>SendPulse webhook</b> · ' + total + ' лидов в&nbsp;базе';
          } catch (_) {}
        }
      }
      // Prompt-versions panel (if present)
      const prHead = $$('.section-h, .setting-h').find((h) => /prompt|шаблон|агент/i.test(h.textContent || ''));
      if (prHead) {
        // could expand to list prompts; for now skip — done in agents page
      }
    } catch (e) {
      toast('Settings: ' + e.message, 'err');
    }
  }

  // ---------- AGENTS ---------------------------------------------------

  async function initAgents() {
    ensureStyles();
    const grid = $('.agents-grid');
    if (!grid) return;
    try {
      const data = await api('/prompts');
      const prompts = data.prompts || [];
      const stats = await api('/stats').catch(() => null);
      grid.innerHTML = '';
      if (!prompts.length) {
        grid.appendChild(el('div', { class: 'ig-loading' }, 'Промптов в базе нет.'));
        return;
      }
      for (const p of prompts) {
        const card = el('div', { class: 'ag' });
        const isActive = !!p.active;
        card.innerHTML =
          '<div class="ag__top">' +
            '<div class="ag__icon" style="background:var(--blue-bg);color:#7BC0FF">🤖</div>' +
            '<div style="flex:1">' +
              '<div class="ag__title">' + escapeHtml(p.name || p.kind || ('Prompt v' + p.version)) +
                (isActive ? ' <span class="badge badge--green" style="margin-left:4px">active</span>' : '') +
              '</div>' +
              '<div class="ag__sub">v' + escapeHtml(String(p.version || '?')) + ' · ' + escapeHtml(p.kind || 'responder') + '</div>' +
            '</div>' +
            '<div class="ag-toggle' + (isActive ? ' is-on' : '') + '"></div>' +
          '</div>' +
          '<div class="ag__metrics">' +
            '<div class="ag__metric"><div class="ag__metric-lab">Версия</div><div class="ag__metric-val">' + escapeHtml(String(p.version || '?')) + '</div></div>' +
            '<div class="ag__metric"><div class="ag__metric-lab">Тип</div><div class="ag__metric-val">' + escapeHtml(p.kind || '—') + '</div></div>' +
            '<div class="ag__metric"><div class="ag__metric-lab">Создан</div><div class="ag__metric-val">' + escapeHtml(formatDay(p.created_at).split(' · ')[0] || '—') + '</div></div>' +
            '<div class="ag__metric"><div class="ag__metric-lab">Статус</div><div class="ag__metric-val ' + (isActive ? 'c-green' : 'muted') + '">' + (isActive ? 'active' : 'idle') + '</div></div>' +
          '</div>' +
          '<div class="ag__cta">' +
            '<button class="btn btn--' + (isActive ? 'secondary' : 'primary') + '" data-activate>' + (isActive ? '✓ Активен' : '▶ Активировать') + '</button>' +
            '<button class="btn btn--ghost" data-view>📜 Просмотр</button>' +
          '</div>';
        const activateBtn = $('[data-activate]', card);
        if (activateBtn && !isActive) {
          activateBtn.onclick = async () => {
            try {
              await api('/prompts/' + p.id + '/activate', { method: 'POST', body: {} });
              toast('Активирован: ' + (p.name || 'prompt v' + p.version));
              initAgents();
            } catch (e) { toast('Ошибка: ' + e.message, 'err'); }
          };
        }
        const viewBtn = $('[data-view]', card);
        if (viewBtn) {
          viewBtn.onclick = () => {
            alert((p.system_prompt || p.body || p.text || '— тело промпта недоступно —').slice(0, 4000));
          };
        }
        grid.appendChild(card);
      }
      // Replace top-of-page model summary if there's a slot
      if (stats && stats.models) {
        const subt = $('.page-h__subtitle');
        if (subt) {
          subt.textContent = 'Responder: ' + stats.models.responder + ' · Classifier: ' + stats.models.classifier + ' · Analyst: ' + stats.models.analyst;
        }
      }
    } catch (e) {
      grid.innerHTML = '';
      grid.appendChild(el('div', { class: 'ig-err' }, 'Не удалось загрузить агентов: ' + e.message));
    }
  }

  // ---------- PIPELINE -------------------------------------------------

  async function initPipeline() {
    ensureStyles();
    try {
      const data = await api('/contacts?limit=500');
      const contacts = data.contacts || [];
      // Update channel chips with counts
      const chips = $$('.chips .chip');
      const total = contacts.length;
      const ig = contacts.length; // all are IG for now
      const allChip = chips.find((c) => /^все/i.test(c.textContent || ''));
      if (allChip) {
        const cnt = $('.chip__count', allChip); if (cnt) cnt.textContent = total;
      }
      // Replace pipeline table body if present
      const rows = $$('table tbody tr');
      if (rows.length) {
        const tbody = rows[0].parentElement;
        tbody.innerHTML = '';
        for (const c of contacts.slice(0, 50)) {
          const status = c.lead_status || 'new';
          const name = c.full_name || c.first_name || (c.username ? '@' + c.username : 'Контакт');
          const tr = document.createElement('tr');
          tr.innerHTML =
            '<td>' + escapeHtml(name) + '</td>' +
            '<td>' + escapeHtml(c.username ? '@' + c.username : '—') + '</td>' +
            '<td><span class="badge ' + (STATUS_BADGE[status] || 'badge--ghost') + '">' + escapeHtml(STATUS_LABELS[status] || status) + '</span></td>' +
            '<td>' + escapeHtml(relativeTime(c.last_message_at || c.updated_at || c.created_at)) + '</td>' +
            '<td><div class="row-actions"><a href="conversation.html?id=' + encodeURIComponent(c.id) + '" class="btn btn--secondary">Открыть</a></div></td>';
          tbody.appendChild(tr);
        }
      }
    } catch (e) {
      toast('Pipeline: ' + e.message, 'err');
    }
  }

  // ---------- REPORTS --------------------------------------------------

  async function initReports() {
    ensureStyles();
    try {
      const s = await api('/stats');
      const by = (s.contacts && s.contacts.by_status) || {};
      const msgs = (s.messages && (s.messages.total || s.messages.last_7d || s.messages.count)) || 0;
      // mini KPI tiles at the bottom typically have .t-xl.fw6.mono
      const tiles = $$('.t-xl.fw6.mono');
      const vals = [s.contacts.total, by.customer || 0, (by.customer && s.contacts.total ? ((by.customer / s.contacts.total) * 100).toFixed(1) + '%' : '0%'), msgs];
      tiles.forEach((t, i) => { if (vals[i] != null) t.textContent = vals[i]; });
    } catch (e) {
      toast('Reports: ' + e.message, 'err');
    }
  }

  // ---------- boot ------------------------------------------------------

  const page = detectPage();
  document.addEventListener('DOMContentLoaded', () => {
    try {
      if (page === 'inbox') initInbox();
      else if (page === 'conversation') initConversation();
      else if (page === 'pulse') initPulse();
      else if (page === 'settings') initSettings();
      else if (page === 'agents') initAgents();
      else if (page === 'pipeline') initPipeline();
      else if (page === 'reports') initReports();
    } catch (e) {
      console.error('[ig-bridge]', e);
    }
  });
})();
