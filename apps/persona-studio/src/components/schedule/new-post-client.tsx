'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Send, Instagram, Link2, Loader2, AlertTriangle, Calendar } from 'lucide-react';

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
    <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
      {/* ── Compose ──────────────────────── */}
      <div className="grid gap-6">
        <section className="grid gap-3">
          <h2 className="sec-title">Видео</h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-3 max-h-[380px] overflow-y-auto pr-1">
            {sources.map((s) => {
              const active = s.sourceType === selected.sourceType && s.id === selected.id;
              return (
                <button
                  key={`${s.sourceType}:${s.id}`}
                  onClick={() => setSelected(s)}
                  className={`relative aspect-[9/16] overflow-hidden rounded-sm border bg-black/40 ${
                    active ? 'border-gold ring-1 ring-gold' : 'border-border-soft'
                  }`}
                  title={s.label}
                >
                  {/* #t=0.1 forces the browser to paint the first frame as a
                      poster — otherwise preload=metadata leaves the tile black. */}
                  <video
                    src={`${s.mediaUrl}#t=0.1`}
                    className="w-full h-full object-cover"
                    muted
                    playsInline
                    preload="metadata"
                  />
                  <span className="absolute bottom-0 inset-x-0 bg-black/60 text-[9px] mono uppercase tracking-[0.14em] px-1 py-0.5 truncate">
                    {s.sourceType === 'edit' ? 'монтаж' : 'видео'}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="grid gap-3">
          <h2 className="sec-title">Подпись</h2>
          <textarea
            className="input min-h-[120px] resize-y"
            placeholder="Текст поста (caption). Для Instagram — до 2200 символов, для Telegram — до 1024."
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            maxLength={2200}
          />
          <div className="mono text-[10px] text-text-muted text-right">{caption.length} / 2200</div>
        </section>
      </div>

      {/* ── Settings ─────────────────────── */}
      <div className="grid gap-6 content-start">
        <section className="grid gap-3">
          <h2 className="sec-title">Каналы</h2>
          <div className="grid gap-2">
            {accounts.map((a) => (
              <label key={a.id} className="card flex items-center gap-3 p-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={accountIds.includes(a.id)}
                  onChange={() => toggleAccount(a.id)}
                />
                <PlatformIcon platform={a.platform} />
                <span className="text-[13px]">{a.displayName}</span>
              </label>
            ))}
          </div>
        </section>

        <section className="grid gap-3">
          <h2 className="sec-title">Время</h2>
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={publishNow} onChange={(e) => setPublishNow(e.target.checked)} />
            Опубликовать сразу
          </label>
          {!publishNow && (
            <div className="flex items-center gap-2">
              <Calendar size={14} className="text-text-muted" />
              <input
                type="datetime-local"
                className="input flex-1"
                value={when}
                onChange={(e) => setWhen(e.target.value)}
              />
            </div>
          )}
        </section>

        {error && (
          <p className="mono text-[12px] text-red-400 flex items-center gap-1.5">
            <AlertTriangle size={13} /> {error}
          </p>
        )}

        <button
          onClick={submit}
          disabled={submitting}
          className="btn-primary inline-flex items-center justify-center gap-2"
        >
          {submitting ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
          {publishNow ? 'Опубликовать' : 'Запланировать'}
        </button>
        <p className="font-serif italic text-[11px] text-text-muted leading-relaxed">
          Видео публикуется по прямой ссылке из хранилища — оно должно быть публично
          доступно для серверов Instagram / Telegram.
        </p>
      </div>
    </div>
  );
}
