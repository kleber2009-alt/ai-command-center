'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { t, type Locale } from '@/lib/i18n';

const SUGGESTIONS = [
  { label: 'Viral Reel about habits', target: '/videos/new' },
  { label: 'Motivational carousel', target: '/carousels' },
  { label: 'Talking video about AI', target: '/videos/new' },
  { label: 'Productivity tips video', target: '/videos/new' },
];

export function AIDirectorBar({ locale }: { locale: Locale }) {
  const [collapsed, setCollapsed] = useState(false);
  const [prompt, setPrompt] = useState('');
  const router = useRouter();

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) return;
    // UI-only orchestrator on first iteration: route the brief to /videos/new with the
    // user's text in query string so the existing video form can pre-fill the script.
    router.push(`/videos/new?brief=${encodeURIComponent(prompt.trim())}`);
  }

  if (collapsed) {
    return (
      <div className="fixed bottom-4 right-4 z-30">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="btn-ghost shadow-editorial"
          title={t('Open AI Director', locale)}
        >
          <span className="text-gold mono text-[10px]">◆</span>
          <span>{t('AI Director', locale)}</span>
        </button>
      </div>
    );
  }

  return (
    <div className="sticky bottom-0 z-20 mt-12">
      <div className="mx-3 mb-3 lg:mx-8 lg:mb-5 panel shadow-editorial p-4 lg:p-5 backdrop-blur bg-bg-panel/95">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <div className="flex items-center gap-2 mono text-[9px] tracking-[0.28em] uppercase">
              <span className="text-gold">◆ {t('AI Director', locale)}</span>
              <span className="text-text-muted">· {t('beta', locale)}</span>
            </div>
            <div className="mt-1 font-serif italic text-[13px] text-text-secondary">
              {t('Tell AI what to create. It will handle the rest.', locale)}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            className="mono text-[10px] tracking-[0.22em] uppercase text-text-muted hover:text-gold"
            aria-label={t('Collapse director bar', locale)}
          >
            {t('hide', locale)}
          </button>
        </div>

        <form onSubmit={handleSend} className="flex items-stretch gap-2">
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={t('What do you want to create today?', locale)}
            className="input flex-1"
          />
          <button type="submit" className="btn-primary" disabled={!prompt.trim()}>
            {t('send', locale)}
          </button>
        </form>

        <div className="mt-3 flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => router.push(s.target)}
              className="mono text-[10px] tracking-[0.18em] uppercase px-3 py-1.5 border border-border-soft text-text-secondary hover:border-gold/60 hover:text-gold transition-colors rounded-sm"
            >
              {t(s.label, locale)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
