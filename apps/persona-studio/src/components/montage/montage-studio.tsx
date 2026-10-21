'use client';

// «Скиллы монтажа»: форма запуска монтажа по стилю скилла + список готовых
// роликов с автополлингом. Источник — готовое аватар-видео или своя запись.

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MONTAGE_PRESETS, findMontagePreset } from '@/lib/montage/presets';
import { EditsStepper } from '@/components/edits-stepper';

type Video = { id: string; videoUrl: string | null; aspect: string; createdAt: string; label: string };
export type MontageRow = {
  id: string;
  style: string;
  format: string;
  hookTitle: string | null;
  ctaWord: string | null;
  status: string;
  resultUrl: string | null;
  durationSec: number | null;
  errorMsg: string | null;
  createdAt: string;
};

const done = (s: string) => s === 'completed' || s === 'failed';

export function MontageStudio({ videos, initial, cost }: { videos: Video[]; initial: MontageRow[]; cost: number }) {
  const router = useRouter();
  const [source, setSource] = useState<'video' | 'upload'>(videos.length ? 'video' : 'upload');
  const [videoId, setVideoId] = useState(videos[0]?.id ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [style, setStyle] = useState('palii');
  const [hookTitle, setHookTitle] = useState('');
  const [ctaWord, setCtaWord] = useState('');
  const [cutSilence, setCutSilence] = useState(true);
  const [subtitles, setSubtitles] = useState(true);
  const [punch, setPunch] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<MontageRow[]>(initial);
  const fileRef = useRef<HTMLInputElement>(null);

  // автополлинг незавершённых
  useEffect(() => {
    if (rows.every((r) => done(r.status))) return;
    const t = setTimeout(async () => {
      const res = await fetch('/api/montages?limit=50', { cache: 'no-store' }).catch(() => null);
      if (!res?.ok) return;
      const json = (await res.json()) as { montages: MontageRow[] };
      setRows(json.montages);
    }, 7000);
    return () => clearTimeout(t);
  }, [rows]);

  const preset = findMontagePreset(style)!;
  const sourceReady = source === 'video' ? Boolean(videoId) : Boolean(file);

  async function submit() {
    setError(null);
    try {
      let sourceUrl: string | undefined;
      if (source === 'upload') {
        if (!file) return;
        setBusy('Загружаю запись…');
        const up = await fetch('/api/montages/upload', {
          method: 'POST',
          headers: { 'content-type': file.type || 'video/mp4' },
          body: file,
        });
        const uj = await up.json().catch(() => ({}));
        if (!up.ok) throw new Error(uj.error === 'file_too_large' ? 'Файл больше 500 МБ' : uj.error || `upload HTTP ${up.status}`);
        sourceUrl = uj.url;
      }
      setBusy('Ставлю в очередь…');
      const res = await fetch('/api/montages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...(source === 'video' ? { videoGenerationId: videoId } : { sourceUrl }),
          style,
          hookTitle: hookTitle || undefined,
          ctaWord: ctaWord || undefined,
          options: { cutSilence, subtitles, punch },
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          json.error === 'insufficient_tokens' ? `Не хватает токенов: нужно ${json.need}, есть ${json.have}` : json.message || json.error || `HTTP ${res.status}`,
        );
      }
      setRows((r) => [
        { id: json.id, style, format: preset.format, hookTitle, ctaWord, status: 'pending', resultUrl: null, durationSec: null, errorMsg: null, createdAt: new Date().toISOString() },
        ...r,
      ]);
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const steps = [
    { key: 'source', label: 'Исходник', done: sourceReady },
    { key: 'style', label: 'Скилл-стиль', done: Boolean(style) },
    { key: 'text', label: 'Хук и призыв', done: Boolean(hookTitle || ctaWord) },
    { key: 'go', label: 'Монтаж', done: false },
  ];

  return (
    <div className="grid gap-8">
      <section className="grid gap-4 border border-border bg-surface p-4">
        <EditsStepper steps={steps} activeKey={sourceReady ? 'style' : 'source'} onJump={() => {}} />

        {/* 01 — исходник */}
        <div className="grid gap-2">
          <span className="mono text-[10px] tracking-[0.18em] uppercase text-text-mute">01 · исходник</span>
          <div className="flex gap-2">
            {(['video', 'upload'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setSource(k)}
                className={`border px-3 py-1.5 mono text-[11px] uppercase tracking-wider ${source === k ? 'border-lime text-lime' : 'border-border text-text-dim'}`}
              >
                {k === 'video' ? `Готовое видео · ${videos.length}` : 'Своя запись'}
              </button>
            ))}
          </div>
          {source === 'video' ? (
            videos.length ? (
              <select value={videoId} onChange={(e) => setVideoId(e.target.value)} className="border border-border bg-surface px-3 py-2 text-[13px]">
                {videos.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label} · {v.aspect} · {new Date(v.createdAt).toLocaleDateString('ru-RU')}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-[13px] text-text-dim">Готовых видео пока нет — загрузи свою запись.</p>
            )
          ) : (
            <input
              ref={fileRef}
              type="file"
              accept="video/mp4,video/quicktime,video/webm,video/x-m4v"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-[13px]"
            />
          )}
          <p className="mono text-[10px] text-text-mute">вертикальная запись лица для рилса · до 15 минут · до 500 МБ</p>
        </div>

        {/* 02 — стиль */}
        <div className="grid gap-2">
          <span className="mono text-[10px] tracking-[0.18em] uppercase text-text-mute">02 · скилл-стиль монтажа · {MONTAGE_PRESETS.length}</span>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
            {MONTAGE_PRESETS.map((p) => {
              const active = p.id === style;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setStyle(p.id)}
                  className={`text-left border p-2.5 grid gap-2 transition ${active ? 'border-lime bg-lime/[0.05]' : 'border-border hover:border-text-dim'}`}
                >
                  <div className="flex items-center gap-2.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/skill-previews/${p.styleId ?? p.id}.jpg`} alt="" className="h-[44px] w-auto border border-border" loading="lazy" />
                    <div className="grid gap-0.5 min-w-0">
                      <span className={`font-serif text-[14px] leading-tight ${active ? 'text-text' : 'text-text-dim'}`}>{p.label}</span>
                      <span className="mono text-[9px] tracking-wider text-text-mute uppercase truncate">
                        {p.format} · {p.skill}
                      </span>
                    </div>
                  </div>
                  <span className="text-[12px] leading-snug text-text-dim line-clamp-3">{p.description}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 03 — хук и призыв */}
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="grid gap-1">
            <span className="mono text-[10px] tracking-[0.18em] uppercase text-text-mute">03 · титр хука (первые 3 c)</span>
            <input
              value={hookTitle}
              onChange={(e) => setHookTitle(e.target.value)}
              maxLength={120}
              placeholder="монтаж рилсов *кодом* — в звёздочках акцент"
              className="border border-border bg-surface px-3 py-2 text-[13px]"
            />
          </label>
          <label className="grid gap-1">
            <span className="mono text-[10px] tracking-[0.18em] uppercase text-text-mute">кодовое слово призыва</span>
            <input
              value={ctaWord}
              onChange={(e) => setCtaWord(e.target.value)}
              maxLength={24}
              placeholder={`${preset.ctaVerb} «ГАЙД»`}
              className="border border-border bg-surface px-3 py-2 text-[13px]"
            />
          </label>
        </div>

        {/* опции */}
        <div className="flex flex-wrap gap-4 text-[13px] text-text-dim">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={cutSilence} onChange={(e) => setCutSilence(e.target.checked)} />
            резать паузы &gt; {preset.gapMax} c
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={subtitles} onChange={(e) => setSubtitles(e.target.checked)} />
            пословные субтитры {preset.words[0]}–{preset.words[1]} сл.
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={punch} onChange={(e) => setPunch(e.target.checked)} />
            зум-панчи на склейках
          </label>
          <span className="mono text-[10px] text-text-mute self-center">громкость −14 LUFS · {preset.format === '16:9' ? '1920×1080' : '1080×1920'}</span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={submit}
            disabled={Boolean(busy) || !sourceReady}
            className="border border-lime text-lime px-4 py-2 mono text-[11px] tracking-[0.18em] uppercase disabled:opacity-40 hover:bg-lime/[0.08] transition"
          >
            {busy ?? `Смонтировать · ${cost} токенов`}
          </button>
          {error && <span className="mono text-[11px] text-pink">{error}</span>}
        </div>
      </section>

      <section className="grid gap-3">
        <div className="flex items-baseline gap-3">
          <span className="sec-num">/02</span>
          <span className="sec-title">Ролики · {rows.length}</span>
          <span className="flex-1 border-b border-border translate-y-[-3px]" />
        </div>
        {rows.length === 0 ? (
          <p className="text-[13px] text-text-dim">Пока пусто — запусти первый монтаж выше.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {rows.map((r) => {
              const p = findMontagePreset(r.style);
              return (
                <article key={r.id} className="bg-surface border border-border p-4 grid gap-3">
                  <div className="flex items-baseline justify-between">
                    <span
                      className={`mono text-[10px] tracking-widest uppercase font-bold ${
                        r.status === 'completed' ? 'text-lime' : r.status === 'failed' ? 'text-pink' : 'text-cyan animate-pulse'
                      }`}
                    >
                      /{r.status}
                    </span>
                    <span className="mono text-[10px] tracking-widest text-text-mute uppercase">
                      {p?.label ?? r.style} · {r.format}
                    </span>
                  </div>
                  {r.status === 'completed' && r.resultUrl ? (
                    <video
                      src={r.resultUrl}
                      controls
                      playsInline
                      className={`w-full bg-black ${r.format === '16:9' ? 'aspect-video' : 'aspect-[9/16]'}`}
                    />
                  ) : (
                    <div className={`w-full bg-bg-panel border border-border-soft grid place-items-center ${r.format === '16:9' ? 'aspect-video' : 'aspect-[9/16]'}`}>
                      <span className="mono text-[10px] text-text-mute uppercase tracking-widest px-4 text-center">
                        {r.status === 'failed' ? r.errorMsg ?? 'ошибка' : 'распознаю речь · режу паузы · рендер…'}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between mono text-[10px] text-text-mute">
                    <span>
                      {new Date(r.createdAt).toLocaleString('ru-RU')}
                      {r.durationSec ? ` · ${r.durationSec.toFixed(1)} c` : ''}
                    </span>
                    {r.status === 'completed' && (
                      <a href={`/api/montages/${r.id}/download`} className="text-lime hover:underline uppercase tracking-widest">
                        скачать ↓
                      </a>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
