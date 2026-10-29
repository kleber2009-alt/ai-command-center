/* cinematic-site — shared behaviour. No dependencies.
   Reads optional window.SITE (config) and window.SITE_DATA (catalog) from data.js.
   Every module is guarded: a page uses only the blocks it contains. */
(function () {
  var D = document, R = D.documentElement, $ = function (s, r) { return (r || D).querySelector(s); },
    $$ = function (s, r) { return [].slice.call((r || D).querySelectorAll(s)); };
  var SITE = window.SITE || {}, DATA = window.SITE_DATA || { items: [] };
  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  R.classList.add('js');

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function q(k) { return new URLSearchParams(location.search).get(k); }

  /* ---------- intro: once per session, skippable ---------- */
  var intro = $('.intro');
  if (intro) {
    try { sessionStorage.setItem('intro_seen', '1'); } catch (e) {}
    var sk = $('.skip', intro); if (sk) sk.addEventListener('click', function () { R.classList.add('no-intro'); });
  }

  /* ---------- stable viewport height (mobile URL bar) ---------- */
  function setVh() { var h = window.visualViewport ? visualViewport.height : innerHeight; R.style.setProperty('--vh', h + 'px'); }
  setVh(); var vt; function onRs() { clearTimeout(vt); vt = setTimeout(setVh, 150); }
  addEventListener('resize', onRs); if (window.visualViewport) visualViewport.addEventListener('resize', onRs);

  /* ---------- scroll-scrubbed hero video + eased wheel scrolling ----------
     Video must be encoded with a short GOP (scripts/scrub-video.sh), otherwise seeks stutter. */
  var sc = $('.scrub'), video = sc && $('video', sc);
  if (sc && video) {
    var hint = $('.scroll-hint', sc), ready = false, target = 0, cur = 0, locked = false, last = -1;
    var seek = function () {
      if (!ready || !video.duration) return;
      if (Math.abs(target - cur) < 0.04) { locked = false; return; }
      locked = true; cur = target;
      if ('requestVideoFrameCallback' in video) video.requestVideoFrameCallback(function () { locked = false; seek(); });
      else video.addEventListener('seeked', function () { locked = false; seek(); }, { once: true });
      video.currentTime = cur;
    };
    var upd = function (y) {
      var track = sc.offsetHeight - innerHeight; if (track <= 0) return;
      var p = Math.max(0, Math.min(1, y / track)); if (Math.abs(p - last) < 1e-4) return; last = p;
      if (ready && video.duration) { target = p * (video.duration - 0.05); if (!locked) seek(); }
      if (hint) hint.style.opacity = ((1 - Math.min(1, p / 0.12)) * 0.5).toFixed(3);
    };
    video.pause();
    video.addEventListener('loadedmetadata', function () { ready = true; last = -1; upd(scrollY); });
    video.load();
    var touch = matchMedia('(pointer: coarse)').matches;
    if (touch || reduced || SITE.smoothWheel === false) {
      addEventListener('scroll', function () { upd(scrollY); }, { passive: true }); upd(scrollY);
    } else {
      // eased wheel: the page glides like a film dolly, which also hides frame-seek latency
      var EASE = 0.09, tS = scrollY, sS = scrollY;
      var mx = function () { return Math.max(0, R.scrollHeight - innerHeight); };
      addEventListener('wheel', function (e) {
        if (e.ctrlKey || (e.target.closest && e.target.closest('.menu,dialog,.pop,.tmt,textarea'))) return;
        e.preventDefault(); tS = Math.max(0, Math.min(tS + e.deltaY * 1.2, mx()));
      }, { passive: false });
      addEventListener('scroll', function () { if (Math.abs(scrollY - sS) > 3) tS = sS = scrollY; }, { passive: true });
      (function tick() {
        requestAnimationFrame(tick); tS = Math.max(0, Math.min(tS, mx()));
        sS += (tS - sS) * EASE; if (Math.abs(tS - sS) < 0.5) sS = tS;
        if (Math.abs(sS - scrollY) > 0.5) scrollTo(0, sS); upd(sS);
      })();
    }
  }

  /* ---------- data-driven marquee rows and stats (optional) ---------- */
  $$('[data-marquee]').forEach(function (row) {
    var all = DATA.marquee || [], half = Math.ceil(all.length / 2), part = row.dataset.marquee === 'b' ? all.slice(half) : all.slice(0, half);
    row.innerHTML = part.map(function (m) {
      var pic = m.img ? '<img src="' + esc(m.img) + '" alt="" loading="lazy">' : '<b>' + esc(m.mono || (m.name || '?')[0]) + '</b>';
      var tagName = m.url ? 'a' : 'article', href = m.url ? ' href="' + esc(m.url) + '" target="_blank" rel="noopener"' : '';
      return '<' + tagName + ' class="tmc" tabindex="0" role="listitem"' + href + '><div class="tmp">' + pic + '</div><div class="tmb"><div class="tmq" aria-hidden="true">' + esc(m.mark || '\u201C') + '</div><p>' + esc(m.text) + '</p><div class="n">' + esc(m.name) + '</div><div class="i">' + esc(m.sub || '') + '</div></div></' + tagName + '>';
    }).join('');
  });
  $$('[data-stat]').forEach(function (el) { var v = (DATA.stats || {})[el.dataset.stat]; if (v != null) el.textContent = v; });

  /* ---------- marquee: clone cards so the loop is seamless ---------- */
  $$('.tmt').forEach(function (t) {
    $$('.tmc', t).forEach(function (c) { var d = c.cloneNode(true); d.classList.add('dup'); d.setAttribute('aria-hidden', 'true'); d.removeAttribute('tabindex'); t.appendChild(d); });
  });

  /* ---------- CSS dropdowns: show current value, close after pick ---------- */
  $$('.dd').forEach(function (dd) {
    var cur = $('.cur', dd);
    var sync = function () {
      var r = $('input:checked', dd), l = r && $('label[for="' + r.id + '"]', dd);
      if (cur && l) cur.textContent = l.textContent;
      $$('.menu label', dd).forEach(function (x) { x.classList.toggle('on', x === l); });
    };
    dd.addEventListener('change', function () { sync(); dd.blur(); if (D.activeElement && dd.contains(D.activeElement)) D.activeElement.blur(); });
    sync();
  });
  // brief bar -> catalog with query params
  $$('form[data-qbar]').forEach(function (f) {
    f.addEventListener('submit', function (e) {
      e.preventDefault(); var p = new URLSearchParams();
      $$('input[type=radio]:checked', f).forEach(function (r) { if (r.value) p.set(r.name, r.value); });
      var tab = $('.tabs .on', f); if (tab && tab.dataset.k) p.set(tab.dataset.k, tab.dataset.v);
      location.href = f.getAttribute('action') + (p.toString() ? '?' + p : '') + '#catalog';
    });
    $$('.tabs button', f).forEach(function (b) {
      b.addEventListener('click', function () { $$('.tabs button', f).forEach(function (x) { x.classList.toggle('on', x === b); }); });
    });
  });

  /* ---------- leads ---------- */
  function sendLead(payload) {
    var L = SITE.leads || {}; payload.page = location.pathname; payload.at = new Date().toISOString();
    var jobs = [];
    if (typeof L.send === 'function') jobs.push(Promise.resolve().then(function () { return L.send(payload); }));
    if (L.webhook) jobs.push(fetch(L.webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }));
    if (!jobs.length) console.info('[lead] no SITE.leads configured', payload);
    return Promise.allSettled(jobs);
  }
  $$('form.lead-form').forEach(function (f) {
    var btn = $('[type=submit]', f), hint = $('.hint', f);
    var check = function () { var ok = f.checkValidity(); if (btn) btn.classList.toggle('off', !ok); if (hint) hint.style.visibility = ok ? 'hidden' : ''; };
    f.addEventListener('input', check); f.addEventListener('change', check); check();
    f.addEventListener('submit', function (e) {
      e.preventDefault(); if (!f.checkValidity()) { f.reportValidity(); return; }
      var data = { source: f.dataset.source || 'form' };
      new FormData(f).forEach(function (v, k) { if (v) data[k] = v; });
      if (f.dataset.item) data.item = f.dataset.item;
      f.classList.add('sent'); sendLead(data);
    });
    $$('[data-reset]', f).forEach(function (b) {
      b.addEventListener('click', function () { f.reset(); f.classList.remove('sent'); check(); var dlg = f.closest('dialog'); if (dlg) dlg.close(); var pop = f.closest('.pop'); if (pop) togglePop(false); });
    });
  });

  /* ---------- call-back fab ---------- */
  var fab = $('.fab'), pop = $('.pop');
  function togglePop(on) { if (!fab || !pop) return; on = on == null ? !pop.classList.contains('open') : on; pop.classList.toggle('open', on); fab.classList.toggle('open', on); fab.setAttribute('aria-expanded', on); }
  if (fab) fab.addEventListener('click', function () { togglePop(); });
  $$('.pop .x').forEach(function (x) { x.addEventListener('click', function () { togglePop(false); }); });

  /* ---------- dialogs ---------- */
  D.addEventListener('click', function (e) {
    var o = e.target.closest('[data-open]');
    if (o) { var d = D.getElementById(o.dataset.open); if (d && d.showModal) { e.preventDefault(); var f = $('form', d); if (f && o.dataset.item) f.dataset.item = o.dataset.item; d.showModal(); } }
    var c = e.target.closest('dialog .x'); if (c) c.closest('dialog').close();
    if (e.target.tagName === 'DIALOG') e.target.close();
  });

  /* ---------- catalog cards ---------- */
  var ITEMS = DATA.items || [], BY = {}; ITEMS.forEach(function (it) { BY[it.id] = it; });
  var detailHref = DATA.detailPage || 'item.html';
  function card(it) {
    var meta = (it.meta || []).map(function (m) { return '<span>' + esc(m) + '</span>'; }).join('<i class="dot"></i>');
    return '<a class="pc rvl" href="' + detailHref + '?id=' + encodeURIComponent(it.id) + '"><div class="pw"' + (it.color ? ' style="--agent:' + esc(it.color) + '"' : '') + '><img src="' + esc(it.img) + '" alt="' + esc(it.name) + '" loading="lazy">' +
      (it.tag ? '<span class="tag ' + esc(it.tagStyle || '') + '">' + esc(it.tag) + '</span>' : '') + '</div>' +
      '<div class="pm">' + meta + '</div><div class="pn">' + esc(it.name) + '</div><div class="pp"><b>' + esc(it.price) + '</b>' + (it.sub ? '<i class="dot"></i><span>' + esc(it.sub) + '</span>' : '') + '</div></a>';
  }
  $$('[data-featured]').forEach(function (g) {
    var ids = (g.dataset.featured || '').split(',').filter(Boolean);
    var list = ids.length ? ids.map(function (i) { return BY[i]; }).filter(Boolean) : ITEMS.slice(0, +g.dataset.limit || 6);
    g.innerHTML = list.map(card).join('');
  });

  var cat = $('[data-catalog]');
  if (cat) {
    var F = DATA.filters || [], S = {}, sortSel = $('[data-sort]'), count = $('[data-count]'), empty = $('.empty');
    F.forEach(function (f) { var v = q(f.key); S[f.key] = v ? [v] : []; });
    var bar = $('[data-filters]');
    if (bar) bar.innerHTML = F.map(function (f) {
      return '<div class="fgrp"><span>' + esc(f.label) + '</span>' + f.values.map(function (v) {
        return '<button type="button" class="pill' + (S[f.key].indexOf(v) > -1 ? ' on' : '') + '" data-k="' + esc(f.key) + '" data-v="' + esc(v) + '">' + esc(v) + '</button>';
      }).join('') + '</div>';
    }).join('');
    var match = function (it) {
      return F.every(function (f) { var sel = S[f.key]; if (!sel.length) return true; var v = [].concat((it.f || {})[f.key] || []); return sel.some(function (s) { return v.indexOf(s) > -1; }); });
    };
    var render = function () {
      var list = ITEMS.filter(match), s = sortSel && sortSel.value, srt = (DATA.sorts || {})[s];
      if (srt && srt.fn) list = list.slice().sort(srt.fn);
      cat.innerHTML = list.map(card).join(''); if (count) count.textContent = list.length;
      if (empty) empty.classList.toggle('on', !list.length); reveal();
    };
    if (bar) bar.addEventListener('click', function (e) {
      var b = e.target.closest('.pill'); if (!b) return; var a = S[b.dataset.k], i = a.indexOf(b.dataset.v);
      if (i > -1) a.splice(i, 1); else a.push(b.dataset.v); b.classList.toggle('on', i < 0); render();
    });
    if (sortSel) { sortSel.innerHTML = Object.keys(DATA.sorts || {}).map(function (k) { return '<option value="' + k + '">' + esc(DATA.sorts[k].label) + '</option>'; }).join(''); sortSel.addEventListener('change', render); }
    $$('[data-clear]').forEach(function (b) { b.addEventListener('click', function () { F.forEach(function (f) { S[f.key] = []; }); $$('.pill.on', bar).forEach(function (p) { p.classList.remove('on'); }); render(); }); });
    render();
  }

  /* ---------- detail page ---------- */
  var dt = $('[data-detail]');
  if (dt) {
    var it = BY[q('id')] || ITEMS[0];
    if (it) {
      D.title = it.name + ' — ' + (SITE.name || D.title);
      $$('[data-f]').forEach(function (el) { var k = el.dataset.f, v = it[k]; if (v != null) el.textContent = v; });
      var nums = $('[data-nums]'); if (nums) nums.innerHTML = (it.nums || []).map(function (n) { return '<div><b>' + esc(n[0]) + '</b><span>' + esc(n[1]) + '</span></div>'; }).join('');
      var ch = $('[data-chips]'); if (ch) ch.innerHTML = (it.features || []).map(function (x) { return '<span>' + esc(x) + '</span>'; }).join('');
      var sp = $('[data-spec]'); if (sp) sp.innerHTML = (it.spec || []).map(function (x) { return '<div><span>' + esc(x[0]) + '</span><b>' + esc(x[1]) + '</b></div>'; }).join('');
      var lk = $('[data-links]'); if (lk) { if ((it.links || []).length) lk.innerHTML = it.links.map(function (x) { return '<a href="' + esc(x.url) + '" target="_blank" rel="noopener">' + esc(x.title) + '</a>'; }).join(''); else { var sec = lk.closest('section'); if (sec) sec.remove(); } }
      $$('[data-hide-empty]').forEach(function (el) { var k = el.dataset.hideEmpty; if (!(it[k] && it[k].length)) el.remove(); });
      var tr = $('[data-terms]'); if (tr) tr.innerHTML = (it.terms || []).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('');
      $$('[data-open]', dt).forEach(function (b) { b.dataset.item = it.name; });
      var tag = $('[data-tag]'); if (tag) { if (it.tag) { tag.textContent = it.tag; tag.className = 'tag ' + (it.tagStyle || ''); } else tag.remove(); }
      // gallery + lightbox
      var G = it.gallery && it.gallery.length ? it.gallery : [it.img], gi = 0, main = $('.gal .main img'), th = $('.gal .th'), cn = $('.gal .cnt');
      var lb = $('.lb'), lbi = lb && $('img', lb);
      var show = function (i) { gi = (i + G.length) % G.length; if (main) { main.src = G[gi]; main.alt = it.name; } if (cn) cn.textContent = (gi + 1) + ' / ' + G.length; if (lbi) lbi.src = G[gi]; $$('img', th).forEach(function (t, k) { t.classList.toggle('on', k === gi); }); };
      if (th) th.innerHTML = G.map(function (s, k) { return '<img src="' + esc(s) + '" alt="" data-i="' + k + '">'; }).join('');
      if (th) th.addEventListener('click', function (e) { var t = e.target.closest('img'); if (t) show(+t.dataset.i); });
      $$('.gal .nav, .lb .nav').forEach(function (b) { b.addEventListener('click', function () { show(gi + (b.classList.contains('p') ? -1 : 1)); }); });
      if (main && lb) main.addEventListener('click', function () { lb.classList.add('on'); });
      if (lb) { $('.x', lb).addEventListener('click', function () { lb.classList.remove('on'); }); lb.addEventListener('click', function (e) { if (e.target === lb) lb.classList.remove('on'); }); }
      D.addEventListener('keydown', function (e) { if (e.key === 'Escape' && lb) lb.classList.remove('on'); if (lb && lb.classList.contains('on')) { if (e.key === 'ArrowLeft') show(gi - 1); if (e.key === 'ArrowRight') show(gi + 1); } });
      show(0);
      var sim = $('[data-similar]');
      if (sim) sim.innerHTML = ITEMS.filter(function (x) { return x.id !== it.id; }).sort(function (a, b) { return (b.group === it.group) - (a.group === it.group); }).slice(0, 3).map(card).join('');
    }
  }

  /* ---------- reveal on scroll (staggered per parent) ---------- */
  var io = 'IntersectionObserver' in window && !reduced ? new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (!e.isIntersecting) return; var sib = $$(':scope>.rvl', e.target.parentNode), i = Math.max(0, sib.indexOf(e.target));
      setTimeout(function () { e.target.classList.add('in'); }, Math.min(i, 6) * 120); io.unobserve(e.target);
    });
  }, { threshold: 0.12 }) : null;
  function reveal() { $$('.rvl:not(.in)').forEach(function (el) { if (io) io.observe(el); else el.classList.add('in'); }); }
  reveal();
})();
