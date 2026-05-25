'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { EDIT_TEMPLATES, SUBTITLE_LANGUAGES, type EditTemplate } from '@/lib/edit-templates';

type SourceVideo = {
  id: string;
  videoUrl: string | null;
  aspect: string;
  createdAt: string;
  avatar: { id: string; styleLabel: string; imageUrl: string } | null;
  script: string | null;
};

export function EditForm({
  videos,
  initialVideoId,
  cost,
}: {
  videos: SourceVideo[];
  initialVideoId?: string;
  cost: number;
}) {
  const router = useRouter();

  const resolvedInitial =
    initialVideoId && videos.some((v) => v.id === initialVideoId)
      ? initialVideoId
      : (videos[0]?.id ?? '');
  const [videoId, setVideoId] = useState<string>(resolvedInitial);
  const [template, setTemplate] = useState<EditTemplate>('hormozi');
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(true);
  const [subtitleLanguage, setSubtitleLanguage] = useState('ru');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(() => videos.find((v) => v.id === videoId), [videos, videoId]);
  const preset = useMemo(() => EDIT_TEMPLATES.find((t) => t.slug === template), [template]);

  async function submit() {
    if (!videoId) {
      setError('Выбери исходное видео.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/edits', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          videoGenerationId: videoId,
          template,
          subtitlesEnabled,
          subtitleLanguage,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const code = (body && (body.error as string)) ?? `http_${res.status}`;
        if (code === 'insufficient_tokens') {
          setError(`Не хватает токенов: нужно ${body.need}, у тебя ${body.have}. Пополни баланс.`);
        } else {
          setError(`Не удалось запустить монтаж: ${code}`);
        }
        return;
      }
      router.push(`/edits?focus=${body.id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid lg:grid-cols-[1fr_360px] gap-8 items-start">
      <div className="grid gap-6">
        {/* Источник */}
        <section className="grid gap-3">
          <div className="sec-num">/01 source video</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {videos.map((v) => {
              const active = v.id === videoId;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setVideoId(v.id)}
                  className={`relative aspect-[9/16] border overflow-hidden text-left ${
                    active ? 'border-lime ring-2 ring-lime' : 'border-border hover:border-border-2'
                  }`}
                >
                  {v.videoUrl ? (
                    <video
                      src={v.videoUrl}
                      muted
                      playsInline
                      preload="metadata"
                      className="w-full h-full object-cover pointer-events-none"
                      poster={v.avatar?.imageUrl ?? undefined}
                    />
                  ) : (
                    <div
                      className="absolute inset-0"
                      style={{
                        background: v.avatar?.imageUrl
                          ? `linear-gradient(180deg, rgba(8,8,8,0) 0%, rgba(8,8,8,0.7) 100%), url(${v.avatar.imageUrl})`
                          : 'linear-gradient(170deg, #0a1820 0%, #051018 100%)',
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                      }}
                    />
                  )}
                  <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
                    <div className="mono text-[9px] tracking-widest text-text">{v.avatar?.styleLabel ?? '—'}</div>
                    <div className="mono text-[8px] tracking-widest text-text-mute">{v.aspect} · {v.id.slice(0, 6)}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Шаблон */}
        <section className="grid gap-3">
          <div className="sec-num">/02 template</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {EDIT_TEMPLATES.map((t) => {
              const active = t.slug === template;
              return (
                <button
                  key={t.slug}
                  type="button"
                  onClick={() => setTemplate(t.slug)}
                  className={`border p-3 text-left transition-colors ${
                    active ? 'border-lime bg-surface' : 'border-border hover:border-border-2 bg-bg'
                  }`}
                >
                  <div className="mono text-[11px] tracking-widest uppercase font-bold">{t.label}</div>
                  <div className="font-serif italic text-[13px] text-text-dim mt-1 leading-snug">{t.description}</div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Субтитры */}
        <section className="grid gap-3">
          <div className="sec-num">/03 subtitles</div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={subtitlesEnabled}
              onChange={(ev) => setSubtitlesEnabled(ev.target.checked)}
              className="w-4 h-4"
            />
            <span className="mono text-[12px] tracking-widest uppercase">Включить субтитры</span>
          </label>
          {subtitlesEnabled && (
            <div className="grid gap-2 max-w-[280px]">
              <label className="mono text-[10px] tracking-widest uppercase text-text-mute">Язык</label>
              <select
                value={subtitleLanguage}
                onChange={(ev) => setSubtitleLanguage(ev.target.value)}
                className="bg-bg border border-border px-3 py-2 mono text-[12px]"
              >
                {SUBTITLE_LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </section>
      </div>

      {/* Sidebar */}
      <aside className="border border-border bg-surface p-5 grid gap-4 lg:sticky lg:top-24">
        <div className="grid gap-1">
          <div className="sec-num">/summary</div>
          <h2 className="font-serif italic text-[22px] leading-tight">Монтаж готов к запуску.</h2>
        </div>

        <dl className="grid gap-2 mono text-[11px] tracking-widest uppercase">
          <div className="flex justify-between gap-3">
            <dt className="text-text-mute">video</dt>
            <dd className="text-text truncate">{selected ? selected.id.slice(0, 8) : '—'}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-text-mute">template</dt>
            <dd className="text-text">{preset?.label ?? '—'}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-text-mute">subtitles</dt>
            <dd className="text-text">{subtitlesEnabled ? `on · ${subtitleLanguage}` : 'off'}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-text-mute">cost</dt>
            <dd className="text-lime">{cost} токенов</dd>
          </div>
        </dl>

        {error && (
          <div className="mono text-[11px] text-pink border border-pink/60 bg-pink/10 px-3 py-2">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={busy || !videoId}
          className="btn-primary justify-center disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? 'Запускаем…' : 'Запустить монтаж →'}
        </button>
        <p className="mono text-[10px] tracking-widest text-text-mute">
          Submagic рендерит обычно 3–8 минут. Готовое видео появится на /edits.
        </p>
      </aside>
    </div>
  );
}
