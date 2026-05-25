'use client';

import { useState } from 'react';
import type { CarouselAvatarOption, CarouselDraftSerialized, SlideShape } from './types';

type Props = {
  initial: CarouselDraftSerialized;
  avatars: CarouselAvatarOption[];
};

export function CarouselEditor({ initial, avatars }: Props) {
  const [slides, setSlides] = useState<SlideShape[]>(initial.slides);
  const [coverAvatarId, setCoverAvatarId] = useState<string | null>(
    initial.coverAvatarId ?? avatars[0]?.id ?? null,
  );
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const updateSlide = (index: number, patch: Partial<SlideShape>) => {
    setSlides((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  const addSlide = () => {
    if (slides.length >= 20) return;
    setSlides((prev) => [...prev, { title: 'Новый слайд', body: '' }]);
  };

  const removeSlide = (index: number) => {
    if (slides.length <= 2) return;
    setSlides((prev) => prev.filter((_, i) => i !== index));
  };

  const moveSlide = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= slides.length) return;
    setSlides((prev) => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/carousels/draft/${initial.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slides: slides.map((s) => ({
            title: s.title.trim(),
            body: s.body.trim(),
            ...(s.accent?.trim() ? { accent: s.accent.trim() } : {}),
          })),
          coverAvatarId,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.message || json.error || `HTTP ${res.status}`);
        return;
      }
      setSavedAt(new Date().toLocaleTimeString('ru-RU'));
    } catch (e) {
      setError((e as Error).message || 'network error');
    } finally {
      setSaving(false);
    }
  }

  const coverAvatar = avatars.find((a) => a.id === coverAvatarId);

  return (
    <div className="grid gap-8">
      {/* Cover avatar selector */}
      <section className="border border-border bg-surface p-5 grid gap-4">
        <div className="flex items-baseline gap-3">
          <span className="sec-num">/01</span>
          <span className="sec-title">Обложка — твоё фото</span>
          <span className="flex-1 border-b border-border translate-y-[-3px]" />
        </div>
        <p className="font-serif text-[13px] text-text-dim max-w-[60ch]">
          Первый слайд карусели — это всегда твой аватар на фоне заголовка-хука. Выбери из готовых.
        </p>
        {avatars.length === 0 ? (
          <div className="border border-pink/40 bg-pink/5 p-3 mono text-[11px] text-pink">
            У тебя нет готовых аватаров. Сначала зайди в /generate и сделай хотя бы один.
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 gap-2">
            {avatars.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setCoverAvatarId(a.id)}
                className={`relative aspect-[4/5] border overflow-hidden bg-bg transition ${
                  coverAvatarId === a.id ? 'border-lime ring-2 ring-lime/40' : 'border-border hover:border-text-dim'
                }`}
                title={a.styleLabel}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.imageUrl} alt={a.styleLabel} className="w-full h-full object-cover" loading="lazy" />
                {coverAvatarId === a.id && (
                  <span className="absolute bottom-1 right-1 px-1.5 py-0.5 mono text-[8px] tracking-wider uppercase bg-lime text-black">
                    cover
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Slides editor */}
      <section className="grid gap-3">
        <div className="flex items-baseline gap-3">
          <span className="sec-num">/02</span>
          <span className="sec-title">Слайды · {slides.length}</span>
          <span className="flex-1 border-b border-border translate-y-[-3px]" />
          <button
            type="button"
            onClick={addSlide}
            disabled={slides.length >= 20}
            className="mono text-[10px] tracking-widest uppercase text-lime hover:underline disabled:opacity-30"
          >
            + добавить слайд
          </button>
        </div>

        {slides.map((s, i) => {
          const isCover = i === 0;
          const isCTA = i === slides.length - 1;
          const role = isCover ? 'обложка' : isCTA ? 'CTA' : 'раскрытие';
          return (
            <article
              key={i}
              className={`border bg-surface p-4 sm:p-5 grid gap-3 ${
                isCover ? 'border-lime/40' : 'border-border'
              }`}
            >
              <header className="flex items-center justify-between gap-3">
                <div className="flex items-baseline gap-3">
                  <span className="mono text-[10px] tracking-widest uppercase text-text-mute">
                    /slide {String(i + 1).padStart(2, '0')}
                  </span>
                  <span
                    className={`mono text-[9px] tracking-widest uppercase ${
                      isCover ? 'text-lime' : isCTA ? 'text-warm' : 'text-text-dim'
                    }`}
                  >
                    {role}
                  </span>
                  {isCover && coverAvatar && (
                    <span className="mono text-[9px] text-text-mute">
                      · фото: {coverAvatar.styleLabel}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => moveSlide(i, -1)}
                    disabled={i === 0}
                    className="mono text-[10px] tracking-widest text-text-mute hover:text-text disabled:opacity-30 w-7 h-7"
                    aria-label="Вверх"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onClick={() => moveSlide(i, 1)}
                    disabled={i === slides.length - 1}
                    className="mono text-[10px] tracking-widest text-text-mute hover:text-text disabled:opacity-30 w-7 h-7"
                    aria-label="Вниз"
                  >
                    ▼
                  </button>
                  <button
                    type="button"
                    onClick={() => removeSlide(i)}
                    disabled={slides.length <= 2}
                    className="mono text-[9px] tracking-widest uppercase text-text-mute hover:text-pink disabled:opacity-30 px-2"
                    aria-label="Удалить слайд"
                  >
                    ✕
                  </button>
                </div>
              </header>

              <label className="grid gap-1.5">
                <span className="mono text-[9px] tracking-widest uppercase text-text-mute">title</span>
                <textarea
                  rows={1}
                  value={s.title}
                  onChange={(e) => updateSlide(i, { title: e.target.value.slice(0, 120) })}
                  className="bg-bg border border-border px-3 py-2 font-serif text-[16px] sm:text-[18px] leading-tight focus:outline-none focus:border-lime/60 resize-none"
                  placeholder={isCover ? 'Провокационный хук (2–7 слов)' : 'Заголовок слайда'}
                />
                <span className="mono text-[8px] text-text-mute self-end">{s.title.length}/120</span>
              </label>

              <label className="grid gap-1.5">
                <span className="mono text-[9px] tracking-widest uppercase text-text-mute">body</span>
                <textarea
                  rows={3}
                  value={s.body}
                  onChange={(e) => updateSlide(i, { body: e.target.value.slice(0, 500) })}
                  className="bg-bg border border-border px-3 py-2 font-serif text-[13px] leading-relaxed focus:outline-none focus:border-lime/60"
                  placeholder={isCover ? 'Подзаголовок 10–20 слов' : isCTA ? 'Зачем юзеру нажать CTA — 10–25 слов' : 'Развёрнутая мысль 15–40 слов'}
                />
                <span className="mono text-[8px] text-text-mute self-end">{s.body.length}/500</span>
              </label>
            </article>
          );
        })}
      </section>

      {/* Save bar */}
      <div className="sticky bottom-0 -mx-3 sm:mx-0 bg-[rgba(8,8,8,0.92)] backdrop-blur border-t border-border p-4 flex flex-wrap items-center gap-3 justify-between">
        <div className="mono text-[10px] tracking-widest uppercase text-text-mute">
          {savedAt ? `сохранено · ${savedAt}` : 'не сохранено'}
          {error && <span className="text-pink ml-3">{error}</span>}
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving || avatars.length === 0}
          className="btn-primary"
        >
          {saving ? 'Сохраняю…' : 'Сохранить черновик'}
        </button>
      </div>
    </div>
  );
}
