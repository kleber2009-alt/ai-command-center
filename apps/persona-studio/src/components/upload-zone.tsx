'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { bytesHuman } from '@/lib/utils';

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
      return `${who}: ${f.error}`;
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
            setError(('error' in json && json.error) || `upload_failed_${res.status}`);
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
      setError((j as { error?: string }).error ?? `delete_failed_${res.status}`);
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
    setError(null);
    setBusy('generating');
    try {
      const res = await fetch('/api/generate-avatars', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ uploadId: primaryId, ...(extraBody ?? {}) }),
      });
      const json = (await res.json()) as GenResp | { error: string; have?: number; need?: number };
      if (!res.ok || 'error' in json) {
        const msg =
          'error' in json
            ? json.error === 'insufficient_tokens'
              ? `Недостаточно токенов: ${json.have}/${json.need}`
              : json.error
            : `generate_failed_${res.status}`;
        setError(msg);
        setBusy(null);
        return;
      }
      router.push(`/avatars?generationId=${json.id}`);
    } catch (e) {
      setError(String(e));
      setBusy(null);
    }
  }, [router, primaryId, extraBody]);

  return (
    <div className="grid gap-6">
      {/* Dropzone */}
      <div
        className="border border-border-2 border-dashed p-8 text-center bg-surface hover:bg-surface-2 cursor-pointer transition-colors"
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
        <div className="sec-num mb-3">/A · upload</div>
        <div className="font-serif italic text-[26px] leading-tight mb-3">
          {slotsLeft > 0
            ? `Перетащи до ${slotsLeft} фото или нажми, чтобы выбрать.`
            : `Лимит ${MAX_PHOTOS} фото достигнут — удали лишние.`}
        </div>
        <div className="mono text-[10px] tracking-widest uppercase text-text-mute">
          JPG · PNG · WEBP · HEIC · до 20 MB · мин. 512×512 · до {MAX_PHOTOS} фото на аккаунт
        </div>
        {busy === 'uploading' && (
          <div className="mono text-[10px] tracking-widest uppercase text-cyan mt-3 animate-pulse">
            /UPLOADING…
          </div>
        )}
      </div>

      {/* Gallery */}
      {uploads.length > 0 && (
        <div>
          <div className="flex items-baseline gap-3 mb-3">
            <span className="sec-num">/B · pick primary</span>
            <span className="font-serif italic text-[14px] text-text-dim">
              выбери фото, по которому строим 10 аватаров
            </span>
            <span className="flex-1 border-b border-border translate-y-[-3px]" />
            <span className="mono text-[10px] tracking-widest uppercase text-text-mute">
              {uploads.length} / {MAX_PHOTOS}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-[2px] bg-border border border-border">
            {uploads.map((u) => {
              const isPrimary = u.id === primaryId;
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => setPrimaryId(u.id)}
                  className={`relative bg-surface aspect-[4/5] overflow-hidden group transition-all ${
                    isPrimary ? 'outline outline-2 outline-lime outline-offset-[-2px]' : ''
                  }`}
                  style={{
                    backgroundImage: `url(${u.url})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }}
                >
                  {isPrimary && (
                    <span className="absolute top-2 left-2 mono text-[9px] tracking-widest uppercase text-[#0a1a00] bg-lime px-2 py-1 font-bold">
                      /primary
                    </span>
                  )}
                  <span className="absolute bottom-2 left-2 mono text-[8px] tracking-widest uppercase text-text-mute">
                    {bytesHuman(u.bytes)}
                  </span>
                  <span
                    role="button"
                    tabIndex={0}
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
                    className="absolute top-2 right-2 mono text-[10px] tracking-widest uppercase text-pink bg-[rgba(8,8,8,0.7)] px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  >
                    ✕
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Generate action */}
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          className="btn-primary"
          disabled={!primaryId || busy === 'generating'}
          onClick={handleGenerate}
        >
          {busy === 'generating' ? 'Generating 10 avatars…' : (generateLabel ?? 'Generate 10 Avatars →')}
        </button>
        <span className="mono text-[10px] tracking-widest uppercase text-text-mute">
          {costHint ?? 'Спишется 10 токенов · ~3-5 мин на Flux Kontext Pro'}
        </span>
        {error && (
          <span className="mono text-[11px] tracking-wider text-pink">/ERROR — {error}</span>
        )}
      </div>
    </div>
  );
}
