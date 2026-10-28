/* Sprint Slides — движок презентации без зависимостей.
   → / Пробел / PageDown / клик по правой кнопке — дальше (сначала раскрывает .fx на слайде)
   ← / PageUp — назад · Home / End · F — полный экран · N — заметки · O — обзор всех слайдов
   P — печать в PDF · ?print — режим печати без интерфейса · #5 — открыть слайд 5
   <body data-brand="HTML логотипа" data-topic="Вебинар · дата">
   Таймер: [data-deadline="2026-10-20T23:59:00+03:00"] внутри .sl-timer. QR: [data-qr="https://…"]. */
(function () {
  'use strict';
  var deck = document.querySelector('.deck');
  var stage = deck.querySelector('.stage');
  var slides = Array.prototype.slice.call(stage.querySelectorAll('.slide'));
  var cur = 0;
  var printMode = /[?&]print\b/.test(location.search);

  /* хром: бренд + тема + номер */
  var brand = document.body.getAttribute('data-brand') || '';
  var topic = document.body.getAttribute('data-topic') || '';
  slides.forEach(function (s, i) {
    if (s.hasAttribute('data-no-chrome')) return;
    var c = document.createElement('div');
    c.className = 'sl-chrome';
    c.innerHTML = '<div class="sx-logo">' + brand + '</div><div class="sl-chrome-right">' + (topic ? '<span>' + topic + '</span>' : '') +
      '<span><b>' + String(i + 1).padStart(2, '0') + '</b> / ' + String(slides.length).padStart(2, '0') + '</span></div>';
    s.appendChild(c);
  });

  /* UI вне сцены */
  var bar = document.createElement('div'); bar.className = 'sl-progress'; document.body.appendChild(bar);
  var nav = document.createElement('div'); nav.className = 'sl-nav';
  nav.innerHTML = '<button type="button" aria-label="Назад">&#8592;</button><button type="button" aria-label="Дальше">&#8594;</button>';
  document.body.appendChild(nav);
  nav.children[0].addEventListener('click', function () { prev(); });
  nav.children[1].addEventListener('click', function () { next(); });
  var help = document.createElement('div'); help.className = 'sl-help';
  help.textContent = '← → листать · F полный экран · N заметки · O обзор · P PDF';
  document.body.appendChild(help);
  var notes = document.createElement('div'); notes.className = 'sl-notes-panel'; document.body.appendChild(notes);

  function fit() {
    var s = Math.min(window.innerWidth / 1440, window.innerHeight / 810);
    stage.style.setProperty('--sl-scale', s);
  }

  function steps(s) { return Array.prototype.slice.call(s.querySelectorAll('.fx')); }

  function show(i, revealAll) {
    i = Math.max(0, Math.min(slides.length - 1, i));
    slides[cur].classList.remove('is-active');
    cur = i;
    var s = slides[cur];
    steps(s).forEach(function (f) { f.classList.toggle('is-shown', !!revealAll); });
    s.classList.add('is-active');
    bar.style.width = ((cur + 1) / slides.length * 100) + '%';
    var n = s.querySelector('.sl-notes');
    notes.innerHTML = '<b>Заметки · слайд ' + (cur + 1) + '</b>' + (n ? n.innerHTML : '—');
    if (location.hash !== '#' + (cur + 1)) history.replaceState(null, '', '#' + (cur + 1));
    if (window.SprintSlides && window.SprintSlides.onShow) window.SprintSlides.onShow(s);
    drawMaps(s);
  }
  function next() {
    var hidden = steps(slides[cur]).filter(function (f) { return !f.classList.contains('is-shown'); });
    if (hidden.length) { hidden[0].classList.add('is-shown'); return; }
    if (cur < slides.length - 1) show(cur + 1);
  }
  function prev() {
    var shown = steps(slides[cur]).filter(function (f) { return f.classList.contains('is-shown'); });
    if (shown.length) { shown[shown.length - 1].classList.remove('is-shown'); return; }
    if (cur > 0) show(cur - 1, true);
  }

  function toggleOverview() {
    var on = document.body.classList.toggle('sl-overview');
    if (on) slides.forEach(function (s) { s.classList.remove('is-active'); });
    else show(cur, true);
    if (on) slides[cur].classList.add('is-active');
  }
  slides.forEach(function (s, i) {
    s.addEventListener('click', function () { if (document.body.classList.contains('sl-overview')) { document.body.classList.remove('sl-overview'); slides.forEach(function (x) { x.classList.remove('is-active'); }); cur = i; show(i, true); } });
  });

  document.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var k = e.key;
    if (k === 'ArrowRight' || k === 'PageDown' || k === ' ' || k === 'Enter') { e.preventDefault(); next(); }
    else if (k === 'ArrowLeft' || k === 'PageUp' || k === 'Backspace') { e.preventDefault(); prev(); }
    else if (k === 'Home') show(0);
    else if (k === 'End') show(slides.length - 1, true);
    else if (k === 'f' || k === 'F' || k === 'а' || k === 'А') { if (!document.fullscreenElement) document.documentElement.requestFullscreen && document.documentElement.requestFullscreen(); else document.exitFullscreen(); }
    else if (k === 'n' || k === 'N' || k === 'т' || k === 'Т') notes.classList.toggle('is-open');
    else if (k === 'o' || k === 'O' || k === 'щ' || k === 'Щ' || k === 'Escape') { if (k !== 'Escape' || document.body.classList.contains('sl-overview')) toggleOverview(); }
    else if (k === 'p' || k === 'P' || k === 'з' || k === 'З') window.print();
  });

  /* свайпы на телефоне/планшете */
  var tx = null;
  document.addEventListener('touchstart', function (e) { tx = e.touches[0].clientX; }, { passive: true });
  document.addEventListener('touchend', function (e) { if (tx === null) return; var dx = e.changedTouches[0].clientX - tx; if (Math.abs(dx) > 40) (dx < 0 ? next : prev)(); tx = null; });

  /* таймер дедлайна */
  function tick() {
    document.querySelectorAll('.sl-timer[data-deadline]').forEach(function (t) {
      var ms = Math.max(0, new Date(t.getAttribute('data-deadline')) - Date.now());
      var v = [Math.floor(ms / 864e5), Math.floor(ms / 36e5) % 24, Math.floor(ms / 6e4) % 60, Math.floor(ms / 1e3) % 60];
      t.querySelectorAll('b').forEach(function (b, i) { b.textContent = String(v[i]).padStart(2, '0'); });
    });
  }
  tick(); setInterval(tick, 1000);

  /* QR (нужен qrcodejs с cdnjs; без него показывается ссылка) */
  document.querySelectorAll('[data-qr]').forEach(function (el) {
    if (window.QRCode) new window.QRCode(el, { text: el.getAttribute('data-qr'), width: 480, height: 480, colorDark: '#101b30', colorLight: '#ffffff', correctLevel: window.QRCode.CorrectLevel.M });
  });

  /* карта узлов (как на сайте): .sx-map > .sx-node[data-x][data-y] */
  function drawMaps(root) {
    root.querySelectorAll('.sx-map').forEach(function (map) {
      var w = map.clientWidth, h = map.clientHeight; if (!w) return;
      var hub = map.querySelector('.sx-node--hub');
      map.querySelectorAll('.sx-node').forEach(function (n) {
        var half = n.offsetWidth / 2 + 8, x = parseFloat(n.dataset.x) / 100 * w;
        n.style.left = Math.min(Math.max(x, half), w - half) + 'px'; n.style.top = n.dataset.y + '%';
      });
      var hx = parseFloat(hub.style.left), hy = parseFloat(hub.dataset.y) / 100 * h;
      var svg = map.querySelector('svg.sx-map-lines');
      if (!svg) { svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'sx-map-lines'); map.prepend(svg); }
      svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
      var d = '';
      map.querySelectorAll('.sx-node:not(.sx-node--hub)').forEach(function (n) {
        var x = parseFloat(n.style.left), y = parseFloat(n.dataset.y) / 100 * h, my = (y + hy) / 2;
        d += 'M' + x + ' ' + y + ' C ' + x + ' ' + my + ', ' + hx + ' ' + my + ', ' + hx + ' ' + hy + ' ';
      });
      svg.innerHTML = '<path d="' + d + '"/>';
    });
  }

  window.addEventListener('resize', fit);
  window.addEventListener('hashchange', function () { var n = parseInt(location.hash.slice(1), 10); if (n && n - 1 !== cur) show(n - 1, true); });
  window.addEventListener('beforeprint', function () { slides.forEach(function (s) { s.classList.add('is-active'); drawMaps(s); }); });
  window.addEventListener('afterprint', function () { slides.forEach(function (s, i) { s.classList.toggle('is-active', i === cur); }); });
  fit();
  var start = parseInt(location.hash.slice(1), 10);
  show(start ? start - 1 : 0, !!start);
  if (printMode) { slides.forEach(function (s) { s.classList.add('is-active'); drawMaps(s); }); }
  if (document.fonts) document.fonts.ready.then(function () { drawMaps(slides[cur]); });
  window.SprintSlides = window.SprintSlides || {};
  window.SprintSlides.go = function (n) { show(n - 1, true); };
})();
