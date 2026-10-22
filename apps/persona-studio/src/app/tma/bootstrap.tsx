'use client';

import { useEffect, useState } from 'react';
import { Icon3D } from '@/components/ui/icon3d';
import { errorText, exceptionText } from '@/lib/error-text';

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
          setMsg(errorText(j, res.status));
          return;
        }
        setStatus('ok');
        // Hard redirect so server components see the new session cookie.
        window.location.replace('/dashboard');
      } catch (e) {
        setStatus('error');
        setMsg(exceptionText(e));
      }
    })();
  }, []);

  return (
    <div className="panel w-full max-w-sm p-7 grid gap-5 justify-items-center text-center reveal">
      <div className="flex items-center gap-3">
        <Icon3D name="sparkles" size={24} tile="purple" />
        <span className="text-[17px] font-semibold tracking-[-0.02em] lowercase">
          persona <span className="text-gold">studio</span>
        </span>
      </div>
      {status === 'init' && (
        <p className="status-badge status-queued">/ INIT</p>
      )}
      {status === 'loading' && (
        <>
          <div className="pop-in"><Icon3D name="processing" size={44} tile sway /></div>
          <p className="text-[18px] font-semibold tracking-[-0.02em]">Подключаем твой Telegram…</p>
          <p className="status-badge status-processing">/ VERIFYING</p>
        </>
      )}
      {status === 'ok' && (
        <>
          <div className="pop-in"><Icon3D name="done" size={44} tile /></div>
          <p className="text-[18px] font-semibold tracking-[-0.02em]">Готово, заходим в студию.</p>
          <p className="status-badge status-ready">/ REDIRECTING</p>
        </>
      )}
      {status === 'no-tg' && (
        <>
          <div className="pop-in"><Icon3D name="warning" size={44} tile /></div>
          <p className="status-badge status-failed">/ NO-TELEGRAM</p>
          <p className="text-[15px] leading-[1.55] text-text-dim">
            Эта страница работает только внутри Telegram Mini App. На вебе используй{' '}
            <a href="/sign-in" className="text-gold font-medium hover:underline">/sign-in</a>.
          </p>
        </>
      )}
      {status === 'error' && (
        <>
          <div className="pop-in"><Icon3D name="warning" size={44} tile /></div>
          <p className="status-badge status-failed">/ ERROR</p>
          <p className="text-[14px] leading-[1.55] text-text-dim break-words">{msg ?? 'unknown'}</p>
        </>
      )}
    </div>
  );
}
