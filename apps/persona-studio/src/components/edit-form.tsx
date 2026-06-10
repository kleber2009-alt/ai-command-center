'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { STYLE_TEMPLATES, SUBTITLE_LANGUAGES, previewUrl } from '@/lib/edit-templates';
import { Popover } from './popover';
import { EditsStepper } from './edits-stepper';

type SourceVideo = {
  id: string;
  videoUrl: string | null;
  aspect: string;
  createdAt: string;
  avatar: { id: string; styleLabel: string; imageUrl: string } | null;
  script: string | null;
};

type StepKey = 'video' | 'style' | 'language' | 'options' | 'go';

// Детерминированный градиент по имени шаблона (когда нет preview-jpg).
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
  const [activeStep, setActiveStep] = useState<StepKey>('style'); // видео уже выбрано через URL → начинаем со стиля
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [styleQuery, setStyleQuery] = useState('');

  // Какие popover-карточки открыты (одна одновременно).
  const [openCard, setOpenCard] = useState<'video' | 'style' | 'language' | 'options' | null>(null);

  // Anchor refs для popover-positioning.
  const videoRef = useRef<HTMLButtonElement | null>(null);
  const styleRef = useRef<HTMLButtonElement | null>(null);
  const langRef = useRef<HTMLButtonElement | null>(null);
  const optionsRef = useRef<HTMLButtonElement | null>(null);

  const selected = useMemo(() => videos.find((v) => v.id === videoId), [videos, videoId]);
  const preset = useMemo(() => STYLE_TEMPLATES.find((t) => t.name === template), [template]);
  const lang = SUBTITLE_LANGUAGES.find((l) => l.code === subtitleLanguage);

  const aspectClass =
    selected?.aspect === '1:1' ? 'aspect-square' : selected?.aspect === '16:9' ? 'aspect-video' : 'aspect-[9/16]';

  const filteredStyles = useMemo(() => {
    const q = styleQuery.trim().toLowerCase();
    if (!q) return STYLE_TEMPLATES;
    return STYLE_TEMPLATES.filter(
      (t) => t.name.toLowerCase().includes(q) || t.tags.some((tag) => tag.includes(q)),
    );
  }, [styleQuery]);

  // Cmd/Ctrl+Enter — submit
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        if (!busy && videoId) submit();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, videoId, template, subtitlesEnabled, subtitleLanguage, brollsEnabled]);

  const steps = [
    { key: 'video', label: 'Видео', done: !!videoId },
    { key: 'style', label: 'Стиль', done: !!template },
    { key: 'language', label: 'Язык', done: !!subtitleLanguage },
    { key: 'options', label: 'Опции', done: true },
    { key: 'go', label: 'Готово', done: false },
  ];

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
        } else if (code === 'submagic_not_configured') {
          setError('Монтаж временно недоступен. Попробуй позже.');
        } else if (code === 'video_not_ready') {
          setError('Видео ещё не готово — дождись окончания рендера.');
        } else if (code === 'enqueue_failed') {
          setError('Не удалось поставить монтаж в очередь. Токены возвращены, попробуй ещё раз.');
        } else {
          setError(`Не удалось запустить монтаж (${code}). Попробуй ещё раз.`);
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
    <div className="grid gap-4">
      {/* Stepper */}
      <EditsStepper steps={steps} activeKey={activeStep} onJump={(k) => setActiveStep(k as StepKey)} />

      <div className="grid lg:grid-cols-[1fr_380px] gap-5 items-start">
        {/* PREVIEW */}
        <section className="relative">
          <div className={`relative ${aspectClass} max-h-[calc(100vh-220px)] mx-auto bg-bg border border-border overflow-hidden`}>
            {selected?.videoUrl ? (
              <video
                src={selected.videoUrl}
                muted
                loop
                playsInline
                autoPlay
                preload="metadata"
                poster={selected.avatar?.imageUrl ?? undefined}
                className="w-full h-full object-cover"
              />
            ) : (
              <div
                className="absolute inset-0"
                style={{
                  background: selected?.avatar?.imageUrl
                    ? `linear-gradient(180deg, rgba(8,8,8,0) 0%, rgba(8,8,8,0.7) 100%), url(${selected.avatar.imageUrl})`
                    : 'linear-gradient(170deg, #0a1820 0%, #051018 100%)',
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }}
              />
            )}
            {/* Overlay summary */}
            <div className="absolute top-2 left-2 right-2 flex items-start justify-between gap-2">
              <span className="mono text-[9px] tracking-widest uppercase font-bold bg-bg/80 backdrop-blur px-2 py-1">
                /preview · {selected?.aspect ?? '9:16'}
              </span>
              <span className="mono text-[9px] tracking-widest uppercase font-bold bg-bg/80 backdrop-blur px-2 py-1 text-lime">
                {preset?.name ?? template}
              </span>
            </div>
            <div className="absolute bottom-2 left-2 right-2 flex items-end justify-between gap-2 pointer-events-none">
              <div className="flex flex-wrap gap-1.5">
                {subtitlesEnabled && (
                  <span className="mono text-[9px] tracking-widest uppercase bg-bg/80 backdrop-blur px-2 py-1">
                    cc · {subtitleLanguage.toUpperCase()}
                  </span>
                )}
                {brollsEnabled && (
                  <span className="mono text-[9px] tracking-widest uppercase bg-lime/85 text-bg backdrop-blur px-2 py-1 font-bold">
                    B-rolls
                  </span>
                )}
              </div>
              <span className="mono text-[9px] tracking-widest uppercase text-text-mute bg-bg/80 backdrop-blur px-2 py-1">
                {selected?.avatar?.styleLabel ?? '—'}
              </span>
            </div>
          </div>
        </section>

        {/* RIGHT COLUMN — карточки + CTA */}
        <aside className="grid gap-2.5">
          {/* CARD 1 — Видео */}
          <div className="relative">
            <button
              ref={videoRef}
              type="button"
              onClick={() => {
                setActiveStep('video');
                setOpenCard((c) => (c === 'video' ? null : 'video'));
              }}
              className={`w-full text-left border bg-surface px-3 py-2.5 hover:border-border-2 transition-colors ${
                activeStep === 'video' ? 'border-lime' : 'border-border'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="grid gap-0.5 min-w-0">
                  <span className="mono text-[9px] tracking-widest uppercase text-text-mute">01 · Видео</span>
                  <span className="font-serif text-[14px] truncate">
                    {selected?.avatar?.styleLabel ?? '—'} · {selected ? selected.id.slice(0, 6) : '—'}
                  </span>
                </div>
                <span className="mono text-[10px] text-text-dim shrink-0">▾</span>
              </div>
            </button>
            <Popover open={openCard === 'video'} onClose={() => setOpenCard(null)} anchorRef={videoRef} width={320}>
              <div className="p-3 border-b border-border flex items-center justify-between">
                <span className="mono text-[10px] tracking-widest uppercase">Видео · {videos.length}</span>
                <button onClick={() => setOpenCard(null)} className="mono text-[14px] text-text-mute hover:text-text">×</button>
              </div>
              <div className="p-2 max-h-[320px] overflow-auto grid grid-cols-3 gap-1.5">
                {videos.map((v) => {
                  const active = v.id === videoId;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => {
                        setVideoId(v.id);
                        setOpenCard(null);
                        setActiveStep('style');
                      }}
                      className={`relative aspect-square overflow-hidden border ${
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
                              ? `url(${v.avatar.imageUrl}) center/cover`
                              : 'linear-gradient(170deg, #0a1820, #051018)',
                          }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </Popover>
          </div>

          {/* CARD 2 — Стиль */}
          <div className="relative">
            <button
              ref={styleRef}
              type="button"
              onClick={() => {
                setActiveStep('style');
                setOpenCard((c) => (c === 'style' ? null : 'style'));
              }}
              className={`w-full text-left border bg-surface px-3 py-2.5 hover:border-border-2 transition-colors ${
                activeStep === 'style' ? 'border-lime' : 'border-border'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="grid gap-0.5 min-w-0">
                  <span className="mono text-[9px] tracking-widest uppercase text-text-mute">02 · Стиль</span>
                  <span className="font-serif text-[14px] truncate">
                    {preset?.name ?? template}
                    {preset && (
                      <span className="text-text-mute text-[12px]"> · {preset.tags.slice(0, 2).join(', ')}</span>
                    )}
                  </span>
                </div>
                <span className="mono text-[10px] text-text-dim shrink-0">▾</span>
              </div>
            </button>
            <Popover open={openCard === 'style'} onClose={() => setOpenCard(null)} anchorRef={styleRef} width={360}>
              <div className="p-3 border-b border-border flex items-center gap-2">
                <input
                  type="search"
                  value={styleQuery}
                  onChange={(ev) => setStyleQuery(ev.target.value)}
                  placeholder="имя или тег…"
                  autoFocus
                  className="flex-1 bg-bg border border-border px-2 py-1.5 mono text-[11px]"
                />
                <button onClick={() => setOpenCard(null)} className="mono text-[14px] text-text-mute hover:text-text">×</button>
              </div>
              <div className="p-2 max-h-[360px] overflow-auto grid grid-cols-3 gap-1.5">
                {filteredStyles.map((t) => {
                  const active = t.name === template;
                  return (
                    <button
                      key={t.name}
                      type="button"
                      onClick={() => {
                        setTemplate(t.name);
                        setOpenCard(null);
                        setActiveStep('language');
                      }}
                      className={`relative aspect-[4/5] overflow-hidden border text-left ${
                        active ? 'border-lime ring-2 ring-lime' : 'border-border hover:border-border-2'
                      }`}
                    >
                      <div className="absolute inset-0" style={{ background: gradientFor(t.name) }} />
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={previewUrl(t.name)}
                        alt=""
                        loading="lazy"
                        onError={(ev) => ((ev.currentTarget as HTMLImageElement).style.display = 'none')}
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-transparent" />
                      <div className="absolute inset-x-0 bottom-0 p-1.5">
                        <div className="font-serif italic text-[12px] leading-tight">{t.name}</div>
                        <div className="mono text-[7.5px] tracking-widest text-text-mute line-clamp-1">
                          {t.tags.join(' · ')}
                        </div>
                      </div>
                    </button>
                  );
                })}
                {filteredStyles.length === 0 && (
                  <div className="col-span-full p-6 text-center mono text-[11px] text-text-mute">
                    Ничего не найдено
                  </div>
                )}
              </div>
            </Popover>
          </div>

          {/* CARD 3 — Язык */}
          <div className="relative">
            <button
              ref={langRef}
              type="button"
              onClick={() => {
                setActiveStep('language');
                setOpenCard((c) => (c === 'language' ? null : 'language'));
              }}
              className={`w-full text-left border bg-surface px-3 py-2.5 hover:border-border-2 transition-colors ${
                activeStep === 'language' ? 'border-lime' : 'border-border'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="grid gap-0.5 min-w-0">
                  <span className="mono text-[9px] tracking-widest uppercase text-text-mute">03 · Язык субтитров</span>
                  <span className="font-serif text-[14px] truncate">
                    {lang?.label ?? subtitleLanguage}
                    <span className="text-text-mute text-[12px]"> · {subtitleLanguage.toUpperCase()}</span>
                  </span>
                </div>
                <span className="mono text-[10px] text-text-dim shrink-0">▾</span>
              </div>
            </button>
            <Popover open={openCard === 'language'} onClose={() => setOpenCard(null)} anchorRef={langRef} width={220}>
              <ul className="py-1 max-h-[280px] overflow-auto">
                {SUBTITLE_LANGUAGES.map((l) => {
                  const active = l.code === subtitleLanguage;
                  return (
                    <li key={l.code}>
                      <button
                        type="button"
                        onClick={() => {
                          setSubtitleLanguage(l.code);
                          setOpenCard(null);
                          setActiveStep('options');
                        }}
                        className={`w-full text-left px-3 py-2 mono text-[12px] flex items-center justify-between hover:bg-surface ${
                          active ? 'text-lime' : 'text-text'
                        }`}
                      >
                        <span>{l.label}</span>
                        <span className="text-text-mute text-[10px] tracking-widest">{l.code.toUpperCase()}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Popover>
          </div>

          {/* CARD 4 — Опции (subtitles + brolls) */}
          <div className="relative">
            <button
              ref={optionsRef}
              type="button"
              onClick={() => {
                setActiveStep('options');
                setOpenCard((c) => (c === 'options' ? null : 'options'));
              }}
              className={`w-full text-left border bg-surface px-3 py-2.5 hover:border-border-2 transition-colors ${
                activeStep === 'options' ? 'border-lime' : 'border-border'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="grid gap-0.5 min-w-0">
                  <span className="mono text-[9px] tracking-widest uppercase text-text-mute">04 · Опции</span>
                  <span className="font-serif text-[14px] truncate">
                    {subtitlesEnabled ? 'CC on' : 'CC off'} · {brollsEnabled ? <span className="text-lime">B-rolls on</span> : 'B-rolls off'}
                  </span>
                </div>
                <span className="mono text-[10px] text-text-dim shrink-0">▾</span>
              </div>
            </button>
            <Popover open={openCard === 'options'} onClose={() => setOpenCard(null)} anchorRef={optionsRef} width={300}>
              <div className="p-3 grid gap-3">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={subtitlesEnabled}
                    onChange={(ev) => setSubtitlesEnabled(ev.target.checked)}
                    className="w-4 h-4 mt-0.5"
                  />
                  <div className="grid gap-1 min-w-0">
                    <span className="mono text-[11px] tracking-widest uppercase">Субтитры</span>
                    <span className="font-serif italic text-[11.5px] text-text-dim">
                      Submagic всегда накладывает captions в стиле шаблона.
                    </span>
                  </div>
                </label>
                <label className="flex items-start gap-3 cursor-pointer border-t border-border pt-3">
                  <input
                    type="checkbox"
                    checked={brollsEnabled}
                    onChange={(ev) => setBrollsEnabled(ev.target.checked)}
                    className="w-4 h-4 mt-0.5"
                  />
                  <div className="grid gap-1 min-w-0">
                    <span className="mono text-[11px] tracking-widest uppercase">Magic B-rolls</span>
                    <span className="font-serif italic text-[11.5px] text-text-dim">
                      Авто-вставка релевантных сток-кадров. +1–2 мин рендера.
                    </span>
                  </div>
                </label>
              </div>
            </Popover>
          </div>

          {/* FOOTER */}
          <div className="grid gap-2 mt-1">
            {error && (
              <div className="mono text-[11px] text-pink border border-pink/60 bg-pink/10 px-3 py-2">{error}</div>
            )}
            <div className="flex items-center justify-between gap-3">
              <span className="mono text-[10px] tracking-widest uppercase text-text-mute">
                {cost} токенов · <kbd className="text-text-dim">⌘↵</kbd>
              </span>
              <button
                type="button"
                onClick={submit}
                disabled={busy || !videoId}
                className="btn-primary justify-center disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {busy ? 'Запускаем…' : 'Запустить монтаж →'}
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
