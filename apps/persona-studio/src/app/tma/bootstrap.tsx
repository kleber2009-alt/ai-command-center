'use client';

import { useEffect, useState } from 'react';

export function TmaBootstrap() {
  const [status, setStatus] = useState<'init' | 'loading' | 'ok' | 'error' | 'no-tg'>('init');
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (!tg) {
      setStatus('no-tg');
      return;
    }
    tg.ready();
    tg.expand();

    const initData = tg.initData;
    if (!initData) {
      setStatus('error');
      setMsg('Не удалось получить initData от Telegram. Открой Mini App изнутри бота.');
      return;
    }

    setStatus('loading');
    (async () => {
      try {
        const res = await fetch('/api/tma/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ initData }),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
          setStatus('error');
          setMsg(j.detail ?? j.error ?? `HTTP ${res.status}`);
          return;
        }
        setStatus('ok');
        // Hard redirect so server components see the new session cookie.
        window.location.replace('/dashboard');
      } catch (e) {
        setStatus('error');
        setMsg(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  return (
    <div className="w-full max-w-sm grid gap-6 text-center">
      <div className="flex items-baseline justify-center gap-2.5">
        <span className="inline-block w-[7px] h-[7px] rounded-full bg-lime translate-y-[-1px]" />
        <span className="mono text-[12px] tracking-widest font-bold uppercase">Persona Studio</span>
      </div>
      {status === 'init' && (
        <p className="mono text-[11px] tracking-widest text-text-mute">/ INIT</p>
      )}
      {status === 'loading' && (
        <>
          <p className="font-serif italic text-[18px]">Подключаем твой Telegram…</p>
          <p className="mono text-[10px] tracking-widest text-cyan animate-pulse">/ VERIFYING</p>
        </>
      )}
      {status === 'ok' && (
        <>
          <p className="font-serif italic text-[18px]">Готово, заходим в студию.</p>
          <p className="mono text-[10px] tracking-widest text-lime">/ REDIRECTING</p>
        </>
      )}
      {status === 'no-tg' && (
        <>
          <p className="mono text-[10px] tracking-widest uppercase text-pink">/ NO-TELEGRAM</p>
          <p className="font-serif italic text-[16px] text-text-dim">
            Эта страница работает только внутри Telegram Mini App. На вебе используй{' '}
            <a href="/sign-in" className="text-cyan hover:underline">/sign-in</a>.
          </p>
        </>
      )}
      {status === 'error' && (
        <>
          <p className="mono text-[10px] tracking-widest uppercase text-pink">/ ERROR</p>
          <p className="font-serif italic text-[14px] text-text-dim break-words">{msg ?? 'unknown'}</p>
        </>
      )}
    </div>
  );
}
