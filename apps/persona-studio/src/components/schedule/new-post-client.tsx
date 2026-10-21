'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Send, Instagram, Link2, Loader2, AlertTriangle, Calendar, Check } from 'lucide-react';

type Source = {
  sourceType: 'video' | 'edit';
  id: string;
  mediaUrl: string;
  label: string;
  createdAt: string;
};

type Account = { id: string; platform: string; displayName: string };

function PlatformIcon({ platform }: { platform: string }) {
  if (platform === 'instagram') return <Instagram size={13} />;
  if (platform === 'telegram') return <Send size={13} />;
  return <Link2 size={13} />;
}

/** Default scheduled time: now + 1h, rounded, formatted for datetime-local. */
function defaultWhen(): string {
  const d = new Date(Date.now() + 60 * 60_000);
  d.setSeconds(0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function NewPostClient({
  sources,
  accounts,
  preselect,
}: {
  sources: Source[];
  accounts: Account[];
  preselect: { sourceType: string; id: string } | null;
}) {
  const router = useRouter();

  const initial = useMemo(() => {
    if (preselect) {
      const m = sources.find((s) => s.sourceType === preselect.sourceType && s.id === preselect.id);
      if (m) return m;
    }
    return sources[0];
  }, [sources, preselect]);

  const [selected, setSelected] = useState<Source>(initial);
  const [caption, setCaption] = useState('');
  const [accountIds, setAccountIds] = useState<string[]>(accounts.map((a) => a.id));
  const [when, setWhen] = useState(defaultWhen());
  const [publishNow, setPublishNow] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleAccount(id: string) {
    setAccountIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  async function submit() {
    setError(null);
    if (accountIds.length === 0) {
      setError('Выберите хотя бы один канал');
      return;
    }
    const scheduledAt = publishNow ? new Date().toISOString() : new Date(when).toISOString();
    setSubmitting(true);
    const res = await fetch('/api/schedule/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceType: selected.sourceType,
        sourceId: selected.id,
        caption: caption.trim() || undefined,
        scheduledAt,
        accountIds,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setSubmitting(false);
    if (!res.ok) {
      setError(json.error || `HTTP ${res.status}`);
      return;
    }
    router.push('/schedule');
    router.refresh();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      {/* ── Compose ──────────────────────── */}
      <div className="grid gap-6 content-start">
        <section className="panel p-5 sm:p-6 grid gap-4 reveal">
          <h2 className="flex items-center gap-3"><span className="sec-num">/01</span><span className="sec-title">Видео</span></h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3 max-h-[420px] overflow-y-auto p-1">
            {sources.map((s) => {
              const active = s.sourceType === selected.sourceType && s.id === selected.id;
              return (
                <button
                  key={`${s.sourceType}:${s.id}`}
                  type="button"
                  onClick={() => setSelected(s)}
                  className={`group relative aspect-square overflow-hidden rounded-2xl border bg-black/40 transition-all duration-300 ease-settle ${
                    active ? 'border-gold ring-2 ring-gold/70 scale-[0.98]' : 'border-border-soft hover:border-border-2'
                  }`}
                  title={s.label}
                >
                  {/* Sources mix landscape/portrait — a square tile with
                      object-cover crops to a uniform thumbnail (no letterbox).
                      #t=0.1 forces the browser to paint the first frame;
                      preload=metadata alone leaves the tile black. */}
                  <video
                    src={`${s.mediaUrl}#t=0.1`}
                    className="absolute inset-0 h-full w-full object-cover object-center"
                    muted
                    playsInline
                    preload="metadata"
                  />
                  <span className="absolute bottom-1.5 left-1.5 rounded-full bg-black/60 px-2 py-0.5 text-[10.5px] font-medium text-text backdrop-blur-md truncate">
                    {s.sourceType === 'edit' ? 'монтаж' : 'видео'}
                  </span>
                  {active && (
                    <span className="absolute top-1.5 right-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue text-white pop-in">
                      <Check size={14} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        <section className="panel p-5 sm:p-6 grid gap-3 reveal" style={{ ['--i' as string]: 1 } as React.CSSProperties}>
          <h2 className="flex items-center gap-3"><span className="sec-num">/02</span><span className="sec-title">Подпись</span></h2>
          <textarea
            className="input min-h-[120px] resize-y"
            placeholder="Текст поста (caption). Для Instagram — до 2200 символов, для Telegram — до 1024."
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            maxLength={2200}
          />
          <div className="text-[12px] tabular-nums text-text-mute text-right">{caption.length} / 2200</div>
        </section>
      </div>

      {/* ── Settings ─────────────────────── */}
      <div className="panel p-5 sm:p-6 grid gap-6 content-start lg:!sticky lg:top-5 reveal" style={{ ['--i' as string]: 2 } as React.CSSProperties}>
        <section className="grid gap-3">
          <h2 className="flex items-center gap-3"><span className="sec-num">/03</span><span className="sec-title">Каналы</span></h2>
          <div className="grid gap-2">
            {accounts.map((a) => (
              <label key={a.id} className="flex items-center gap-3 rounded-2xl border border-border-soft bg-white/[0.04] px-3.5 py-3 cursor-pointer transition-colors hover:bg-white/[0.07]">
                <span className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-full bg-white/[0.06] text-text-dim">
                  <PlatformIcon platform={a.platform} />
                </span>
                <span className="flex-1 truncate text-[14px] text-text">{a.displayName}</span>
                <input
                  type="checkbox"
                  className="toggle"
                  checked={accountIds.includes(a.id)}
                  onChange={() => toggleAccount(a.id)}
                />
              </label>
            ))}
          </div>
        </section>

        <section className="grid gap-3">
          <h2 className="flex items-center gap-3"><span className="sec-num">/04</span><span className="sec-title">Время</span></h2>
          <label className="flex items-center justify-between gap-3 rounded-2xl border border-border-soft bg-white/[0.04] px-3.5 py-3 text-[14px] text-text cursor-pointer">
            Опубликовать сразу
            <input type="checkbox" className="toggle" checked={publishNow} onChange={(e) => setPublishNow(e.target.checked)} />
          </label>
          {!publishNow && (
            <div className="relative flex items-center fade-in">
              <Calendar size={15} className="pointer-events-none absolute left-4 text-text-mute" />
              <input
                type="datetime-local"
                className="input flex-1 !pl-11"
                value={when}
                onChange={(e) => setWhen(e.target.value)}
              />
            </div>
          )}
        </section>

        {error && (
          <p className="rounded-2xl border border-danger/40 bg-danger/[0.08] px-3.5 py-2.5 text-[13px] text-danger flex items-center gap-2">
            <AlertTriangle size={13} /> {error}
          </p>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="btn-primary w-full"
        >
          {submitting ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
          {publishNow ? 'Опубликовать' : 'Запланировать'}
        </button>
        <p className="text-[12px] text-text-mute leading-relaxed">
          Видео публикуется по прямой ссылке из хранилища — оно должно быть публично
          доступно для серверов Instagram / Telegram.
        </p>
      </div>
    </div>
  );
}
