'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { STYLE_TEMPLATES, SUBTITLE_LANGUAGES } from '@/lib/edit-templates';

type SourceVideo = {
  id: string;
  videoUrl: string | null;
  aspect: string;
  createdAt: string;
  avatar: { id: string; styleLabel: string; imageUrl: string } | null;
  script: string | null;
};

// Детерминированный градиент по имени шаблона — preview-плейсхолдер
// (Submagic не отдаёт превьюшки через API).
function gradientFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const a = h % 360;
  const b = (a + 50 + (h % 90)) % 360;
  return `linear-gradient(150deg, hsl(${a} 55% 22%) 0%, hsl(${b} 60% 14%) 100%)`;
}

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
  const [template, setTemplate] = useState<string>('Hormozi 2');
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(true);
  const [subtitleLanguage, setSubtitleLanguage] = useState('ru');
  const [brollsEnabled, setBrollsEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [styleQuery, setStyleQuery] = useState('');

  const selected = useMemo(() => videos.find((v) => v.id === videoId), [videos, videoId]);
  const preset = useMemo(() => STYLE_TEMPLATES.find((t) => t.name === template), [template]);

  const filtered = useMemo(() => {
    const q = styleQuery.trim().toLowerCase();
    if (!q) return STYLE_TEMPLATES;
    return STYLE_TEMPLATES.filter(
      (t) => t.name.toLowerCase().includes(q) || t.tags.some((tag) => tag.includes(q)),
    );
  }, [styleQuery]);

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
          brollsEnabled,
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

        {/* Стиль / шаблон */}
        <section className="grid gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <div className="sec-num">/02 style · {STYLE_TEMPLATES.length} templates</div>
            <input
              type="search"
              value={styleQuery}
              onChange={(ev) => setStyleQuery(ev.target.value)}
              placeholder="поиск по имени или тегу…"
              className="bg-bg border border-border px-3 py-1.5 mono text-[11px] min-w-[220px]"
            />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {filtered.map((t) => {
              const active = t.name === template;
              return (
                <button
                  key={t.name}
                  type="button"
                  onClick={() => setTemplate(t.name)}
                  className={`relative aspect-[4/5] border overflow-hidden text-left transition-all group ${
                    active ? 'border-lime ring-2 ring-lime' : 'border-border hover:border-border-2'
                  }`}
                >
                  <div className="absolute inset-0" style={{ background: gradientFor(t.name) }} />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-transparent" />
                  <div className="absolute top-2 right-2">
                    {active && (
                      <span className="mono text-[8px] tracking-widest uppercase font-bold bg-lime text-bg px-1.5 py-0.5">
                        ✓
                      </span>
                    )}
                  </div>
                  <div className="absolute inset-x-0 bottom-0 p-2.5">
                    <div className="font-serif italic text-[16px] leading-tight text-text">{t.name}</div>
                    <div className="mono text-[8.5px] tracking-widest text-text-mute mt-1 line-clamp-2">
                      {t.tags.join(' · ')}
                    </div>
                  </div>
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div className="col-span-full border border-border-2 border-dashed p-6 text-center mono text-[11px] text-text-mute">
                Ничего не нашлось по «{styleQuery}»
              </div>
            )}
          </div>
        </section>

        {/* Опции монтажа */}
        <section className="grid gap-3">
          <div className="sec-num">/03 options</div>
          <div className="grid gap-3 border border-border bg-surface p-4">
            {/* Субтитры */}
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={subtitlesEnabled}
                onChange={(ev) => setSubtitlesEnabled(ev.target.checked)}
                className="w-4 h-4 mt-0.5"
              />
              <div className="grid gap-1">
                <span className="mono text-[12px] tracking-widest uppercase">Субтитры</span>
                <span className="font-serif italic text-[12px] text-text-dim">
                  Submagic всегда накладывает captions в стиле выбранного шаблона.
                </span>
              </div>
            </label>

            {subtitlesEnabled && (
              <div className="grid gap-1.5 pl-7 max-w-[280px]">
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

            {/* B-rolls */}
            <label className="flex items-start gap-3 cursor-pointer pt-2 border-t border-border">
              <input
                type="checkbox"
                checked={brollsEnabled}
                onChange={(ev) => setBrollsEnabled(ev.target.checked)}
                className="w-4 h-4 mt-0.5"
              />
              <div className="grid gap-1">
                <span className="mono text-[12px] tracking-widest uppercase">Magic B-rolls</span>
                <span className="font-serif italic text-[12px] text-text-dim">
                  Submagic подберёт релевантные сток-кадры под смысл реплик и врежет их между планами. Удлиняет рендер на 1–2 минуты.
                </span>
              </div>
            </label>
          </div>
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
            <dt className="text-text-mute">style</dt>
            <dd className="text-text">{preset?.name ?? template}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-text-mute">subtitles</dt>
            <dd className="text-text">{subtitlesEnabled ? `on · ${subtitleLanguage}` : 'off'}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-text-mute">b-rolls</dt>
            <dd className={brollsEnabled ? 'text-lime' : 'text-text'}>{brollsEnabled ? 'on' : 'off'}</dd>
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
