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
      // "next_message" rec is the suggested reply; "action" rec is operator guidance.
      const nextMsg = recommendations.find((r) => r.type === 'next_message');
      const action = recommendations.find((r) => r.type === 'action');
      const draft = (nextMsg && nextMsg.content) || '';
      if (aiRec) {
        const textEl = $('.ai-rec__text', aiRec);
        const headEl = $('.ai-rec__h', aiRec);
        if (textEl) {
          if (draft) textEl.textContent = draft;
          else if (action) textEl.textContent = action.content;
          else textEl.textContent = 'Рекомендаций пока нет — нажми «🤖 Анализ» ниже.';
        }
        if (headEl && (nextMsg || action)) {
          const badge = $('.badge', headEl);
          const rec = nextMsg || action;
          if (badge) badge.textContent = (rec.type === 'next_message' ? 'Draft' : 'Action') + ' · ' + (rec.priority || 'normal');
        }
        const insertBtn = $('[data-action="insert"]', aiRec);
        const sendBtn = $('[data-action="send"]', aiRec);
        const rewriteBtn = $('[data-action="rewrite"]', aiRec);
        const softerBtn = $('[data-action="softer"]', aiRec);
        const harderBtn = $('[data-action="harder"]', aiRec);
        const ta = $('.conv-input textarea');
        if (insertBtn && ta) insertBtn.onclick = () => { ta.value = draft; ta.focus(); };
        if (sendBtn) sendBtn.onclick = async () => {
          const text = draft || (ta && ta.value) || '';
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

    // Poll every 10s for new messages / status changes so an open
    // conversation tab stays live without F5. We pause polling when the
    // tab is hidden (saves API + tokens) and resume on visibility change.
    let pollTimer = null;
    let polling = false;
    async function tick() {
      if (polling || document.hidden) return;
      polling = true;
      try {
        const m = await api('/contacts/' + contactId + '/messages?limit=200');
        const next = m.messages || [];
        // Skip re-render if no change (count + last id match what we have).
        const sameCount = next.length === messages.length;
        const sameTail = sameCount && next.length && messages[messages.length - 1] &&
          next[next.length - 1].id === messages[messages.length - 1].id;
        if (!sameTail) {
          messages = next;
          renderFeed();
          // Recommendations and contact details change less often but cheap to refresh.
          const [r, c] = await Promise.all([
            api('/contacts/' + contactId + '/recommendations').catch(() => ({ recommendations: [] })),
            api('/contacts/' + contactId).catch(() => null),
          ]);
          recommendations = r.recommendations || recommendations;
          if (c && c.contact) {
            contact = c.contact;
            const convs = c.conversations || [];
            conversation = convs.find((cv) => cv.status === 'active') || convs[0] || conversation;
          }
          renderHeader();
          renderSidebar();
          renderAnalysis();
        }
      } catch (_) {
        // Silent: transient API blips are common; next tick retries.
      } finally {
        polling = false;
      }
    }
    pollTimer = setInterval(tick, 10000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) tick(); // immediate refresh on return
    });
    window.addEventListener('beforeunload', () => {
      if (pollTimer) clearInterval(pollTimer);
    });
  }

  // ---------- PULSE ----------------------------------------------------

  async function initPulse() {
    ensureStyles();
    renderPulseAlerts(); // fire-and-forget; cards independent from KPIs
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

  // Build the right-side Alerts column from real data. Strict signal:
  // only contacts whose LAST message is incoming (i.e., a real waiting
  // reply). Hot status gets priority; conversations with `ai_handled=false`
  // (operator paused AI) are flagged separately.
  async function renderPulseAlerts() {
    const alertsBox = $('.alerts');
    if (!alertsBox) return;
    alertsBox.innerHTML = '<div class="ig-loading">Сканирую горячие диалоги…</div>';
    const headerBadge = (() => {
      const heads = $$('.row--between .section-h');
      const h = heads.find((x) => /alerts/i.test(x.textContent || ''));
      return h && h.parentElement ? h.parentElement.querySelector('.badge') : null;
    })();

    try {
      // Pull the hottest 25 contacts, then check each one's latest message
      // direction. Two-tier limit keeps N+1 queries bounded.
      const { contacts: hotList = [] } = await api('/contacts?status=hot&limit=25');
      // Also pull warm with takeover potentially; for now hot-only — strongest signal.

      const checks = await Promise.all(
        hotList.slice(0, 20).map(async (c) => {
          try {
            const m = await api('/contacts/' + c.id + '/messages?limit=3');
            const list = m.messages || [];
            if (!list.length) return null;
            const last = list[list.length - 1];
            if (!last || last.direction !== 'incoming') return null;
            return { contact: c, msg: last };
          } catch {
            return null;
          }
        }),
      );
      const alerts = checks
        .filter(Boolean)
        .sort((a, b) => new Date(b.msg.created_at) - new Date(a.msg.created_at));

      if (headerBadge) {
        if (alerts.length) {
          headerBadge.classList.add('badge--red', 'badge--pulse');
          headerBadge.innerHTML = '<span class="dot"></span>' + alerts.length + ' требуют ответа';
          headerBadge.style.display = '';
        } else {
          headerBadge.innerHTML = '<span class="dot"></span>чисто';
          headerBadge.classList.remove('badge--pulse');
        }
      }

      alertsBox.innerHTML = '';
      if (!alerts.length) {
        alertsBox.appendChild(el('div', {
          class: 'card',
          style: { padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' },
        }, '✓ Нет горячих диалогов без ответа'));
      } else {
        for (const a of alerts) {
          alertsBox.appendChild(buildPulseAlertCard(a.contact, a.msg));
        }
      }

      // Re-populate the "Что сделать сейчас" card with the same priority list.
      const todoCard = $$('.card').find((c) => /сделать сейчас/i.test(c.textContent || ''));
      if (todoCard) {
        const col = todoCard.querySelector('.col');
        if (col) {
          col.innerHTML = '';
          if (!alerts.length) {
            col.appendChild(el('div', { class: 'muted t-sm' }, 'Список пуст — всё под контролем.'));
          } else {
            const palette = ['c-red', 'c-yellow', 'c-blue', 'c-purple', 'c-green'];
            alerts.slice(0, 5).forEach((a, i) => {
              const fullName = [a.contact.first_name, a.contact.last_name].filter(Boolean).join(' ');
              const display = fullName || (a.contact.ig_username ? '@' + a.contact.ig_username : 'Контакт');
              const row = el('a', {
                class: 'row gap-2',
                href: 'conversation.html?id=' + encodeURIComponent(a.contact.id),
                style: { textDecoration: 'none', color: 'inherit', padding: '4px 0' },
              });
              row.innerHTML =
                '<span class="' + palette[i] + ' mono fw6">' + (i + 1) + '</span>' +
                '<span class="t-md">Ответить <b>' + escapeHtml(display) + '</b> — «' + escapeHtml((a.msg.text || '').slice(0, 50)) + '»</span>';
              col.appendChild(row);
            });
          }
        }
      }
    } catch (e) {
      alertsBox.innerHTML = '';
      alertsBox.appendChild(el('div', { class: 'ig-err' }, 'Алерты: ' + e.message));
    }
  }

  function buildPulseAlertCard(contact, msg) {
    const fullName = [contact.first_name, contact.last_name].filter(Boolean).join(' ');
    const display = fullName || (contact.ig_username ? '@' + contact.ig_username : 'Контакт');
    const handle = contact.ig_username ? '@' + contact.ig_username : 'id:' + (contact.sendpulse_contact_id || '').slice(0, 8);
    const time = relativeTime(msg.created_at);
    const preview = (msg.text || '').slice(0, 110);
    const card = el('div', { class: 'alert alert--hot' });
    card.innerHTML =
      '<span class="alert__dot"></span>' +
      '<div style="flex:1">' +
        '<div class="alert__title">Горячий лид без ответа</div>' +
        '<div class="alert__text"><b>' + escapeHtml(display) + '</b> · ' + escapeHtml(handle) + ' · IG</div>' +
        '<div class="alert__text" style="margin-top:4px;color:var(--text-muted)">«' + escapeHtml(preview) + '»</div>' +
        '<div class="alert__time">⏱ ' + escapeHtml(time) + ' назад</div>' +
        '<div class="alert__cta">' +
          '<a href="conversation.html?id=' + encodeURIComponent(contact.id) + '" class="btn btn--primary" style="font-size:11.5px;height:26px">Ответить →</a>' +
          '<button class="btn btn--ghost" style="font-size:11.5px;height:26px" data-ai-handle>Передать AI</button>' +
        '</div>' +
      '</div>';
    const btn = $('[data-ai-handle]', card);
    if (btn) {
      btn.onclick = async () => {
        try {
          await api('/contacts/' + contact.id + '/takeover', { method: 'POST', body: { ai_handled: true } });
          toast('AI возобновлён для ' + display);
        } catch (e) { toast('Ошибка: ' + e.message, 'err'); }
      };
    }
    return card;
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
      const [{ prompts = [] }, settingsResp, stats] = await Promise.all([
        api('/prompts'),
        api('/settings').catch(() => ({ settings: {} })),
        api('/stats').catch(() => null),
      ]);
      // The "agent" toggle on each card reflects the GLOBAL auto_reply_enabled
      // flag (one IG agent → one switch). The active prompt stays selected in
      // the DB; auto_reply_enabled just gates whether responder runs at all.
      let autoOn = String((settingsResp.settings && settingsResp.settings.auto_reply_enabled) || 'false') === 'true';

      grid.innerHTML = '';
      if (!prompts.length) {
        grid.appendChild(el('div', { class: 'ig-loading' }, 'Промптов в базе нет.'));
        return;
      }
      for (const p of prompts) {
        const card = el('div', { class: 'ag' });
        const isActivePrompt = !!p.active;
        // Effective agent state: prompt is active in DB AND global toggle is on.
        const agentRunning = isActivePrompt && autoOn;
        card.innerHTML =
          '<div class="ag__top">' +
            '<div class="ag__icon" style="background:var(--blue-bg);color:#7BC0FF">🤖</div>' +
            '<div style="flex:1">' +
              '<div class="ag__title">' + escapeHtml(p.name || p.kind || ('Prompt v' + p.version)) +
                (isActivePrompt
                  ? ' <span class="badge ' + (autoOn ? 'badge--green' : 'badge--yellow') + '" style="margin-left:4px">' + (autoOn ? 'active' : 'paused') + '</span>'
                  : '') +
              '</div>' +
              '<div class="ag__sub">v' + escapeHtml(String(p.version || '?')) + ' · ' + escapeHtml(p.kind || 'responder') + '</div>' +
            '</div>' +
            '<div class="ag-toggle' + (agentRunning ? ' is-on' : '') + '" data-agent-toggle></div>' +
          '</div>' +
          '<div class="ag__metrics">' +
            '<div class="ag__metric"><div class="ag__metric-lab">Версия</div><div class="ag__metric-val">' + escapeHtml(String(p.version || '?')) + '</div></div>' +
            '<div class="ag__metric"><div class="ag__metric-lab">Тип</div><div class="ag__metric-val">' + escapeHtml(p.kind || '—') + '</div></div>' +
            '<div class="ag__metric"><div class="ag__metric-lab">Создан</div><div class="ag__metric-val">' + escapeHtml(formatDay(p.created_at).split(' · ')[0] || '—') + '</div></div>' +
            '<div class="ag__metric"><div class="ag__metric-lab">Статус</div><div class="ag__metric-val ' + (agentRunning ? 'c-green' : 'muted') + '">' + (agentRunning ? 'отвечает' : (isActivePrompt ? 'на паузе' : 'idle')) + '</div></div>' +
          '</div>' +
          '<div class="ag__cta">' +
            (isActivePrompt
              ? '<button class="btn btn--' + (autoOn ? 'secondary' : 'primary') + '" data-toggle-auto>' + (autoOn ? '⏸ Поставить на паузу' : '▶ Включить') + '</button>'
              : '<button class="btn btn--primary" data-activate>▶ Сделать активным</button>') +
            '<button class="btn btn--ghost" data-view>📜 Просмотр</button>' +
          '</div>';

        // Toggle in the header row → flip global auto_reply_enabled for the
        // currently-active prompt. Other prompts' toggles activate that prompt
        // first (otherwise we'd be toggling auto for a prompt that won't run).
        const headToggle = $('[data-agent-toggle]', card);
        if (headToggle) {
          headToggle.style.cursor = 'pointer';
          headToggle.onclick = async () => {
            try {
              if (!isActivePrompt) {
                await api('/prompts/' + p.id + '/activate', { method: 'POST', body: {} });
                toast('Активирован: ' + (p.name || 'v' + p.version));
              } else {
                const next = !autoOn;
                await api('/settings', { method: 'POST', body: { auto_reply_enabled: next } });
                autoOn = next;
                toast('Агент: ' + (next ? 'включён' : 'на паузе'));
              }
              initAgents();
            } catch (e) { toast('Ошибка: ' + e.message, 'err'); }
          };
        }

        const ctaToggle = $('[data-toggle-auto]', card);
        if (ctaToggle) {
          ctaToggle.onclick = async () => {
            try {
              const next = !autoOn;
              await api('/settings', { method: 'POST', body: { auto_reply_enabled: next } });
              autoOn = next;
              toast('Агент: ' + (next ? 'включён' : 'на паузе'));
              initAgents();
            } catch (e) { toast('Ошибка: ' + e.message, 'err'); }
          };
        }

        const activateBtn = $('[data-activate]', card);
        if (activateBtn) {
          activateBtn.onclick = async () => {
            try {
              await api('/prompts/' + p.id + '/activate', { method: 'POST', body: {} });
              toast('Активирован: ' + (p.name || 'v' + p.version));
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
      if (stats && stats.models) {
        const subt = $('.page-h__subtitle');
        if (subt) {
          subt.textContent = 'Responder: ' + stats.models.responder + ' · Classifier: ' + stats.models.classifier + ' · Analyst: ' + stats.models.analyst +
            ' · агент: ' + (autoOn ? 'отвечает' : 'на паузе');
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
      const total = contacts.length;
      const chips = $$('.chips .chip');
      const allChip = chips.find((c) => /^все/i.test(c.textContent || ''));
      if (allChip) {
        const cnt = $('.chip__count', allChip); if (cnt) cnt.textContent = total;
      }
      const rows = $$('table tbody tr');
      if (rows.length) {
        const tbody = rows[0].parentElement;
        tbody.innerHTML = '';
        for (const c of contacts.slice(0, 50)) {
          const status = c.lead_status || 'new';
          const fullName = [c.first_name, c.last_name].filter(Boolean).join(' ');
          const name = fullName || (c.ig_username ? '@' + c.ig_username : 'Контакт');
          const tr = document.createElement('tr');
          tr.innerHTML =
            '<td>' + escapeHtml(name) + '</td>' +
            '<td>' + escapeHtml(c.ig_username ? '@' + c.ig_username : '—') + '</td>' +
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
      const [stats, reports] = await Promise.all([api('/stats'), api('/reports')]);
      const total = (stats.contacts && stats.contacts.total) || 0;
      const f = reports.funnel || {};
      const msgs = (stats.messages && stats.messages.total) || 0;
      const won = f.customer || 0;
      const wonRate = total ? ((won / total) * 100).toFixed(1) + '%' : '0%';

      // KPI tiles (4 numbers at the bottom of the prototype).
      const tiles = $$('.t-xl.fw6.mono');
      const vals = [total, won, wonRate, msgs];
      tiles.forEach((t, i) => { if (vals[i] != null) t.textContent = vals[i]; });

      // Insert / refresh dynamic dashboard cards at the top of <main>.
      const main = $('main');
      if (!main) return;
      let host = $('#ig-reports-cards');
      if (!host) {
        host = el('section', {
          id: 'ig-reports-cards',
          style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', margin: '16px 0' },
        });
        // Place right after the page-h.
        const pageH = $('.page-h', main);
        if (pageH && pageH.parentElement) pageH.parentElement.insertBefore(host, pageH.nextSibling);
        else main.prepend(host);
      }
      host.innerHTML = '';

      // --- Funnel card -------------------------------------------------
      const funnelOrder = [
        { k: 'new', label: 'Новые', color: 'var(--blue)' },
        { k: 'warm', label: 'Тёплые', color: 'var(--yellow)' },
        { k: 'hot', label: 'Горячие', color: 'var(--red)' },
        { k: 'customer', label: 'Купили', color: 'var(--green)' },
        { k: 'lost', label: 'Потеряны', color: 'var(--text-mute)' },
      ];
      const maxFunnel = Math.max(1, ...funnelOrder.map((f2) => f[f2.k] || 0));
      const funnelCard = el('div', { class: 'card' });
      funnelCard.innerHTML =
        '<div class="section-h">Воронка по статусам</div>' +
        '<div style="display:flex;flex-direction:column;gap:8px;margin-top:8px">' +
          funnelOrder.map((row) => {
            const v = f[row.k] || 0;
            const pct = (v / maxFunnel) * 100;
            const ratePct = total ? ((v / total) * 100).toFixed(1) : '0';
            return (
              '<div>' +
                '<div style="display:flex;justify-content:space-between;font-size:11.5px;margin-bottom:3px">' +
                  '<span class="muted">' + row.label + '</span>' +
                  '<span class="mono">' + v + ' · ' + ratePct + '%</span>' +
                '</div>' +
                '<div style="height:6px;border-radius:3px;background:var(--bg-card-2);overflow:hidden">' +
                  '<div style="height:100%;width:' + pct + '%;background:' + row.color + '"></div>' +
                '</div>' +
              '</div>'
            );
          }).join('') +
        '</div>';
      host.appendChild(funnelCard);

      // --- Top intents card -------------------------------------------
      const intentsCard = el('div', { class: 'card' });
      const intents = reports.intents || [];
      const maxIntent = Math.max(1, ...intents.map((i) => i.n));
      intentsCard.innerHTML =
        '<div class="section-h">Топ-12 intent\'ов (incoming)</div>' +
        '<div style="display:flex;flex-direction:column;gap:6px;margin-top:8px;font-size:11.5px">' +
          (intents.length ? intents.map((row) => {
            const pct = (row.n / maxIntent) * 100;
            return (
              '<div style="display:flex;align-items:center;gap:10px">' +
                '<span class="mono" style="flex:0 0 145px;color:var(--text-mid)">' + escapeHtml(row.intent) + '</span>' +
                '<div style="flex:1;height:5px;border-radius:3px;background:var(--bg-card-2);overflow:hidden">' +
                  '<div style="height:100%;width:' + pct + '%;background:var(--blue)"></div>' +
                '</div>' +
                '<span class="mono" style="flex:0 0 36px;text-align:right">' + row.n + '</span>' +
              '</div>'
            );
          }).join('') : '<div class="muted">Нет данных</div>') +
        '</div>';
      host.appendChild(intentsCard);

      // --- Qualification card -----------------------------------------
      const q = reports.qualification || {};
      const qualCard = el('div', { class: 'card' });
      qualCard.innerHTML =
        '<div class="section-h">Сегменты (квалификация)</div>' +
        '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-top:10px">' +
          ['A','B','C','D','unknown'].map((k) => (
            '<div style="text-align:center;padding:10px 6px;background:var(--bg-card-2);border-radius:8px">' +
              '<div class="mono" style="font-size:18px;font-weight:600;color:' +
                (k === 'A' ? 'var(--purple)' : k === 'B' ? 'var(--blue)' : k === 'C' ? 'var(--yellow)' : 'var(--text-muted)') + '">' +
                (q[k] || 0) + '</div>' +
              '<div class="t-sm muted">' + k + '</div>' +
            '</div>'
          )).join('') +
        '</div>';
      host.appendChild(qualCard);

      // --- Daily activity sparkline (last 14 days) --------------------
      const daily = reports.daily || [];
      const dailyCard = el('div', {
        class: 'card',
        style: { gridColumn: '1 / -1' },
      });
      const maxBar = Math.max(1, ...daily.map((d) => d.incoming + d.outgoing));
      dailyCard.innerHTML =
        '<div class="section-h">Активность за 14 дней (incoming/outgoing)</div>' +
        '<div style="display:flex;align-items:flex-end;gap:6px;margin-top:14px;height:120px">' +
          daily.map((d) => {
            const inPct = (d.incoming / maxBar) * 100;
            const outPct = (d.outgoing / maxBar) * 100;
            const day = d.day.slice(5);
            return (
              '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;height:100%" title="' +
                escapeHtml(d.day) + ': ' + d.incoming + ' in / ' + d.outgoing + ' out">' +
                '<div style="flex:1;width:100%;display:flex;flex-direction:column;justify-content:flex-end;gap:1px">' +
                  '<div style="width:100%;background:var(--blue);height:' + inPct + '%;border-radius:2px 2px 0 0"></div>' +
                  '<div style="width:100%;background:var(--green);height:' + outPct + '%"></div>' +
                '</div>' +
                '<div class="mono" style="font-size:10px;color:var(--text-muted)">' + escapeHtml(day) + '</div>' +
              '</div>'
            );
          }).join('') +
        '</div>' +
        '<div style="display:flex;gap:14px;margin-top:10px;font-size:11px">' +
          '<span><span style="display:inline-block;width:10px;height:8px;background:var(--blue);border-radius:2px;vertical-align:middle;margin-right:4px"></span>incoming</span>' +
          '<span><span style="display:inline-block;width:10px;height:8px;background:var(--green);border-radius:2px;vertical-align:middle;margin-right:4px"></span>outgoing</span>' +
        '</div>';
      host.appendChild(dailyCard);
    } catch (e) {
      toast('Reports: ' + e.message, 'err');
    }
  }

  // ---------- RESEARCH (search + insights) -----------------------------

  async function initResearch() {
    ensureStyles();
    const main = $('main');
    if (!main) return;
    const pageH = $('.page-h', main);

    // Wipe the static prototype insight blocks (everything after page-h
    // is fluff we replace with real aggregates).
    if (pageH && pageH.parentElement) {
      let n = pageH.nextSibling;
      while (n) {
        const cur = n;
        n = cur.nextSibling;
        cur.remove?.();
      }
    }

    const host = el('section', { id: 'ig-research-host', style: { marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '16px' } });
    if (pageH && pageH.parentElement) pageH.parentElement.appendChild(host);
    else main.appendChild(host);

    // --- Search box --------------------------------------------------
    const searchCard = el('div', { class: 'card' });
    searchCard.innerHTML =
      '<div class="section-h">Поиск по диалогам</div>' +
      '<div style="display:flex;gap:8px;margin-top:10px">' +
        '<input class="input" id="ig-research-q" placeholder="Найти текст в&nbsp;переписках… (мин. 2 символа)" style="flex:1">' +
        '<button class="btn btn--primary" id="ig-research-go">Искать</button>' +
      '</div>' +
      '<div id="ig-research-results" style="margin-top:12px;display:flex;flex-direction:column;gap:6px"></div>';
    host.appendChild(searchCard);

    const qInput = $('#ig-research-q', searchCard);
    const goBtn = $('#ig-research-go', searchCard);
    const resultsBox = $('#ig-research-results', searchCard);

    let searchAbort = null;
    async function runSearch() {
      const q = (qInput.value || '').trim();
      if (q.length < 2) {
        resultsBox.innerHTML = '<div class="muted t-sm">Введи минимум 2 символа</div>';
        return;
      }
      resultsBox.innerHTML = '<div class="ig-loading">Ищу…</div>';
      if (searchAbort) searchAbort.abort();
      searchAbort = new AbortController();
      try {
        const res = await fetch(API + '/search?q=' + encodeURIComponent(q) + '&limit=80', {
          credentials: 'same-origin', signal: searchAbort.signal,
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        const items = data.results || [];
        resultsBox.innerHTML = '';
        if (!items.length) {
          resultsBox.appendChild(el('div', { class: 'muted t-sm' }, 'Совпадений нет.'));
          return;
        }
        const header = el('div', { class: 'muted t-sm', style: { marginBottom: '6px' } }, 'Найдено: ' + items.length);
        resultsBox.appendChild(header);
        for (const r of items) {
          const time = formatDay(r.created_at);
          const tone = r.direction === 'incoming' ? 'var(--blue)' : 'var(--green)';
          const row = el('a', {
            href: 'conversation.html?id=' + encodeURIComponent(r.contact_id),
            style: {
              display: 'block', padding: '10px 12px', borderRadius: '8px',
              background: 'var(--bg-card-2)', textDecoration: 'none', color: 'inherit',
              borderLeft: '3px solid ' + tone,
            },
          });
          row.innerHTML =
            '<div style="display:flex;justify-content:space-between;align-items:baseline;font-size:11.5px">' +
              '<div><b>' + escapeHtml(r.name) + '</b>' +
                (r.ig_username ? ' <span class="muted">@' + escapeHtml(r.ig_username) + '</span>' : '') +
                ' <span class="badge ' + (STATUS_BADGE[r.lead_status || 'new'] || 'badge--ghost') + '">' + escapeHtml(STATUS_LABELS[r.lead_status || 'new'] || r.lead_status || 'new') + '</span>' +
              '</div>' +
              '<span class="mono muted">' + escapeHtml(time) + '</span>' +
            '</div>' +
            '<div class="t-sm" style="margin-top:4px">' +
              (r.direction === 'incoming' ? '↘ ' : '↗ ') +
              highlight(r.text, q) +
            '</div>';
          resultsBox.appendChild(row);
        }
      } catch (e) {
        if (e.name === 'AbortError') return;
        resultsBox.innerHTML = '<div class="ig-err">' + escapeHtml(e.message) + '</div>';
      }
    }
    function highlight(text, q) {
      const safe = escapeHtml(text);
      try {
        const re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
        return safe.replace(re, '<mark style="background:var(--yellow);color:#080808;padding:0 2px;border-radius:2px">$1</mark>');
      } catch { return safe; }
    }
    goBtn.addEventListener('click', runSearch);
    qInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') runSearch(); });

    // --- Top intents card (mirrors /reports data) --------------------
    try {
      const reports = await api('/reports');
      const intents = reports.intents || [];
      const max = Math.max(1, ...intents.map((i) => i.n));
      const intentsCard = el('div', { class: 'card' });
      intentsCard.innerHTML =
        '<div class="section-h">О чём пишут — топ-12 intent\'ов (anal. за всё время)</div>' +
        '<div style="display:flex;flex-direction:column;gap:6px;margin-top:10px;font-size:11.5px">' +
          (intents.length ? intents.map((row) => {
            const pct = (row.n / max) * 100;
            return (
              '<div style="display:flex;align-items:center;gap:10px;cursor:pointer" data-intent="' + escapeHtml(row.intent) + '">' +
                '<span class="mono" style="flex:0 0 180px;color:var(--text-mid)">' + escapeHtml(row.intent) + '</span>' +
                '<div style="flex:1;height:6px;border-radius:3px;background:var(--bg-card-2);overflow:hidden">' +
                  '<div style="height:100%;width:' + pct + '%;background:var(--blue)"></div>' +
                '</div>' +
                '<span class="mono" style="flex:0 0 48px;text-align:right">' + row.n + '</span>' +
              '</div>'
            );
          }).join('') : '<div class="muted">Нет данных</div>') +
        '</div>';
      // Click intent → search for that intent's typical phrases via text search.
      intentsCard.addEventListener('click', (e) => {
        const row = e.target.closest('[data-intent]');
        if (!row) return;
        qInput.value = '';
        runSearch();
      });
      host.appendChild(intentsCard);

      // --- Funnel summary -------------------------------------------
      const f = reports.funnel || {};
      const total = Object.values(f).reduce((a, b) => a + b, 0);
      const summary = el('div', { class: 'card' });
      summary.innerHTML =
        '<div class="section-h">Состояние базы</div>' +
        '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-top:12px">' +
          [
            { k: 'new', label: 'Новые' },
            { k: 'warm', label: 'Тёплые' },
            { k: 'hot', label: 'Горячие' },
            { k: 'customer', label: 'Купили' },
            { k: 'lost', label: 'Потеряны' },
          ].map((row) => (
            '<div style="text-align:center;padding:12px;background:var(--bg-card-2);border-radius:8px">' +
              '<div class="mono" style="font-size:22px;font-weight:600;color:' +
                (row.k === 'hot' ? 'var(--red)' :
                 row.k === 'warm' ? 'var(--yellow)' :
                 row.k === 'customer' ? 'var(--green)' :
                 row.k === 'lost' ? 'var(--text-mute)' : 'var(--blue)') + '">' +
                (f[row.k] || 0) + '</div>' +
              '<div class="t-sm muted">' + row.label + '</div>' +
              '<div class="t-sm muted">' + (total ? ((f[row.k] || 0) / total * 100).toFixed(0) + '%' : '0%') + '</div>' +
            '</div>'
          )).join('') +
        '</div>';
      host.insertBefore(summary, searchCard);
    } catch (e) {
      toast('Research: ' + e.message, 'err');
    }
  }

  // ---------- JOURNEY (kanban) -----------------------------------------

  async function initJourney() {
    ensureStyles();
    const kanban = $('.kanban');
    if (!kanban) return;

    const STAGE_TITLES = [
      { stage: 'hello', titles: ['hello'] },
      { stage: 'discovery', titles: ['discovery'] },
      { stage: 'pitch', titles: ['pitch'] },
      { stage: 'objections', titles: ['objections', 'objection'] },
      { stage: 'close', titles: ['close'] },
      { stage: 'follow_up', titles: ['follow-up', 'follow up', 'followup'] },
      { stage: 'won_lost', titles: ['won', 'lost', 'won / lost', 'won/lost'] },
    ];

    function colFor(stage) {
      const cols = $$('.kanban__col', kanban);
      const titles = STAGE_TITLES.find((s) => s.stage === stage)?.titles || [];
      return cols.find((col) => {
        const t = ($('.kanban__h-title', col)?.textContent || '').trim().toLowerCase();
        return titles.some((cand) => t.includes(cand));
      });
    }

    for (const col of $$('.kanban__col', kanban)) {
      const head = $('.kanban__h', col);
      Array.from(col.children).forEach((ch) => { if (ch !== head) ch.remove(); });
      col.appendChild(el('div', { class: 'ig-loading' }, 'Загрузка…'));
    }

    let data;
    try {
      data = await api('/journey?limit=800');
    } catch (e) {
      toast('Journey: ' + e.message, 'err');
      return;
    }

    // Channel filter (Все / IG / TG). We only have IG data; TG chip becomes
    // a no-op but stays visually consistent.
    const filterChips = $$('.page-h .chips .chip');
    let activeChannel = 'all';
    filterChips.forEach((chip) => {
      chip.addEventListener('click', () => {
        filterChips.forEach((c) => c.classList.remove('chip--on'));
        chip.classList.add('chip--on');
        const t = (chip.textContent || '').trim().toLowerCase();
        activeChannel = t.startsWith('ig') ? 'ig' : t.startsWith('tg') ? 'tg' : 'all';
        renderAll();
      });
    });

    function renderAll() {
      for (const { stage } of STAGE_TITLES) {
        const col = colFor(stage);
        if (!col) continue;
        const head = $('.kanban__h', col);
        Array.from(col.children).forEach((ch) => { if (ch !== head) ch.remove(); });

        let cards = data.stages[stage] || [];
        if (activeChannel === 'tg') cards = [];

        const countEl = $('.kanban__h-count', col);
        if (countEl) countEl.textContent = cards.length;

        if (!cards.length) {
          col.appendChild(el('div', {
            class: 'empty',
            style: { padding: '18px', textAlign: 'center' },
          }, el('div', { class: 't-sm muted' }, 'пусто')));
          continue;
        }

        const TOP = 8;
        cards.slice(0, TOP).forEach((card) => col.appendChild(buildKanbanCard(card)));

        if (cards.length > TOP) {
          col.appendChild(el('div', {
            class: 'empty',
            style: { padding: '14px', textAlign: 'center', cursor: 'pointer' },
            onclick: () => expandColumn(col, cards, head),
          }, el('div', { class: 't-sm muted' }, '+ ' + (cards.length - TOP) + ' ещё')));
        }
      }
    }

    function expandColumn(col, cards, head) {
      Array.from(col.children).forEach((ch) => { if (ch !== head) ch.remove(); });
      cards.forEach((card) => col.appendChild(buildKanbanCard(card)));
    }

    function buildKanbanCard(card) {
      const hintCls = stageHintClass(card);
      const hintText = stageHintText(card);
      const handle = card.ig_username ? '@' + card.ig_username : '';
      const time = relativeTime(card.last_message_at);
      const vip = card.qualification === 'A';
      const node = el('div', {
        class: 'kanban__card' + (vip ? ' is-vip' : ''),
        style: { cursor: 'pointer' },
        onclick: () => { location.href = 'conversation.html?id=' + encodeURIComponent(card.id); },
      });
      const wonLostLabel = card.won_status === 'won'
        ? '<span class="badge badge--green">✓ оплачено</span>'
        : card.won_status === 'lost'
          ? '<span class="badge badge--lost">lost</span>'
          : '';
      node.innerHTML =
        '<div class="kc__top">' +
          '<span class="badge badge--ig">IG</span>' +
          (vip ? ' <span class="badge badge--purple">VIP</span>' : '') +
          ' ' + wonLostLabel +
          '<span class="mono">' + escapeHtml(time) + '</span>' +
        '</div>' +
        '<div class="kc__name">' + escapeHtml(card.name) + '</div>' +
        (card.preview ? '<div class="kc__msg">«' + escapeHtml(card.preview) + '»</div>' : '') +
        (hintText ? '<div class="kc__hint ' + hintCls + '">' + escapeHtml(hintText) + '</div>' : '') +
        '<div class="kc__foot">' +
          '<span>' + escapeHtml(handle || ('сообщ. ' + card.msg_count)) + ' · ' +
            escapeHtml(card.qualification || '—') + '</span>' +
          '<span class="muted">' + (card.has_outgoing ? 'AI отвечал' : 'не отвечали') + '</span>' +
        '</div>';
      return node;
    }

    function stageHintClass(card) {
      if (card.stage === 'objections' || card.lead_status === 'hot') return 'kc__hint--red';
      if (card.stage === 'follow_up') return 'kc__hint--warn';
      return '';
    }
    function stageHintText(card) {
      if (card.stage === 'won_lost') {
        return card.won_status === 'won' ? '💰 закрыт оплатой' : '❌ потеряли — причина в чате';
      }
      if (card.stage === 'close') return '🤝 готов к покупке — отправь счёт';
      if (card.stage === 'objections') return '⚠ возражение — нужен оператор';
      if (card.stage === 'follow_up') return '⏰ молчит > 24ч — напомни';
      if (card.stage === 'pitch') return '🤖 AI выслал предложение';
      if (card.stage === 'discovery') return '🤖 уточняет потребность';
      if (card.stage === 'hello') return '👋 первое касание';
      return '';
    }

    renderAll();
  }

  // ---------- GLOBAL ⌘K search palette ----------------------------------
  //
  // Universal across all pages — overlays a search box that hits /api/search
  // for messages OR /api/contacts for contact names. Triggered by:
  //   - focusing the existing .bar__search input
  //   - ⌘K / Ctrl+K shortcut anywhere on the page
  function initCommandPalette() {
    const bar = $('.bar__search');
    if (!bar) return;
    if ($('#ig-cmdk')) return; // already initialized

    const overlay = el('div', {
      id: 'ig-cmdk',
      style: {
        position: 'fixed', inset: '0', background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(4px)',
        display: 'none', zIndex: 9998, alignItems: 'flex-start', justifyContent: 'center', paddingTop: '8vh',
      },
    });
    const panel = el('div', {
      style: {
        width: 'min(640px,90vw)', background: 'var(--bg-card)', border: '1px solid var(--border-mid)',
        borderRadius: '12px', boxShadow: '0 24px 60px rgba(0,0,0,.5)', overflow: 'hidden',
      },
    });
    panel.innerHTML =
      '<div style="padding:14px 16px;border-bottom:1px solid var(--border-soft);display:flex;align-items:center;gap:10px">' +
        '<span class="mono muted">⌘K</span>' +
        '<input id="ig-cmdk-input" placeholder="Найти контакт или сообщение…" ' +
          'style="flex:1;background:transparent;border:0;outline:0;color:var(--text-main);font:inherit;font-size:14px">' +
        '<span class="muted t-sm">esc</span>' +
      '</div>' +
      '<div id="ig-cmdk-results" style="max-height:60vh;overflow-y:auto;padding:8px"></div>';
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    const input = $('#ig-cmdk-input', overlay);
    const results = $('#ig-cmdk-results', overlay);

    function open() {
      overlay.style.display = 'flex';
      input.value = '';
      results.innerHTML = '<div class="muted t-sm" style="padding:14px">Введи имя контакта или фрагмент сообщения…</div>';
      setTimeout(() => input.focus(), 30);
    }
    function close() {
      overlay.style.display = 'none';
      bar.blur();
    }

    bar.addEventListener('focus', open);

    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (overlay.style.display === 'none') open();
        else close();
      }
      if (e.key === 'Escape' && overlay.style.display !== 'none') close();
    });

    let timer = null;
    let abort = null;
    input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(runQuery, 220);
    });

    async function runQuery() {
      const q = input.value.trim();
      if (q.length < 2) {
        results.innerHTML = '<div class="muted t-sm" style="padding:14px">Минимум 2 символа</div>';
        return;
      }
      results.innerHTML = '<div class="ig-loading">Ищу…</div>';
      if (abort) abort.abort();
      abort = new AbortController();
      try {
        const [msgRes, ctRes] = await Promise.all([
          fetch(API + '/search?q=' + encodeURIComponent(q) + '&limit=30', {
            credentials: 'same-origin', signal: abort.signal,
          }).then((r) => r.json()),
          fetch(API + '/contacts?limit=400', {
            credentials: 'same-origin', signal: abort.signal,
          }).then((r) => r.json()),
        ]);
        const qLow = q.toLowerCase();
        const matchedContacts = (ctRes.contacts || []).filter((c) => {
          const fullName = [c.first_name, c.last_name].filter(Boolean).join(' ').toLowerCase();
          const u = (c.ig_username || '').toLowerCase();
          return fullName.includes(qLow) || u.includes(qLow);
        }).slice(0, 8);

        results.innerHTML = '';
        if (matchedContacts.length) {
          results.appendChild(el('div', {
            class: 'section-h',
            style: { padding: '8px 12px 4px' },
          }, 'Контакты'));
          for (const c of matchedContacts) {
            const fullName = [c.first_name, c.last_name].filter(Boolean).join(' ') || (c.ig_username ? '@' + c.ig_username : 'Контакт');
            results.appendChild(makeRow({
              href: 'conversation.html?id=' + encodeURIComponent(c.id),
              title: fullName,
              sub: (c.ig_username ? '@' + c.ig_username + ' · ' : '') + (STATUS_LABELS[c.lead_status || 'new'] || ''),
              right: relativeTime(c.last_message_at || c.updated_at),
              tone: c.lead_status === 'hot' ? 'var(--red)' : 'var(--blue)',
            }));
          }
        }
        const msgs = msgRes.results || [];
        if (msgs.length) {
          results.appendChild(el('div', {
            class: 'section-h',
            style: { padding: '12px 12px 4px' },
          }, 'Сообщения · ' + msgs.length));
          for (const m of msgs.slice(0, 30)) {
            results.appendChild(makeRow({
              href: 'conversation.html?id=' + encodeURIComponent(m.contact_id),
              title: m.name,
              sub: (m.direction === 'incoming' ? '↘ ' : '↗ ') + (m.text || '').slice(0, 110),
              right: relativeTime(m.created_at),
              tone: m.direction === 'incoming' ? 'var(--blue)' : 'var(--green)',
            }));
          }
        }
        if (!matchedContacts.length && !msgs.length) {
          results.innerHTML = '<div class="muted t-sm" style="padding:14px">Совпадений нет.</div>';
        }
      } catch (e) {
        if (e.name === 'AbortError') return;
        results.innerHTML = '<div class="ig-err">' + escapeHtml(e.message) + '</div>';
      }
    }

    function makeRow({ href, title, sub, right, tone }) {
      const row = el('a', {
        href,
        style: {
          display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px',
          borderRadius: '8px', textDecoration: 'none', color: 'inherit',
          borderLeft: '3px solid ' + tone, marginBottom: '4px',
        },
        onmouseover: (e) => { e.currentTarget.style.background = 'var(--bg-card-2)'; },
        onmouseout: (e) => { e.currentTarget.style.background = 'transparent'; },
      });
      row.innerHTML =
        '<div style="flex:1;min-width:0">' +
          '<div class="fw6 t-md" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + escapeHtml(title) + '</div>' +
          '<div class="muted t-sm" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + escapeHtml(sub) + '</div>' +
        '</div>' +
        '<span class="mono muted t-sm" style="flex-shrink:0">' + escapeHtml(right || '') + '</span>';
      return row;
    }
  }

  // ---------- boot ------------------------------------------------------

  const page = detectPage();
  document.addEventListener('DOMContentLoaded', () => {
    try {
      initCommandPalette(); // ⌘K available on every page
      if (page === 'inbox') initInbox();
      else if (page === 'conversation') initConversation();
      else if (page === 'pulse') initPulse();
      else if (page === 'settings') initSettings();
      else if (page === 'agents') initAgents();
      else if (page === 'pipeline') initPipeline();
      else if (page === 'reports') initReports();
      else if (page === 'journey') initJourney();
      else if (page === 'research') initResearch();
    } catch (e) {
      console.error('[ig-bridge]', e);
    }
  });
})();
