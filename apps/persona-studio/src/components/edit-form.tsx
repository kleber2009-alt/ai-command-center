'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { STYLE_TEMPLATES, SUBTITLE_LANGUAGES, previewUrl, templateSlug } from '@/lib/edit-templates';
import { ArrowRight, ChevronDown, Loader2, Search, X } from 'lucide-react';
import { Popover } from './popover';
import { EditsStepper } from './edits-stepper';
import { exceptionText } from '@/lib/error-text';

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
  previews = [],
}: {
  videos: SourceVideo[];
  initialVideoId?: string;
  cost: number;
  /** Slugs that have a shipped /template-previews/<slug>.jpg — others use the gradient. */
  previews?: string[];
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
        } else {
          setError(`Не удалось запустить монтаж: ${code}`);
        }
        return;
      }
      router.push(`/edits?focus=${body.id}`);
      router.refresh();
    } catch (e) {
      setError(exceptionText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      {/* Stepper */}
      <EditsStepper steps={steps} activeKey={activeStep} onJump={(k) => setActiveStep(k as StepKey)} />

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_380px]">
        {/* PREVIEW */}
        <section className="relative">
          <div className={`relative ${aspectClass} mx-auto max-h-[calc(100vh-220px)] overflow-hidden rounded-[24px] border border-border-soft bg-bg shadow-glass`}>
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
                    : 'linear-gradient(170deg, rgba(31,123,255,0.22) 0%, rgba(11,11,13,1) 100%)',
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }}
              />
            )}
            {/* Overlay summary */}
            <div className="absolute left-3 right-3 top-3 flex items-start justify-between gap-2">
              <span className="rounded-full bg-bg/75 px-2.5 py-1 text-[11px] font-semibold text-text backdrop-blur">
                /превью · {selected?.aspect ?? '9:16'}
              </span>
              <span className="rounded-full bg-blue px-2.5 py-1 text-[11px] font-semibold text-white">
                {preset?.name ?? template}
              </span>
            </div>
            <div className="pointer-events-none absolute bottom-3 left-3 right-3 flex items-end justify-between gap-2">
              <div className="flex flex-wrap gap-1.5">
                {subtitlesEnabled && (
                  <span className="rounded-full bg-bg/75 px-2.5 py-1 text-[11px] font-semibold uppercase text-text backdrop-blur">
                    субт. · {subtitleLanguage.toUpperCase()}
                  </span>
                )}
                {brollsEnabled && (
                  <span className="rounded-full bg-lime px-2.5 py-1 text-[11px] font-semibold text-bg">
                    перебивки
                  </span>
                )}
              </div>
              <span className="rounded-full bg-bg/75 px-2.5 py-1 text-[11px] text-text-dim backdrop-blur">
                {selected?.avatar?.styleLabel ?? '—'}
              </span>
            </div>
          </div>
        </section>

        {/* RIGHT COLUMN — карточки + CTA */}
        <aside className="stagger grid gap-3">
          {/* CARD 1 — Видео */}
          <div className="relative">
            <button
              ref={videoRef}
              type="button"
              onClick={() => {
                setActiveStep('video');
                setOpenCard((c) => (c === 'video' ? null : 'video'));
              }}
              className={`w-full rounded-[20px] border px-4 py-3 text-left backdrop-blur-xl transition-colors ${
                activeStep === 'video'
                  ? 'border-gold/60 bg-blue/[0.10] shadow-glow'
                  : 'border-border-soft bg-white/[0.05] hover:border-border-2 hover:bg-white/[0.08]'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="grid min-w-0 gap-1">
                  <span className="label">01 · Видео</span>
                  <span className="truncate text-[15px] font-medium">
                    {selected?.avatar?.styleLabel ?? '—'} · {selected ? selected.id.slice(0, 6) : '—'}
                  </span>
                </div>
                <ChevronDown size={16} className="shrink-0 text-text-mute" />
              </div>
            </button>
            <Popover open={openCard === 'video'} onClose={() => setOpenCard(null)} anchorRef={videoRef} width={320}>
              <div className="flex items-center justify-between border-b border-border-soft px-4 py-2.5">
                <span className="label">Видео · {videos.length}</span>
                <button type="button" onClick={() => setOpenCard(null)} aria-label="Закрыть" className="flex h-7 w-7 items-center justify-center rounded-full text-text-mute transition-colors hover:bg-white/[0.08] hover:text-text">
                  <X size={14} />
                </button>
              </div>
              <div className="grid max-h-[320px] grid-cols-3 gap-1.5 overflow-auto p-2">
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
                      className={`relative aspect-square overflow-hidden rounded-xl ${
                        active ? 'ring-2 ring-gold' : 'ring-1 ring-border-soft hover:ring-border-2'
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
                              : 'linear-gradient(170deg, rgba(31,123,255,0.22), rgba(11,11,13,1))',
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
              className={`w-full rounded-[20px] border px-4 py-3 text-left backdrop-blur-xl transition-colors ${
                activeStep === 'style'
                  ? 'border-gold/60 bg-blue/[0.10] shadow-glow'
                  : 'border-border-soft bg-white/[0.05] hover:border-border-2 hover:bg-white/[0.08]'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="grid min-w-0 gap-1">
                  <span className="label">02 · Стиль</span>
                  <span className="truncate text-[15px] font-medium">
                    {preset?.name ?? template}
                    {preset && (
                      <span className="text-text-mute text-[12px]"> · {preset.tags.slice(0, 2).join(', ')}</span>
                    )}
                  </span>
                </div>
                <ChevronDown size={16} className="shrink-0 text-text-mute" />
              </div>
            </button>
            <Popover open={openCard === 'style'} onClose={() => setOpenCard(null)} anchorRef={styleRef} width={360}>
              <div className="flex items-center gap-2 border-b border-border-soft p-2.5">
                <div className="relative flex-1">
                  <Search size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-mute" />
                  <input
                  type="search"
                  value={styleQuery}
                  onChange={(ev) => setStyleQuery(ev.target.value)}
                  placeholder="имя или тег…"
                  autoFocus
                  className="input !rounded-full !py-2 !pl-9 text-[13px]"
                />
                </div>
                <button type="button" onClick={() => setOpenCard(null)} aria-label="Закрыть" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-text-mute transition-colors hover:bg-white/[0.08] hover:text-text">
                  <X size={14} />
                </button>
              </div>
              <div className="grid max-h-[360px] grid-cols-3 gap-1.5 overflow-auto p-2">
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
                      className={`relative aspect-[4/5] overflow-hidden rounded-xl text-left ${
                        active ? 'ring-2 ring-gold' : 'ring-1 ring-border-soft hover:ring-border-2'
                      }`}
                    >
                      <div className="absolute inset-0" style={{ background: gradientFor(t.name) }} />
                      {previews.includes(templateSlug(t.name)) && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={previewUrl(t.name)}
                          alt=""
                          loading="lazy"
                          onError={(ev) => ((ev.currentTarget as HTMLImageElement).style.display = 'none')}
                          className="absolute inset-0 w-full h-full object-cover"
                        />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-transparent" />
                      <div className="absolute inset-x-0 bottom-0 p-1.5">
                        <div className="text-[12px] font-semibold leading-tight">{t.name}</div>
                        <div className="line-clamp-1 text-[9px] text-text-dim">
                          {t.tags.join(' · ')}
                        </div>
                      </div>
                    </button>
                  );
                })}
                {filteredStyles.length === 0 && (
                  <div className="col-span-full p-6 text-center text-[13px] text-text-mute">
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
              className={`w-full rounded-[20px] border px-4 py-3 text-left backdrop-blur-xl transition-colors ${
                activeStep === 'language'
                  ? 'border-gold/60 bg-blue/[0.10] shadow-glow'
                  : 'border-border-soft bg-white/[0.05] hover:border-border-2 hover:bg-white/[0.08]'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="grid min-w-0 gap-1">
                  <span className="label">03 · Язык субтитров</span>
                  <span className="truncate text-[15px] font-medium">
                    {lang?.label ?? subtitleLanguage}
                    <span className="text-text-mute text-[12px]"> · {subtitleLanguage.toUpperCase()}</span>
                  </span>
                </div>
                <ChevronDown size={16} className="shrink-0 text-text-mute" />
              </div>
            </button>
            <Popover open={openCard === 'language'} onClose={() => setOpenCard(null)} anchorRef={langRef} width={220}>
              <ul className="max-h-[280px] overflow-auto p-1">
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
                        className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-[13px] transition-colors ${
                          active ? 'bg-blue/[0.14] text-gold' : 'text-text hover:bg-white/[0.06]'
                        }`}
                      >
                        <span>{l.label}</span>
                        <span className="text-[11px] font-medium text-text-mute">{l.code.toUpperCase()}</span>
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
              className={`w-full rounded-[20px] border px-4 py-3 text-left backdrop-blur-xl transition-colors ${
                activeStep === 'options'
                  ? 'border-gold/60 bg-blue/[0.10] shadow-glow'
                  : 'border-border-soft bg-white/[0.05] hover:border-border-2 hover:bg-white/[0.08]'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="grid min-w-0 gap-1">
                  <span className="label">04 · Опции</span>
                  <span className="truncate text-[15px] font-medium">
                    {subtitlesEnabled ? 'субтитры вкл' : 'субтитры выкл'} · {brollsEnabled ? <span className="text-lime">перебивки вкл</span> : 'перебивки выкл'}
                  </span>
                </div>
                <ChevronDown size={16} className="shrink-0 text-text-mute" />
              </div>
            </button>
            <Popover open={openCard === 'options'} onClose={() => setOpenCard(null)} anchorRef={optionsRef} width={300}>
              <div className="grid gap-3 p-4">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={subtitlesEnabled}
                    onChange={(ev) => setSubtitlesEnabled(ev.target.checked)}
                    className="toggle"
                  />
                  <div className="grid min-w-0 gap-1">
                    <span className="text-[14px] font-semibold">Субтитры</span>
                    <span className="text-[12px] leading-snug text-text-dim">
                      Submagic всегда накладывает субтитры в стиле шаблона.
                    </span>
                  </div>
                </label>
                <label className="flex cursor-pointer items-start gap-3 border-t border-border-soft pt-3">
                  <input
                    type="checkbox"
                    checked={brollsEnabled}
                    onChange={(ev) => setBrollsEnabled(ev.target.checked)}
                    className="toggle"
                  />
                  <div className="grid min-w-0 gap-1">
                    <span className="text-[14px] font-semibold">Авто-перебивки</span>
                    <span className="text-[12px] leading-snug text-text-dim">
                      Авто-вставка релевантных сток-кадров. +1–2 мин рендера.
                    </span>
                  </div>
                </label>
              </div>
            </Popover>
          </div>

          {/* FOOTER */}
          <div className="mt-1 grid gap-3">
            {error && (
              <div className="rounded-2xl border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-[13px] text-danger">{error}</div>
            )}
            <div className="flex items-center justify-between gap-3">
              <span className="text-[13px] text-text-mute">
                <span className="font-semibold tabular-nums text-text">{cost}</span> токенов ·{' '}
                <kbd className="rounded-md border border-border-2 bg-white/[0.05] px-1.5 py-0.5 font-sans text-[11px] text-text-dim">⌘↵</kbd>
              </span>
              <button
                type="button"
                onClick={submit}
                disabled={busy || !videoId}
                className="btn-primary justify-center"
              >
                {busy && <Loader2 size={15} className="animate-spin" />}
                {busy ? 'Запускаем…' : 'Запустить монтаж'}
                {!busy && <ArrowRight size={15} />}
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
