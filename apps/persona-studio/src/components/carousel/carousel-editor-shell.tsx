'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { GlobalStepper } from './global-stepper';
import { SlidesRail } from './slides-rail';
import { SlideEditorPane } from './slide-editor-pane';
import type {
  CarouselAvatarOption,
  CarouselDraftSerialized,
  SlideShape,
} from './types';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

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
  const [activeIndex, setActiveIndex] = useState(0);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // dirty-флаг и таймер для дебаунса
  const dirtyRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // refs для свежих значений в save (без зависимости в эффекте)
  const slidesRef = useRef(slides);
  const coverRef = useRef(coverAvatarId);
  useEffect(() => {
    slidesRef.current = slides;
  }, [slides]);
  useEffect(() => {
    coverRef.current = coverAvatarId;
  }, [coverAvatarId]);

  const persist = useCallback(async () => {
    setSaveStatus('saving');
    setSaveError(null);
    try {
      const payload = {
        slides: slidesRef.current.map((s) => ({
          title: s.title.trim() || ' ',
          body: s.body.trim() || ' ',
          ...(s.accent?.trim() ? { accent: s.accent.trim() } : {}),
        })),
        coverAvatarId: coverRef.current,
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

  // Stepper + валидация для финального шага
  const allFilled = slides.every((s) => !slideHasError(s)) && Boolean(coverAvatarId);
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
    { key: 'slides', label: 'Слайды', status: 'active' as const },
    { key: 'render', label: 'Рендер PNG', status: 'pending' as const },
  ];

  const activeSlide = slides[activeIndex] ?? slides[0];

  return (
    <div className="grid gap-3 h-[calc(100dvh-140px)] min-h-[640px]">
      <GlobalStepper steps={steps} />

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-3 flex-1 min-h-0">
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
            />
          ) : (
            <div className="border border-border bg-surface p-6 text-text-mute mono text-[11px]">
              Нет слайдов.
            </div>
          )}

          {/* Footer */}
          <div className="border border-border bg-surface px-4 py-3 flex flex-wrap items-center gap-3 justify-between shrink-0">
            <div className="mono text-[10px] tracking-[0.16em] uppercase">
              <SaveIndicator status={saveStatus} savedAt={savedAt} error={saveError} />
            </div>
            <button
              type="button"
              disabled={!allFilled}
              title={
                allFilled
                  ? 'Рендер PNG — следующий этап (скоро)'
                  : 'Сначала заполни все слайды и выбери обложку'
              }
              className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
              onClick={() => {
                // Phase 2 — render pipeline. Сейчас просто toast-like подсказка.
                alert('Рендер PNG появится в следующем релизе. Черновик сохранён в /carousels.');
              }}
            >
              Сгенерировать PNG →
            </button>
          </div>
        </div>
      </div>
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
