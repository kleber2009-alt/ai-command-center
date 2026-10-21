'use client';

import { useRef, useState } from 'react';
import {
  ArrowRight,
  ChevronDown,
  Copy,
  Image as ImageIcon,
  Loader2,
  MoreHorizontal,
  Palette,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { CoverPickerPopover } from './cover-picker-popover';
import type { CarouselAvatarOption, CoverType, SlideShape } from './types';
import { COVER_TYPES, COVER_TYPE_LABEL, COVER_TYPE_DESC } from '@/lib/carousel/prompts';

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
  /** Async AI-регенерация копи слайда. Подкидывается из shell. */
  onRegenCopy: (intent?: string) => Promise<void>;
  /** Async AI image-generation (kie Nano Banana 2 / Flux Kontext). */
  onDispatchImage: (mode: 'hero-avatar' | 'object' | 'ui' | 'slide-media') => Promise<void>;
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
  onRegenCopy,
  onDispatchImage,
}: Props) {
  const [coverOpen, setCoverOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [regenIntent, setRegenIntent] = useState('');
  const [regenBusy, setRegenBusy] = useState(false);
  const [regenError, setRegenError] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [imageDispatchError, setImageDispatchError] = useState<string | null>(null);
  const isCover = slideIndex === 0;
  const isCTA = slideIndex === slidesTotal - 1;
  const role = slideRoleFor(slideIndex, slidesTotal);
  const coverAvatar = avatars.find((a) => a.id === coverAvatarId) ?? null;
  const activeCoverType: CoverType = (slide.coverType ?? 'avatar') as CoverType;

  // Mode авто-выбирается из роли слайда и cover type.
  const defaultImageMode: 'hero-avatar' | 'object' | 'ui' | 'slide-media' = isCover
    ? activeCoverType === 'avatar'
      ? 'hero-avatar'
      : activeCoverType === 'object'
        ? 'object'
        : activeCoverType === 'ui'
          ? 'ui'
          : 'slide-media' // split — без AI-картинки
    : 'slide-media';

  const imageBusyOrPending = imageBusy || slide.imageStatus === 'pending';
  const imageDisabledReason =
    isCover && activeCoverType === 'split'
      ? 'split-обложке AI-картинка не нужна'
      : isCover && defaultImageMode === 'hero-avatar' && !coverAvatarId
        ? 'выбери cover-аватар'
        : undefined;

  const titleOverLimit = slide.title.length > TITLE_LIMIT;
  const bodyOverLimit = slide.body.length > BODY_LIMIT;

  async function handleRegen() {
    if (regenBusy) return;
    setRegenBusy(true);
    setRegenError(null);
    try {
      await onRegenCopy(regenIntent.trim() || undefined);
      setRegenIntent('');
    } catch (e) {
      setRegenError((e as Error).message || 'regen failed');
    } finally {
      setRegenBusy(false);
    }
  }

  async function handleDispatchImage(mode?: 'hero-avatar' | 'object' | 'ui' | 'slide-media') {
    if (imageBusyOrPending) return;
    setImageBusy(true);
    setImageDispatchError(null);
    try {
      await onDispatchImage(mode ?? defaultImageMode);
    } catch (e) {
      setImageDispatchError((e as Error).message || 'dispatch failed');
    } finally {
      setImageBusy(false);
    }
  }

  return (
    <section className="panel flex h-full flex-col overflow-hidden">
      {/* Header */}
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border-soft px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="sec-num">
            /slide {String(slideIndex + 1).padStart(2, '0')}
          </span>
          <span
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] ${
              isCover ? 'bg-lime/15 text-lime' : isCTA ? 'bg-pink/15 text-pink' : 'bg-white/[0.06] text-text-dim'
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
              className="btn-ghost max-w-[220px] !px-3.5 !py-2 text-[13px]"
              title="Выбрать обложку"
            >
              <ImageIcon size={14} className="shrink-0 text-text-mute" />
              <span className="truncate">
                {coverAvatar ? coverAvatar.styleLabel : 'Выбрать обложку'}
              </span>
              <ChevronDown size={14} className="shrink-0 text-text-mute" />
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
                className="btn-icon !h-9 !w-9"
                aria-label="Действия со слайдом"
              >
                <MoreHorizontal size={16} />
              </button>
              {actionsOpen && (
                <div className="pop-in absolute right-0 top-full z-10 mt-2 w-48 overflow-hidden rounded-2xl border border-border-2 bg-bg-card/95 p-1 shadow-glass backdrop-blur-xl">
                  <button
                    type="button"
                    onClick={() => {
                      setActionsOpen(false);
                      onDuplicate();
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[13px] text-text-dim hover:bg-white/[0.06] hover:text-text"
                  >
                    <Copy size={14} /> Дублировать
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActionsOpen(false);
                      onRemove();
                    }}
                    disabled={slidesTotal <= 2}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[13px] text-text-dim hover:bg-danger/10 hover:text-danger disabled:opacity-30"
                  >
                    <Trash2 size={14} /> Удалить слайд
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Fields */}
      <div className="grid flex-1 content-start gap-5 overflow-y-auto p-4 sm:p-5 [&::-webkit-scrollbar-thumb]:bg-border-2 [&::-webkit-scrollbar]:w-1.5">
        {/* Cover type picker — only for slide 0 */}
        {isCover && (
          <div className="grid gap-1.5">
            <div className="flex items-baseline justify-between">
              <span className="label">
                cover type · 4 layout
              </span>
              <span className="ml-3 truncate text-[12px] text-text-mute">
                {COVER_TYPE_DESC[activeCoverType]}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {COVER_TYPES.map((t) => {
                const active = activeCoverType === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => onSlideChange({ coverType: t })}
                    className={`rounded-2xl border px-3 py-2.5 text-left transition-colors ${
                      active
                        ? 'border-gold bg-blue/[0.12] text-text shadow-glow'
                        : 'border-border-soft bg-white/[0.03] text-text-dim hover:bg-white/[0.06]'
                    }`}
                    title={COVER_TYPE_DESC[t]}
                  >
                    <span className="block text-[13px] font-semibold">{COVER_TYPE_LABEL[t]}</span>
                    <span
                      className={`mt-0.5 block text-[11px] ${
                        active ? 'text-gold' : 'text-text-mute'
                      }`}
                    >
                      {t === 'avatar'
                        ? 'аватар · фон'
                        : t === 'object'
                          ? 'объект · центр'
                          : t === 'split'
                            ? 'a / b'
                            : 'ui · скрин'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <label className="grid gap-1.5">
          <div className="flex items-baseline justify-between">
            <span className="label">title</span>
            <span
              className={`text-[12px] tabular-nums ${
                titleOverLimit ? 'text-danger' : 'text-text-mute'
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
            className={`input !min-h-0 resize-none !text-[18px] font-semibold !leading-tight tracking-[-0.02em] sm:!text-[20px] ${
              titleOverLimit ? '!border-danger' : ''
            }`}
          />
        </label>

        <label className="grid gap-1.5">
          <div className="flex items-baseline justify-between">
            <span className="label">body</span>
            <span
              className={`text-[12px] tabular-nums ${
                bodyOverLimit ? 'text-danger' : 'text-text-mute'
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
            className={`input min-h-[140px] ${
              bodyOverLimit ? '!border-danger' : ''
            }`}
          />
        </label>

        {/* AI Regen panel — Claude rewrite этого слайда с учётом стиля + соседей */}
        <div className="grid gap-3 rounded-[20px] border border-border-soft bg-white/[0.03] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[13px] font-semibold text-lime">
              <Sparkles size={14} /> AI regen · claude
            </span>
            <span className="text-[12px] text-text-mute">
              учитывает стиль и соседей
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {['сделай острее', 'добавь цифру', 'короче', 'добавь конкретики'].map((q) => (
              <button
                key={q}
                type="button"
                disabled={regenBusy}
                onClick={() => setRegenIntent(q)}
                className={`rounded-full border px-3 py-1 text-[12px] transition-colors ${
                  regenIntent === q
                    ? 'border-transparent bg-blue text-white'
                    : 'border-border-soft bg-white/[0.04] text-text-dim hover:bg-white/[0.07]'
                } disabled:cursor-not-allowed disabled:opacity-30`}
              >
                {q}
              </button>
            ))}
          </div>
          <div className="flex items-stretch gap-2">
            <input
              type="text"
              value={regenIntent}
              onChange={(e) => setRegenIntent(e.target.value.slice(0, 200))}
              placeholder="что изменить (опционально)…"
              disabled={regenBusy}
              className="input flex-1 !rounded-full !py-2 text-[13px] disabled:opacity-50"
            />
            <button
              type="button"
              onClick={handleRegen}
              disabled={regenBusy}
              className="btn-lime !px-4 !py-2 text-[13px]"
            >
              {regenBusy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              {regenBusy ? 'генерю…' : 'regen'}
              {!regenBusy && <ArrowRight size={14} />}
            </button>
          </div>
          {regenError && (
            <div className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-1.5 text-[12px] text-danger">
              {regenError}
            </div>
          )}
        </div>

        {/* AI Image panel — kie Nano Banana 2 / Flux Kontext */}
        <div className="grid gap-3 rounded-[20px] border border-border-soft bg-white/[0.03] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[13px] font-semibold text-gold">
              <Palette size={14} /> AI image · nano banana 2
            </span>
            <span className="text-[12px] text-text-mute">
              mode: {defaultImageMode}
            </span>
          </div>
          {/* Composite vs Replace toggle — определяет, рисует ли satori
              сверху typography или AI-картинка идёт сама по себе финалом. */}
          <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
            <span className="text-text-mute">render:</span>
            {(
              [
                { key: 'composite', label: 'composite', hint: 'satori поверх' },
                { key: 'replace', label: 'replace', hint: 'AI = финал' },
              ] as const
            ).map((m) => {
              const active = (slide.imageMode ?? 'composite') === m.key;
              return (
                <button
                  key={m.key}
                  type="button"
                  onClick={() =>
                    onSlideChange({
                      imageMode: m.key === 'composite' ? undefined : m.key,
                    })
                  }
                  className={`rounded-full border px-3 py-1 transition-colors ${
                    active
                      ? 'border-transparent bg-blue text-white'
                      : 'border-border-soft bg-white/[0.04] text-text-dim hover:bg-white/[0.07]'
                  }`}
                  title={m.hint}
                >
                  {m.label}
                </button>
              );
            })}
            <span className="ml-1 truncate text-text-mute">
              {(slide.imageMode ?? 'composite') === 'replace'
                ? 'AI картинка = финальный PNG (skip satori)'
                : 'satori типографика поверх AI-фона'}
            </span>
          </div>
          {isCover && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(
                [
                  { key: 'hero-avatar', label: 'Hero avatar', hint: 'identity-safe' },
                  { key: 'object', label: 'Object', hint: 'продукт / икон.' },
                  { key: 'ui', label: 'UI / Screen', hint: 'дашборд' },
                  { key: 'slide-media', label: 'Free media', hint: 'editorial' },
                ] as const
              ).map((m) => {
                const active = defaultImageMode === m.key;
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => handleDispatchImage(m.key)}
                    disabled={
                      imageBusyOrPending ||
                      (m.key === 'hero-avatar' && !coverAvatarId)
                    }
                    className={`rounded-2xl border px-3 py-2 text-left transition-colors ${
                      active
                        ? 'border-gold bg-blue/[0.12] text-text'
                        : 'border-border-soft bg-white/[0.03] text-text-dim hover:bg-white/[0.06]'
                    } disabled:cursor-not-allowed disabled:opacity-30`}
                    title={`mode = ${m.key}`}
                  >
                    <span className="block text-[12px] font-semibold">{m.label}</span>
                    <span className="mt-0.5 block text-[11px] text-text-mute">
                      {m.hint}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => handleDispatchImage()}
              disabled={imageBusyOrPending || Boolean(imageDisabledReason)}
              className="btn-primary !px-4 !py-2 text-[13px]"
              title={imageDisabledReason || `${defaultImageMode}`}
            >
              {imageBusyOrPending ? <Loader2 size={14} className="animate-spin" /> : <Palette size={14} />}
              {slide.imageStatus === 'pending'
                ? 'генерю…'
                : imageBusy
                  ? 'ставлю в очередь…'
                  : slide.image
                    ? 'regenerate'
                    : 'generate'}
              {!imageBusyOrPending && <ArrowRight size={14} />}
            </button>
            <span className="text-[12px] text-text-mute">
              {imageDisabledReason
                ? imageDisabledReason
                : slide.imageStatus === 'pending'
                  ? 'kie работает ~10–30с'
                  : slide.imageStatus === 'failed'
                    ? 'fail, попробуй ещё'
                    : slide.imageStatus === 'done'
                      ? 'готово · нажми чтобы пересоздать'
                      : 'kie сгенерит и зальёт в media'}
            </span>
          </div>
          {(imageDispatchError || slide.imageError) && (
            <div className="break-all rounded-xl border border-danger/40 bg-danger/10 px-3 py-1.5 text-[12px] text-danger">
              {imageDispatchError || slide.imageError}
            </div>
          )}
        </div>

        <SlideMediaUploader
          value={slide.image ?? null}
          onChange={(url) => onSlideChange({ image: url ?? undefined })}
          disabled={isCover && activeCoverType === 'avatar'}
          coverHint={isCover && activeCoverType === 'avatar'}
          mediaHint={
            isCover
              ? activeCoverType === 'object'
                ? 'центральный объект (продукт/иконка/логотип)'
                : activeCoverType === 'ui'
                  ? 'скриншот UI / дашборда / браузера'
                  : activeCoverType === 'split'
                    ? 'split-обложке медиа не нужно'
                    : undefined
              : undefined
          }
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
  mediaHint,
}: {
  value: string | null;
  onChange: (url: string | null) => void;
  disabled?: boolean;
  coverHint?: boolean;
  mediaHint?: string;
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
        <span className="label">
          медиа · фото / скриншот / mockup
        </span>
        {coverHint ? (
          <span className="text-[12px] text-text-mute">
            на обложке используется аватар
          </span>
        ) : mediaHint ? (
          <span className="text-[12px] text-lime">{mediaHint}</span>
        ) : null}
      </div>

      {value ? (
        <div className="relative grid grid-cols-[160px_1fr] gap-4 overflow-hidden rounded-[20px] border border-border-soft bg-white/[0.03] p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt="slide media"
            className="h-[120px] w-full rounded-xl border border-border-soft bg-white/[0.04] object-cover"
          />
          <div className="grid gap-2 content-start min-w-0">
            <span className="truncate text-[13px] font-medium text-text-dim">{value.split('/').pop()}</span>
            <span className="text-[12px] leading-relaxed text-text-mute">
              Будет нарисовано как mockup-карточка в нижней части слайда после
              «Сгенерировать PNG».
            </span>
            <div className="flex items-center gap-2 mt-1">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={uploading || disabled}
                className="btn-ghost !px-3.5 !py-1.5 text-[12px]"
              >
                {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                {uploading ? 'загружаю…' : 'заменить'}
              </button>
              <button
                type="button"
                onClick={() => onChange(null)}
                disabled={uploading || disabled}
                className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] text-text-mute transition-colors hover:bg-danger/10 hover:text-danger disabled:opacity-30"
              >
                <Trash2 size={13} /> удалить
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
          className={`grid min-h-[96px] cursor-pointer place-items-center rounded-[24px] border border-dashed px-4 py-4 text-center transition-colors ${
            disabled
              ? 'cursor-not-allowed border-white/15 bg-white/[0.03] opacity-50'
              : dragOver
                ? 'border-gold/60 bg-blue/[0.06]'
                : 'border-white/15 bg-white/[0.03] hover:border-gold/60 hover:bg-blue/[0.06]'
          }`}
          role="button"
          aria-disabled={disabled || uploading}
          tabIndex={disabled ? -1 : 0}
        >
          {uploading ? (
            <span className="flex items-center gap-2 text-[13px] text-gold">
              <Loader2 size={14} className="animate-spin" /> загружаю…
            </span>
          ) : disabled ? (
            <span className="text-[13px] text-text-mute">
              недоступно для cover-слайда
            </span>
          ) : (
            <div className="grid justify-items-center gap-1.5">
              <Upload size={18} className="text-text-mute" />
              <span className="text-[13px] font-medium text-text-dim">
                перетащи фото или кликни
              </span>
              <span className="text-[12px] text-text-mute">
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
        <div className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-1.5 text-[12px] text-danger">
          {error}
        </div>
      )}
    </div>
  );
}
