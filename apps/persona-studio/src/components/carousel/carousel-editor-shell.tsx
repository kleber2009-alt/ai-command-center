'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { GlobalStepper } from './global-stepper';
import { SlidesRail } from './slides-rail';
import { SlideEditorPane } from './slide-editor-pane';
import { StyleSelector } from './style-selector';
import type {
  CarouselAvatarOption,
  CarouselDraftSerialized,
  SlideShape,
} from './types';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
type RenderStatus = 'idle' | 'rendering' | 'done' | 'error';

type Props = {
  initial: CarouselDraftSerialized;
  avatars: CarouselAvatarOption[];
};

const AUTOSAVE_DEBOUNCE_MS = 1500;
const MIN_TITLE_LEN = 3;
const MIN_BODY_LEN = 3;

const slideHasError = (s: SlideShape): boolean =>
  s.title.trim().length < MIN_TITLE_LEN || s.body.trim().length < MIN_BODY_LEN;

/**
 * Корневой client-компонент редактора карусели:
 * - управляет state (slides, activeIndex, coverAvatarId)
 * - debounce-autosave в /api/carousels/draft/[id]
 * - layout: stepper + двухколоночный grid (рейл + редактор)
 * - на десктопе помещается на один экран без скролла страницы;
 *   scroll'ы только внутри рейла и поля body редактора
 */
export function CarouselEditorShell({ initial, avatars }: Props) {
  const [slides, setSlides] = useState<SlideShape[]>(initial.slides);
  const [coverAvatarId, setCoverAvatarId] = useState<string | null>(
    initial.coverAvatarId ?? avatars[0]?.id ?? null,
  );
  const [styleId, setStyleId] = useState<string>(initial.style || 'persona-minimal');
  const [activeIndex, setActiveIndex] = useState(0);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [renderStatus, setRenderStatus] = useState<RenderStatus>(
    initial.imageUrls.length > 0 ? 'done' : 'idle',
  );
  const [renderError, setRenderError] = useState<string | null>(null);
  const [imageUrls, setImageUrls] = useState<string[]>(initial.imageUrls ?? []);
  // Set of indices in-flight для per-slide rerender (показываем spinner на плитке)
  const [singleRendering, setSingleRendering] = useState<Set<number>>(() => new Set());
  // Якорь на редактор — для scrollIntoView из галереи
  const editorAnchorRef = useRef<HTMLDivElement | null>(null);

  // dirty-флаг и таймер для дебаунса
  const dirtyRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // refs для свежих значений в save (без зависимости в эффекте)
  const slidesRef = useRef(slides);
  const coverRef = useRef(coverAvatarId);
  const styleRef = useRef(styleId);
  useEffect(() => {
    slidesRef.current = slides;
  }, [slides]);
  useEffect(() => {
    coverRef.current = coverAvatarId;
  }, [coverAvatarId]);
  useEffect(() => {
    styleRef.current = styleId;
  }, [styleId]);

  const persist = useCallback(async () => {
    setSaveStatus('saving');
    setSaveError(null);
    try {
      const payload = {
        slides: slidesRef.current.map((s) => ({
          title: s.title.trim() || ' ',
          body: s.body.trim() || ' ',
          ...(s.accent?.trim() ? { accent: s.accent.trim() } : {}),
          ...(s.image ? { image: s.image } : {}),
          ...(s.coverType ? { coverType: s.coverType } : {}),
          ...(s.imageStatus ? { imageStatus: s.imageStatus } : {}),
          ...(s.imageError ? { imageError: s.imageError } : {}),
          ...(s.imagePromptUsed ? { imagePromptUsed: s.imagePromptUsed } : {}),
        })),
        coverAvatarId: coverRef.current,
        style: styleRef.current,
      };
      const res = await fetch(`/api/carousels/draft/${initial.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        let msg = `HTTP ${res.status}`;
        try {
          const j = JSON.parse(text);
          msg = j.message || j.error || msg;
        } catch {
          /* not json */
        }
        throw new Error(msg);
      }
      setSaveStatus('saved');
      setSavedAt(new Date().toLocaleTimeString('ru-RU'));
      dirtyRef.current = false;
    } catch (e) {
      setSaveStatus('error');
      setSaveError((e as Error).message || 'network error');
    }
  }, [initial.id]);

  // Debounce: после любой правки запускаем таймер; если изменения продолжаются —
  // сбрасываем. Когда стихло — сохраняем.
  const scheduleSave = useCallback(() => {
    dirtyRef.current = true;
    setSaveStatus('idle');
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void persist();
    }, AUTOSAVE_DEBOUNCE_MS);
  }, [persist]);

  // Beforeunload guard для несохранённых изменений
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  // ── Mutators ──────────────────────────────────────
  const updateSlide = (index: number, patch: Partial<SlideShape>) => {
    setSlides((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
    scheduleSave();
  };

  const addSlide = () => {
    if (slides.length >= 20) return;
    setSlides((prev) => {
      const next = [...prev];
      // Вставляем перед CTA (последним), чтобы CTA всегда оставался в конце.
      const insertAt = Math.max(1, next.length - 1);
      next.splice(insertAt, 0, { title: 'Новый слайд', body: '' });
      return next;
    });
    setActiveIndex((idx) => Math.max(1, slides.length - 1));
    scheduleSave();
  };

  const removeSlide = (index: number) => {
    if (slides.length <= 2) return;
    setSlides((prev) => prev.filter((_, i) => i !== index));
    setActiveIndex((curr) => Math.max(0, Math.min(curr, slides.length - 2)));
    scheduleSave();
  };

  const duplicateSlide = (index: number) => {
    if (slides.length >= 20) return;
    setSlides((prev) => {
      const next = [...prev];
      next.splice(index + 1, 0, { ...prev[index] });
      return next;
    });
    setActiveIndex(index + 1);
    scheduleSave();
  };

  const moveSlide = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= slides.length) return;
    setSlides((prev) => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setActiveIndex(target);
    scheduleSave();
  };

  const changeCoverAvatar = (id: string | null) => {
    setCoverAvatarId(id);
    scheduleSave();
  };

  const changeStyle = (id: string) => {
    setStyleId(id);
    scheduleSave();
  };

  // Stepper + валидация для финального шага
  const allFilled = slides.every((s) => !slideHasError(s)) && Boolean(coverAvatarId);
  const renderStepStatus =
    renderStatus === 'done'
      ? ('done' as const)
      : renderStatus === 'rendering'
        ? ('active' as const)
        : ('pending' as const);
  const steps = [
    {
      key: 'parser',
      label: 'Парсер',
      status: 'done' as const,
      href: initial.parserItem ? '/parser' : undefined,
    },
    {
      key: 'cover',
      label: 'Обложка',
      status: coverAvatarId ? ('done' as const) : ('active' as const),
    },
    {
      key: 'slides',
      label: 'Слайды',
      status:
        renderStatus === 'done' ? ('done' as const) : ('active' as const),
    },
    { key: 'render', label: 'Рендер PNG', status: renderStepStatus },
  ];

  async function runRender() {
    if (renderStatus === 'rendering') return;
    // Если есть dirty-флаг, сохраняем сначала чтобы не разойтись с БД
    if (dirtyRef.current) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      await persist();
    }
    setRenderStatus('rendering');
    setRenderError(null);
    try {
      const res = await fetch(`/api/carousels/draft/${initial.id}/render`, {
        method: 'POST',
      });
      const text = await res.text();
      let json: { imageUrls?: string[]; message?: string; error?: string } = {};
      try {
        json = JSON.parse(text);
      } catch {
        /* leave default */
      }
      if (!res.ok) {
        setRenderError(json.message || json.error || `HTTP ${res.status}`);
        setRenderStatus('error');
        return;
      }
      setImageUrls(json.imageUrls ?? []);
      setRenderStatus('done');
    } catch (e) {
      setRenderError((e as Error).message || 'network error');
      setRenderStatus('error');
    }
  }

  /**
   * AI image-generation одного слайда. Заряжает токены, ставит в очередь,
   * патчит локальный state на pending. Поллер ниже подхватит и обновит
   * картинку, когда воркер закончит.
   */
  async function dispatchSlideImage(
    index: number,
    mode: 'hero-avatar' | 'object' | 'ui' | 'slide-media',
  ): Promise<void> {
    if (dirtyRef.current) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      await persist();
    }
    const res = await fetch(
      `/api/carousels/draft/${initial.id}/slide-image?index=${index}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      },
    );
    const text = await res.text();
    let json: { message?: string; error?: string } = {};
    try {
      json = JSON.parse(text);
    } catch {
      /* leave default */
    }
    if (!res.ok) {
      throw new Error(json.message || json.error || `HTTP ${res.status}`);
    }
    // Mark slide as pending locally — поллер уже стартанул.
    setSlides((prev) =>
      prev.map((s, i) =>
        i === index ? { ...s, imageStatus: 'pending', imageError: undefined } : s,
      ),
    );
  }

  // Polling: для слайдов в imageStatus='pending' дергаем GET каждые 3с,
  // пока статус не сменится. Один интервал на весь shell — внутри один
  // tick опрашивает все pending-слайды параллельно.
  useEffect(() => {
    const pendingIndices = slides
      .map((s, i) => (s.imageStatus === 'pending' ? i : -1))
      .filter((i) => i >= 0);
    if (pendingIndices.length === 0) return;

    let cancelled = false;
    const tick = async () => {
      const results = await Promise.all(
        pendingIndices.map(async (i) => {
          try {
            const res = await fetch(
              `/api/carousels/draft/${initial.id}/slide-image?index=${i}`,
            );
            if (!res.ok) return null;
            const j = (await res.json()) as {
              index: number;
              status: 'pending' | 'done' | 'failed' | null;
              image: string | null;
              error: string | null;
            };
            return j;
          } catch {
            return null;
          }
        }),
      );
      if (cancelled) return;
      setSlides((prev) => {
        let changed = false;
        const next = prev.map((s, i) => {
          const r = results.find((x) => x && x.index === i);
          if (!r) return s;
          if (r.status === 'pending') return s; // no change yet
          changed = true;
          return {
            ...s,
            image: r.image ?? s.image,
            imageStatus: (r.status ?? undefined) as
              | 'pending'
              | 'done'
              | 'failed'
              | undefined,
            imageError: r.error ?? undefined,
          };
        });
        return changed ? next : prev;
      });
    };
    const interval = setInterval(tick, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [slides, initial.id]);

  /**
   * AI-регенерация копи (title/body) одного слайда через Claude. Перед
   * запросом форсируем persist если есть несохранённые изменения, чтобы
   * сервер видел актуальный slides[i] и соседей. После успеха применяем
   * результат к локальному state. Сам endpoint уже обновил БД.
   */
  async function regenCopy(index: number, intent?: string) {
    if (dirtyRef.current) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      await persist();
    }
    const res = await fetch(
      `/api/carousels/draft/${initial.id}/slide-regen?index=${index}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intent: intent ?? '' }),
      },
    );
    const text = await res.text();
    let json: {
      slide?: { title?: string; body?: string };
      slides?: SlideShape[];
      message?: string;
      error?: string;
    } = {};
    try {
      json = JSON.parse(text);
    } catch {
      /* leave default */
    }
    if (!res.ok) {
      throw new Error(json.message || json.error || `HTTP ${res.status}`);
    }
    if (Array.isArray(json.slides)) {
      setSlides(json.slides);
    } else if (json.slide?.title && json.slide?.body) {
      const newSlide = json.slide;
      setSlides((prev) =>
        prev.map((s, i) =>
          i === index ? { ...s, title: newSlide.title!, body: newSlide.body! } : s,
        ),
      );
    }
    // Server уже сохранил в БД — снимаем dirty-флаг и показываем «сохранено».
    dirtyRef.current = false;
    setSaveStatus('saved');
    setSavedAt(new Date().toLocaleTimeString('ru-RU'));
  }

  /**
   * Перерендер ОДНОГО слайда без перезаписи остальных PNG'ов. Перед
   * запросом форсируем persist если есть несохранённые изменения, чтобы
   * сервер взял свежий текст слайда из БД.
   */
  async function rerenderOne(index: number) {
    if (singleRendering.has(index)) return;
    if (dirtyRef.current) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      await persist();
    }
    setSingleRendering((s) => new Set([...s, index]));
    setRenderError(null);
    try {
      const res = await fetch(
        `/api/carousels/draft/${initial.id}/render?onlyIndex=${index}`,
        { method: 'POST' },
      );
      const text = await res.text();
      let json: { imageUrls?: string[]; message?: string; error?: string } = {};
      try {
        json = JSON.parse(text);
      } catch {
        /* leave default */
      }
      if (!res.ok) {
        setRenderError(json.message || json.error || `HTTP ${res.status}`);
        return;
      }
      if (json.imageUrls) setImageUrls(json.imageUrls);
    } catch (e) {
      setRenderError((e as Error).message || 'network error');
    } finally {
      setSingleRendering((s) => {
        const next = new Set(s);
        next.delete(index);
        return next;
      });
    }
  }

  /** Клик по плитке в галерее: выбрать слайд + скроллить к редактору. */
  function editFromGallery(index: number) {
    setActiveIndex(index);
    requestAnimationFrame(() => {
      editorAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  const activeSlide = slides[activeIndex] ?? slides[0];

  return (
    <div className="grid gap-3 min-h-[calc(100dvh-140px)]">
      <GlobalStepper steps={steps} />

      <StyleSelector value={styleId} onChange={changeStyle} />

      <div
        ref={editorAnchorRef}
        className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-3 lg:h-[calc(100dvh-280px)] lg:min-h-[520px] scroll-mt-4"
      >
        <SlidesRail
          slides={slides}
          activeIndex={activeIndex}
          coverAvatar={avatars.find((a) => a.id === coverAvatarId) ?? null}
          onSelect={setActiveIndex}
          onMove={moveSlide}
          onRemove={removeSlide}
          onAdd={addSlide}
          hasErrorAt={(i) => slideHasError(slides[i])}
        />

        <div className="flex flex-col gap-3 min-h-0">
          {activeSlide ? (
            <SlideEditorPane
              slide={activeSlide}
              slideIndex={activeIndex}
              slidesTotal={slides.length}
              avatars={avatars}
              coverAvatarId={coverAvatarId}
              onSlideChange={(patch) => updateSlide(activeIndex, patch)}
              onCoverAvatarChange={changeCoverAvatar}
              onDuplicate={() => duplicateSlide(activeIndex)}
              onRemove={() => removeSlide(activeIndex)}
              onRegenCopy={(intent) => regenCopy(activeIndex, intent)}
              onDispatchImage={(mode) => dispatchSlideImage(activeIndex, mode)}
            />
          ) : (
            <div className="border border-border bg-surface p-6 text-text-mute mono text-[11px]">
              Нет слайдов.
            </div>
          )}

          {/* Footer */}
          <div className="border border-border bg-surface px-4 py-3 flex flex-wrap items-center gap-3 justify-between shrink-0">
            <div className="mono text-[10px] tracking-[0.16em] uppercase flex flex-wrap items-center gap-3">
              <SaveIndicator status={saveStatus} savedAt={savedAt} error={saveError} />
              {renderStatus === 'rendering' && (
                <span className="text-lime">· рендерю PNG, 3–8 сек</span>
              )}
              {renderStatus === 'done' && imageUrls.length > 0 && (
                <span className="text-text-dim">· готово {imageUrls.length} PNG</span>
              )}
              {renderStatus === 'error' && (
                <span className="text-pink">· ошибка рендера · {renderError}</span>
              )}
            </div>
            <button
              type="button"
              disabled={!allFilled || renderStatus === 'rendering'}
              title={
                !allFilled
                  ? 'Сначала заполни все слайды и выбери обложку'
                  : renderStatus === 'rendering'
                    ? 'Рендерится…'
                    : renderStatus === 'done'
                      ? 'Перерендерить с текущими текстами'
                      : 'Сгенерировать PNG для каждого слайда'
              }
              className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
              onClick={runRender}
            >
              {renderStatus === 'rendering'
                ? 'Рендерю PNG…'
                : renderStatus === 'done'
                  ? 'Перерендерить →'
                  : 'Сгенерировать PNG →'}
            </button>
          </div>
        </div>
      </div>

      {/* Galery of rendered PNGs */}
      {imageUrls.length > 0 && (
        <section className="grid gap-3 mt-2">
          <div className="flex items-baseline gap-3">
            <span className="sec-num">/04</span>
            <span className="sec-title">Готовая карусель · {imageUrls.length} PNG</span>
            <span className="flex-1 border-b border-border translate-y-[-3px]" />
            <span className="mono text-[10px] tracking-[0.18em] uppercase text-text-mute">
              1080×1350 · клик = править · ↻ = перерендер
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
            {imageUrls.map((url, i) => {
              if (!url) return null;
              const isRerendering = singleRendering.has(i);
              const isActive = i === activeIndex;
              return (
                <div
                  key={i}
                  className={`relative aspect-[4/5] border bg-surface overflow-hidden group transition ${
                    isActive ? 'border-lime' : 'border-border hover:border-lime/60'
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`Slide ${i + 1}`}
                    loading="lazy"
                    className={`w-full h-full object-cover transition ${
                      isRerendering ? 'opacity-30' : ''
                    }`}
                  />

                  {/* Main click area — выбрать слайд для редактирования */}
                  <button
                    type="button"
                    onClick={() => editFromGallery(i)}
                    className="absolute inset-0 w-full h-full cursor-pointer"
                    title={`Редактировать слайд ${i + 1}`}
                    aria-label={`Редактировать слайд ${i + 1}`}
                  />

                  {/* Index badge */}
                  <span className="absolute top-1 left-1 px-1.5 py-0.5 mono text-[9px] tracking-widest uppercase bg-black/80 text-lime pointer-events-none">
                    {String(i + 1).padStart(2, '0')}
                  </span>

                  {/* Rerender spinner overlay */}
                  {isRerendering && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <span className="mono text-[10px] tracking-widest uppercase bg-black/80 text-lime px-2 py-1">
                        ↻ рендерю…
                      </span>
                    </div>
                  )}

                  {/* Action bar — поверх клик-зоны */}
                  <div className="absolute bottom-1 right-1 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void rerenderOne(i);
                      }}
                      disabled={isRerendering}
                      className="w-7 h-7 mono text-[12px] bg-black/85 text-lime hover:bg-lime hover:text-black border border-lime/40 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center"
                      title="Перерендерить только этот слайд"
                      aria-label="Перерендерить слайд"
                    >
                      ↻
                    </button>
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      download={`slide-${String(i + 1).padStart(2, '0')}.png`}
                      onClick={(e) => e.stopPropagation()}
                      className="w-7 h-7 mono text-[11px] bg-black/85 text-lime hover:bg-lime hover:text-black border border-lime/40 flex items-center justify-center"
                      title="Скачать PNG"
                      aria-label="Скачать PNG"
                    >
                      ↓
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function SaveIndicator({
  status,
  savedAt,
  error,
}: {
  status: SaveStatus;
  savedAt: string | null;
  error: string | null;
}) {
  if (status === 'saving') return <span className="text-text-mute">сохраняю…</span>;
  if (status === 'error')
    return (
      <span className="text-pink">
        ошибка сохранения · {error}
      </span>
    );
  if (status === 'saved' && savedAt)
    return <span className="text-text-dim">сохранено · {savedAt}</span>;
  return <span className="text-text-mute">не сохранено</span>;
}
