'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Check, Loader2, X } from 'lucide-react';
import { bytesHuman } from '@/lib/utils';
import { Icon3D } from '@/components/ui/icon3d';
import { errorText } from '@/lib/error-text';

type UploadItem = {
  id: string;
  url: string;
  type: string;
  bytes: number;
  createdAt?: string;
};

type UploadFailure = {
  error: string;
  name?: string;
  mime?: string;
  bytes?: number;
  max?: number;
  detail?: string;
};
type MultiUploadResp = { uploads: UploadItem[]; errors?: UploadFailure[] };
type AllFailedResp = { error: 'all_failed'; errors: UploadFailure[] };
type GenResp = { id: string; status: string };

function describeFailure(f: UploadFailure): string {
  const who = f.name ? `${f.name}` : 'файл';
  switch (f.error) {
    case 'unsupported_mime':
      return `${who}: формат ${f.mime} не поддерживается (только JPG/PNG/WEBP/HEIC)`;
    case 'file_too_large': {
      const mb = f.bytes ? (f.bytes / 1024 / 1024).toFixed(1) : '?';
      const lim = f.max ? Math.round(f.max / 1024 / 1024) : '?';
      return `${who}: слишком большой (${mb} MB, лимит ${lim} MB)`;
    }
    case 'heic_decode_failed':
      return `${who}: HEIC не декодируется — пересохрани как JPG`;
    default:
      return `${who}: ${errorText(f.error)}`;
  }
}

const MAX_PHOTOS = 10;

export function UploadZone({
  initialUploads,
  extraBody,
  generateLabel,
  costHint,
}: {
  initialUploads?: UploadItem[];
  extraBody?: Record<string, unknown>;
  generateLabel?: string;
  costHint?: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploads, setUploads] = useState<UploadItem[]>(initialUploads ?? []);
  const [primaryId, setPrimaryId] = useState<string | null>(initialUploads?.[0]?.id ?? null);
  const [busy, setBusy] = useState<null | 'uploading' | 'generating'>(null);
  const [error, setError] = useState<string | null>(null);
  // Consent is required server-side before an avatar batch is enqueued.
  const [consent, setConsent] = useState(false);

  useEffect(() => {
    if (!primaryId && uploads.length > 0) setPrimaryId(uploads[0].id);
  }, [uploads, primaryId]);

  const slotsLeft = Math.max(0, MAX_PHOTOS - uploads.length);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      setError(null);
      if (!files || files.length === 0) return;
      if (slotsLeft === 0) {
        setError(`Достигнут лимит ${MAX_PHOTOS} фото. Удали лишние, чтобы загрузить новые.`);
        return;
      }
      const accepted = Array.from(files).slice(0, slotsLeft);
      const skipped = files.length - accepted.length;

      setBusy('uploading');
      try {
        const fd = new FormData();
        for (const f of accepted) fd.append('files', f);
        const res = await fetch('/api/upload', { method: 'POST', body: fd });
        const json = (await res.json()) as MultiUploadResp | AllFailedResp | { error: string };
        if (!res.ok || 'error' in json) {
          if ('errors' in json && Array.isArray(json.errors) && json.errors.length > 0) {
            setError(json.errors.map(describeFailure).join(' · '));
          } else {
            setError(errorText('error' in json ? json : null, res.status));
          }
          return;
        }
        setUploads((prev) => {
          const next = [...json.uploads, ...prev].slice(0, MAX_PHOTOS);
          if (!primaryId && next.length > 0) setPrimaryId(next[0].id);
          return next;
        });
        if (json.errors && json.errors.length > 0) {
          setError(json.errors.map(describeFailure).join(' · '));
        }
        if (skipped > 0) {
          setError((prev) => (prev ? prev + ' · ' : '') + `${skipped} файлов отброшено (превышен лимит ${MAX_PHOTOS})`);
        }
      } finally {
        setBusy(null);
      }
    },
    [slotsLeft, primaryId],
  );

  const handleDelete = useCallback(async (id: string) => {
    setError(null);
    const res = await fetch(`/api/upload/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(errorText(j as { error?: string }, res.status));
      return;
    }
    setUploads((prev) => prev.filter((u) => u.id !== id));
    setPrimaryId((prev) => (prev === id ? null : prev));
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!primaryId) {
      setError('Выбери основное фото для генерации');
      return;
    }
    if (!consent) {
      setError('Подтвердите согласие на обработку фото');
      return;
    }
    setError(null);
    setBusy('generating');
    try {
      const res = await fetch('/api/generate-avatars', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ uploadId: primaryId, consent: true, ...(extraBody ?? {}) }),
      });
      const json = (await res.json()) as GenResp | { error: string; have?: number; need?: number };
      if (!res.ok || 'error' in json) {
        setError(errorText('error' in json ? json : null, res.status));
        setBusy(null);
        return;
      }
      router.push(`/avatars?generationId=${json.id}`);
    } catch (e) {
      setError(String(e));
      setBusy(null);
    }
  }, [router, primaryId, extraBody, consent]);

  const label = busy === 'generating' ? 'Generating 10 avatars…' : (generateLabel ?? 'Generate 10 Avatars →');
  const labelText = label.replace(/\s*→\s*$/, '');
  const hasArrow = labelText !== label;

  return (
    <div className="grid gap-6">
      {/* Dropzone */}
      <div
        className={`group rounded-[24px] border border-dashed border-white/15 bg-white/[0.03] p-8 text-center transition-colors sm:p-10 ${
          slotsLeft > 0 ? 'cursor-pointer hover:border-gold/60 hover:bg-blue/[0.06]' : 'cursor-not-allowed opacity-80'
        }`}
        onClick={() => slotsLeft > 0 && inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          handleFiles(e.dataTransfer.files);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            if (e.target) e.target.value = '';
          }}
        />
        <div className="mb-4 flex justify-center">
          <Icon3D name={busy === 'uploading' ? 'processing' : 'assets'} size={34} tile sway />
        </div>
        <div className="sec-num mb-3">/00 · upload</div>
        <div className="mx-auto mb-3 max-w-[34ch] text-[22px] font-semibold leading-tight tracking-[-0.02em] sm:text-[26px]">
          {slotsLeft > 0
            ? `Перетащи до ${slotsLeft} фото или нажми, чтобы выбрать.`
            : `Лимит ${MAX_PHOTOS} фото достигнут — удали лишние.`}
        </div>
        <div className="text-[12px] text-text-mute">
          JPG · PNG · WEBP · HEIC · до 20 MB · мин. 512×512 · до {MAX_PHOTOS} фото на аккаунт
        </div>
        {busy === 'uploading' && (
          <div className="mt-5 flex justify-center">
            <span className="status-badge status-processing">/UPLOADING…</span>
          </div>
        )}
      </div>

      {/* Gallery */}
      {uploads.length > 0 && (
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <span className="sec-num">/01 · pick primary</span>
            <span className="sec-title">выбери фото, по которому строим 10 аватаров</span>
            <span className="hidden h-px flex-1 bg-border-soft sm:block" />
            <span className="text-[12px] text-text-mute tabular-nums">
              {uploads.length} / {MAX_PHOTOS}
            </span>
          </div>
          <div className="stagger grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
            {uploads.map((u) => {
              const isPrimary = u.id === primaryId;
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => setPrimaryId(u.id)}
                  aria-pressed={isPrimary}
                  className={`group relative aspect-[4/5] overflow-hidden rounded-[20px] border bg-surface transition-all duration-300 ease-settle hover:-translate-y-0.5 ${
                    isPrimary
                      ? 'border-transparent ring-2 ring-blue shadow-glow'
                      : 'border-border-soft hover:border-border-2'
                  }`}
                  style={{
                    backgroundImage: `url(${u.url})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }}
                >
                  <span className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/60 to-transparent" />
                  {isPrimary && (
                    <span className="pop-in absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-blue px-2.5 py-1 text-[11px] font-semibold text-white">
                      <Check size={12} aria-hidden />
                      primary
                    </span>
                  )}
                  <span className="absolute bottom-2 left-2.5 text-[11px] font-medium text-white/80 tabular-nums">
                    {bytesHuman(u.bytes)}
                  </span>
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label="Удалить фото"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm('Удалить это фото?')) handleDelete(u.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.stopPropagation();
                        if (confirm('Удалить это фото?')) handleDelete(u.id);
                      }
                    }}
                    className="absolute right-2 top-2 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-white/15 bg-black/55 text-white opacity-0 backdrop-blur-md transition-opacity hover:bg-danger focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <X size={14} aria-hidden />
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Consent — required before enqueuing an avatar batch */}
      <label className="panel flex max-w-xl cursor-pointer items-center gap-4 px-5 py-4 text-[13px] leading-snug text-text-dim">
        <input
          type="checkbox"
          className="toggle"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />
        <span>
          Это моё фото (или у меня есть согласие изображённого человека), и я разрешаю
          его обработку для генерации AI-аватаров.
        </span>
      </label>

      {/* Generate action */}
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          className="btn-primary"
          disabled={!primaryId || !consent || busy === 'generating'}
          onClick={handleGenerate}
        >
          {busy === 'generating' && <Loader2 size={16} className="animate-spin" aria-hidden />}
          {labelText}
          {hasArrow && <ArrowRight size={16} aria-hidden />}
        </button>
        <span className="text-[12px] text-text-mute">
          {costHint}
        </span>
        {error && (
          <span className="fade-in w-full rounded-2xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-[13px] text-danger">
            /ERROR — {error}
          </span>
        )}
      </div>
    </div>
  );
}
