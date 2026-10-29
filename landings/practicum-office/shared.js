/* Shared behaviour for the practicum versions: registration links, countdown, reels, lightbox. */
(() => {
  // Registration. Inside Tilda (page pasted as an HTML block next to the popup) the buttons open
  // the existing Tilda form "#popup:practicum": leads, pixels and the redirect to Telegram keep working.
  // Anywhere else they open the same form on the live page.
  const REG_URL = 'https://aicex.club/practicum#popup:practicum';
  const inTilda = !!document.querySelector('[data-tooltip-hook="#popup:practicum"]');
  document.querySelectorAll('[data-reg]').forEach(a => {
    if (inTilda) { a.setAttribute('href', '#popup:practicum'); a.removeAttribute('target'); }
    else { a.setAttribute('href', REG_URL); a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener'); }
  });

  // Countdown to the first live stream: 4 November, 18:00 Moscow time.
  const START = Date.parse('2026-11-04T18:00:00+03:00');
  const counters = document.querySelectorAll('[data-countdown]');
  const pad = n => String(n).padStart(2, '0');
  const tick = () => {
    let s = Math.max(0, Math.floor((START - Date.now()) / 1000));
    const v = [Math.floor(s / 86400), Math.floor(s % 86400 / 3600), Math.floor(s % 3600 / 60), s % 60];
    counters.forEach(c => c.querySelectorAll('b').forEach((b, i) => { b.textContent = pad(v[i]); }));
  };
  if (counters.length) { tick(); setInterval(tick, 1000); }

  // Reels: tap to play with sound, only one at a time.
  const reels = [...document.querySelectorAll('.reel')];
  reels.forEach(r => {
    const v = r.querySelector('video');
    r.setAttribute('tabindex', '0');
    r.setAttribute('role', 'button');
    const toggle = () => {
      if (v.paused) {
        reels.forEach(o => { if (o !== r) { o.querySelector('video').pause(); o.classList.remove('on'); } });
        v.muted = false; v.play().catch(() => { v.muted = true; v.play(); }); r.classList.add('on');
      } else { v.pause(); r.classList.remove('on'); }
    };
    r.addEventListener('click', toggle);
    r.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
  });

  // Lightbox for screenshots.
  document.addEventListener('click', e => {
    const img = e.target.closest('.shot img, [data-zoom]');
    if (!img) return;
    const lb = document.createElement('div');
    lb.className = 'lb';
    lb.innerHTML = '<img alt="">';
    lb.firstChild.src = img.dataset.full || img.currentSrc || img.src;
    lb.addEventListener('click', () => lb.remove());
    document.body.appendChild(lb);
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') document.querySelector('.lb')?.remove(); });

  // Tabs (used by versions with a works switcher).
  document.querySelectorAll('[data-tabs]').forEach(box => {
    const btns = box.querySelectorAll('[data-tab]');
    const panes = box.querySelectorAll('[data-pane]');
    btns.forEach(b => b.addEventListener('click', () => {
      btns.forEach(x => x.setAttribute('aria-selected', x === b));
      panes.forEach(p => { p.hidden = p.dataset.pane !== b.dataset.tab; });
    }));
  });

  // Sticky CTA on phones once the hero is scrolled past.
  const sticky = document.querySelector('.sticky');
  const hero = document.querySelector('[data-hero]');
  if (sticky && hero && 'IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => sticky.classList.toggle('show', !e.isIntersecting)).observe(hero);
  }
})();
