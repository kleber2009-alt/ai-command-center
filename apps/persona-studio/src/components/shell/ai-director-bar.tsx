'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowUp, ChevronDown, Loader2 } from 'lucide-react';
import { t, type Locale } from '@/lib/i18n';
import { Icon3D } from '@/components/ui/icon3d';

const SUGGESTIONS = [
  'Viral Reel about habits',
  'Motivational carousel',
  'Talking video about AI',
  'Productivity tips video',
];

const STORAGE_KEY = 'ps.director.collapsed';
/** Pages with their own full-height editors — the bar would cover their footer. */
const HIDDEN_ON = [/^\/carousels\/new/, /^\/briefs\/[^/]+$/];

/**
 * AI Director (reels-ui-motion PromptInput): a glass capsule with a round blue
 * ↑ button. Sending creates a Workspace brief with the text as its topic and
 * opens it — brief → script → video → montage happen there.
 */
export function AIDirectorBar({ locale }: { locale: Locale }) {
  const pathname = usePathname() || '';
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(STORAGE_KEY) === '1');
    } catch {
      /* storage unavailable — keep expanded */
    }
  }, []);

  function setCollapsedPersist(v: boolean) {
    setCollapsed(v);
    try {
      localStorage.setItem(STORAGE_KEY, v ? '1' : '0');
    } catch {
      /* ignore */
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const topic = prompt.trim();
    if (!topic || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/briefs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ topic }),
      });
      const j = (await res.json().catch(() => ({}))) as { brief?: { id: string } };
      if (!res.ok || !j.brief?.id) throw new Error(String(res.status));
      setPrompt('');
      router.push(`/briefs/${j.brief.id}`);
    } catch {
      setError(t('Could not create a brief — try again', locale));
    } finally {
      setBusy(false);
    }
  }

  if (HIDDEN_ON.some((re) => re.test(pathname))) return null;

  if (collapsed) {
    return (
      <div className="fixed bottom-4 right-4 z-30 pop-in">
        <button type="button" onClick={() => setCollapsedPersist(false)} className="btn-ghost shadow-glass" title={t('Open AI Director', locale)}>
          <Icon3D name="magic" size={20} />
          <span>{t('AI Director', locale)}</span>
        </button>
      </div>
    );
  }

  return (
    <div className="sticky bottom-0 z-20 mt-12">
      <div className="panel shadow-glass mx-3 mb-3 p-4 lg:mx-8 lg:mb-5 lg:p-5 !bg-[rgba(20,20,25,0.86)] reveal">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <Icon3D name="magic" size={22} tile="purple" sway />
            <div>
              <div className="flex items-center gap-2 text-[14px] font-semibold">
                {t('AI Director', locale)}
                <span className="rounded-full bg-pink/15 px-2 py-0.5 text-[11px] font-semibold text-pink">{t('beta', locale)}</span>
              </div>
              <div className="text-[13px] text-text-mute">{t('Describe the content — AI will draft the brief and script.', locale)}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setCollapsedPersist(true)}
            className="btn-icon !h-8 !w-8"
            aria-label={t('Collapse director bar', locale)}
            title={t('hide', locale)}
          >
            <ChevronDown size={16} />
          </button>
        </div>

        <form onSubmit={handleSend} className="relative">
          <input
            ref={inputRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={t('What do you want to create today?', locale)}
            aria-label={t('What do you want to create today?', locale)}
            className="input !rounded-full !py-3.5 !pl-5 !pr-14 !text-[15px]"
            maxLength={2000}
          />
          <button
            type="submit"
            disabled={!prompt.trim() || busy}
            aria-label={t('send', locale)}
            className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-blue text-white shadow-[0_6px_18px_rgba(31,123,255,0.45)] transition-[transform,opacity] duration-300 ease-pop hover:scale-105 active:scale-95 disabled:opacity-35 disabled:shadow-none"
          >
            {busy ? <Loader2 size={18} className="animate-spin" /> : <ArrowUp size={18} strokeWidth={2.5} />}
          </button>
        </form>
        {error && <div className="mt-2 text-[13px] text-danger">{error}</div>}

        <div className="mt-3 flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setPrompt(t(s, locale));
                inputRef.current?.focus();
              }}
              className="rounded-full border border-border-soft bg-white/[0.04] px-3.5 py-1.5 text-[13px] text-text-dim transition-colors hover:border-gold/50 hover:bg-blue/10 hover:text-white"
            >
              {t(s, locale)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
