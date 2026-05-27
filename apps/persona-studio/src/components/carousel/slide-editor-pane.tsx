'use client';

import { useRef, useState } from 'react';
import { CoverPickerPopover } from './cover-picker-popover';
import type { CarouselAvatarOption, SlideShape } from './types';

type Props = {
  slide: SlideShape;
  slideIndex: number;
  slidesTotal: number;
  avatars: CarouselAvatarOption[];
  coverAvatarId: string | null;
  onSlideChange: (patch: Partial<SlideShape>) => void;
  onCoverAvatarChange: (id: string | null) => void;
  onDuplicate: () => void;
  onRemove: () => void;
};

const TITLE_LIMIT = 120;
const BODY_LIMIT = 500;

const slideRoleFor = (index: number, total: number) => {
  if (index === 0) return 'ОБЛОЖКА';
  if (index === total - 1) return 'CTA';
  return 'РАСКРЫТИЕ';
};

/**
 * Правая колонка — редактор одного слайда. Для slide 01 рядом с заголовком
 * есть кнопка выбора обложки (поповер с галереей аватаров).
 */
export function SlideEditorPane({
  slide,
  slideIndex,
  slidesTotal,
  avatars,
  coverAvatarId,
  onSlideChange,
  onCoverAvatarChange,
  onDuplicate,
  onRemove,
}: Props) {
  const [coverOpen, setCoverOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const isCover = slideIndex === 0;
  const isCTA = slideIndex === slidesTotal - 1;
  const role = slideRoleFor(slideIndex, slidesTotal);
  const coverAvatar = avatars.find((a) => a.id === coverAvatarId) ?? null;

  const titleOverLimit = slide.title.length > TITLE_LIMIT;
  const bodyOverLimit = slide.body.length > BODY_LIMIT;

  return (
    <section className="border border-border bg-surface flex flex-col h-full overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-baseline gap-3 min-w-0">
          <span className="mono text-[10px] tracking-[0.18em] uppercase text-text-mute">
            /slide {String(slideIndex + 1).padStart(2, '0')}
          </span>
          <span
            className={`mono text-[9px] tracking-[0.18em] uppercase ${
              isCover ? 'text-lime' : isCTA ? 'text-warm' : 'text-text-dim'
            }`}
          >
            {role}
          </span>
        </div>

        <div className="relative flex items-center gap-2">
          {isCover && (
            <button
              type="button"
              onClick={() => setCoverOpen((v) => !v)}
              className="flex items-center gap-2 px-2.5 py-1.5 border border-border hover:border-text-dim mono text-[10px] tracking-[0.16em] uppercase max-w-[200px]"
              title="Выбрать обложку"
            >
              <span className="text-text-mute">🖼</span>
              <span className="truncate">
                {coverAvatar ? coverAvatar.styleLabel : 'Выбрать обложку'}
              </span>
              <span className="text-text-mute">▾</span>
            </button>
          )}

          {isCover && (
            <CoverPickerPopover
              open={coverOpen}
              avatars={avatars}
              selectedId={coverAvatarId}
              onSelect={(id) => onCoverAvatarChange(id)}
              onClose={() => setCoverOpen(false)}
            />
          )}

          {!isCover && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setActionsOpen((v) => !v)}
                className="px-2 py-1 mono text-[12px] text-text-dim hover:text-text border border-border"
                aria-label="Действия со слайдом"
              >
                •••
              </button>
              {actionsOpen && (
                <div className="absolute top-full right-0 mt-1 z-10 w-44 bg-[#0f0f0f] border border-border-2 shadow-lg">
                  <button
                    type="button"
                    onClick={() => {
                      setActionsOpen(false);
                      onDuplicate();
                    }}
                    className="block w-full text-left px-3 py-2 mono text-[11px] tracking-wider uppercase text-text-dim hover:bg-surface-2 hover:text-text"
                  >
                    Дублировать
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActionsOpen(false);
                      onRemove();
                    }}
                    disabled={slidesTotal <= 2}
                    className="block w-full text-left px-3 py-2 mono text-[11px] tracking-wider uppercase text-text-dim hover:bg-surface-2 hover:text-pink disabled:opacity-30"
                  >
                    Удалить слайд
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Fields */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-5 grid gap-4 content-start [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-border-2">
        <label className="grid gap-1.5">
          <div className="flex items-baseline justify-between">
            <span className="mono text-[9px] tracking-[0.18em] uppercase text-text-mute">title</span>
            <span
              className={`mono text-[9px] tracking-wider ${
                titleOverLimit ? 'text-pink' : 'text-text-mute'
              }`}
            >
              {slide.title.length} / {TITLE_LIMIT}
            </span>
          </div>
          <textarea
            rows={1}
            value={slide.title}
            onChange={(e) => onSlideChange({ title: e.target.value.slice(0, TITLE_LIMIT) })}
            placeholder={isCover ? 'Провокационный хук (2–7 слов)' : 'Заголовок слайда'}
            className={`bg-bg border px-3 py-2 font-serif text-[18px] sm:text-[20px] leading-tight focus:outline-none resize-none ${
              titleOverLimit ? 'border-pink focus:border-pink' : 'border-border focus:border-lime/60'
            }`}
          />
        </label>

        <label className="grid gap-1.5">
          <div className="flex items-baseline justify-between">
            <span className="mono text-[9px] tracking-[0.18em] uppercase text-text-mute">body</span>
            <span
              className={`mono text-[9px] tracking-wider ${
                bodyOverLimit ? 'text-pink' : 'text-text-mute'
              }`}
            >
              {slide.body.length} / {BODY_LIMIT}
            </span>
          </div>
          <textarea
            rows={6}
            value={slide.body}
            onChange={(e) => onSlideChange({ body: e.target.value.slice(0, BODY_LIMIT) })}
            placeholder={
              isCover
                ? 'Подзаголовок 10–20 слов — заставь листать дальше.'
                : isCTA
                  ? 'Зачем юзеру нажать CTA — 10–25 слов.'
                  : 'Развёрнутая мысль 15–40 слов, один концепт.'
            }
            className={`bg-bg border px-3 py-2.5 font-serif text-[14px] leading-relaxed focus:outline-none min-h-[140px] ${
              bodyOverLimit ? 'border-pink focus:border-pink' : 'border-border focus:border-lime/60'
            }`}
          />
        </label>

        <SlideMediaUploader
          value={slide.image ?? null}
          onChange={(url) => onSlideChange({ image: url ?? undefined })}
          disabled={isCover}
          coverHint={isCover}
        />
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────
// SlideMediaUploader: drag-and-drop / click для загрузки фото/скриншота,
// предпросмотр, кнопка удалить. Используется на reveal/cta слайдах
// (на cover место занимает avatar — селектор обложки в шапке).
// ───────────────────────────────────────────────────────────────────────
function SlideMediaUploader({
  value,
  onChange,
  disabled,
  coverHint,
}: {
  value: string | null;
  onChange: (url: string | null) => void;
  disabled?: boolean;
  coverHint?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  async function uploadFile(file: File) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set('file', file);
      const res = await fetch('/api/carousels/upload-media', {
        method: 'POST',
        body: fd,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.message || json.error || `HTTP ${res.status}`);
        return;
      }
      onChange(json.url);
    } catch (e) {
      setError((e as Error).message || 'network error');
    } finally {
      setUploading(false);
    }
  }

  function onSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) void uploadFile(f);
    // reset чтобы можно было повторно выбрать тот же файл
    e.target.value = '';
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    if (disabled || uploading) return;
    const f = e.dataTransfer.files?.[0];
    if (f) void uploadFile(f);
  }

  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between">
        <span className="mono text-[9px] tracking-[0.18em] uppercase text-text-mute">
          медиа · фото / скриншот / mockup
        </span>
        {coverHint && (
          <span className="mono text-[9px] tracking-wider text-text-mute">
            на обложке используется аватар
          </span>
        )}
      </div>

      {value ? (
        <div className="relative border border-border bg-bg overflow-hidden grid grid-cols-[160px_1fr] gap-3 p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt="slide media"
            className="w-full h-[120px] object-cover border border-border bg-surface"
          />
          <div className="grid gap-2 content-start min-w-0">
            <span className="mono text-[10px] text-text-dim truncate">{value.split('/').pop()}</span>
            <span className="mono text-[9px] text-text-mute">
              Будет нарисовано как mockup-карточка в нижней части слайда после
              «Сгенерировать PNG».
            </span>
            <div className="flex items-center gap-2 mt-1">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={uploading || disabled}
                className="mono text-[10px] tracking-widest uppercase text-lime hover:underline disabled:opacity-30"
              >
                {uploading ? 'загружаю…' : 'заменить'}
              </button>
              <span className="text-text-mute">·</span>
              <button
                type="button"
                onClick={() => onChange(null)}
                disabled={uploading || disabled}
                className="mono text-[10px] tracking-widest uppercase text-text-mute hover:text-pink disabled:opacity-30"
              >
                удалить
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            if (!disabled && !uploading) setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => !disabled && !uploading && inputRef.current?.click()}
          className={`border border-dashed bg-bg/40 grid place-items-center min-h-[88px] text-center px-4 py-3 cursor-pointer transition ${
            disabled
              ? 'border-border opacity-50 cursor-not-allowed'
              : dragOver
                ? 'border-lime bg-lime/[0.04]'
                : 'border-border hover:border-text-dim'
          }`}
          role="button"
          aria-disabled={disabled || uploading}
          tabIndex={disabled ? -1 : 0}
        >
          {uploading ? (
            <span className="mono text-[11px] text-lime">↑ загружаю…</span>
          ) : disabled ? (
            <span className="mono text-[10px] text-text-mute">
              недоступно для cover-слайда
            </span>
          ) : (
            <div className="grid gap-1">
              <span className="mono text-[11px] tracking-widest uppercase text-text-dim">
                + перетащи фото или кликни
              </span>
              <span className="mono text-[9px] text-text-mute">
                JPG / PNG / WebP до 8 MB
              </span>
            </div>
          )}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={onSelect}
        className="hidden"
        disabled={disabled || uploading}
      />

      {error && (
        <div className="border border-pink/40 bg-pink/5 px-2 py-1 mono text-[10px] text-pink">
          {error}
        </div>
      )}
    </div>
  );
}
