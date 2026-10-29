// Boot: if assets/live.enc is published, ask for the password and decrypt the Direct snapshot in the
// browser (PBKDF2-SHA256 → AES-256-GCM → gunzip); otherwise start with the demo data from data.js.
(function () {
  const $ = (s) => document.querySelector(s);
  const KEY = 'crm-pass';
  const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

  async function decrypt(box, password) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: b64(box.salt), iterations: box.iter, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['decrypt'],
    );
    const gz = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(box.iv) }, key, b64(box.ct));
    const stream = new Blob([gz]).stream().pipeThrough(new DecompressionStream('gzip'));
    return JSON.parse(await new Response(stream).text());
  }

  function start(data) {
    $('#lock').hidden = true;
    $('.app').hidden = false;
    window.CRM_START(data);
  }

  async function boot() {
    let box = null;
    try {
      const r = await fetch('assets/live.enc', { cache: 'no-store' });
      if (r.ok) box = await r.json();
    } catch (e) { /* no snapshot published — demo mode */ }
    if (!box) return start(window.CRM_DATA);

    $('.app').hidden = true;
    $('#lock').hidden = false;
    window.lucide && window.lucide.createIcons();
    const form = $('#lock form');
    const err = $('#lock .err');
    const tryPass = async (pass, remembered) => {
      form.classList.add('busy');
      err.textContent = '';
      try {
        const data = await decrypt(box, pass);
        try { sessionStorage.setItem(KEY, pass); } catch (e) { /* storage blocked */ }
        start(data);
      } catch (e) {
        if (!remembered) err.textContent = 'Пароль не подошёл';
        try { sessionStorage.removeItem(KEY); } catch (e2) { /* storage blocked */ }
      } finally {
        form.classList.remove('busy');
      }
    };
    form.addEventListener('submit', (e) => { e.preventDefault(); tryPass(form.pass.value, false); });
    $('#lock .demo').addEventListener('click', () => start(window.CRM_DATA));
    let saved = null;
    try { saved = sessionStorage.getItem(KEY); } catch (e) { /* storage blocked */ }
    if (saved) tryPass(saved, true);
    else form.pass.focus();
  }

  boot();
})();
