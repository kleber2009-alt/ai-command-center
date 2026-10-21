'use client';

// «Скиллы монтажа»: форма запуска монтажа по стилю скилла + список готовых
// роликов с автополлингом. Источник — готовое аватар-видео или своя запись.

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarPlus, Download, Film, Loader2, Scissors, Upload } from 'lucide-react';
import { Icon3D } from '@/components/ui/icon3d';
import { MONTAGE_PRESETS, findMontagePreset } from '@/lib/montage/presets';
import { EditsStepper } from '@/components/edits-stepper';
import { PresetPreview } from './preset-preview';

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

const statusClass = (s: string) =>
  s === 'completed' ? 'status-ready' : s === 'failed' ? 'status-failed' : s === 'pending' ? 'status-queued' : 'status-processing';

export function MontageStudio({ videos, initial, cost }: { videos: Video[]; initial: MontageRow[]; cost: number }) {
  const router = useRouter();
  const [source, setSource] = useState<'video' | 'upload'>(videos.length ? 'video' : 'upload');
  const [videoId, setVideoId] = useState(videos[0]?.id ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [style, setStyle] = useState('palii');
  const [hovered, setHovered] = useState<string | null>(null);
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
      <section className="panel reveal grid gap-6 p-5 sm:p-6">
        <EditsStepper
          steps={steps}
          activeKey={!sourceReady ? 'source' : hookTitle || ctaWord ? 'go' : 'text'}
          onJump={(key) =>
            document.getElementById(`montage-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }
        />

        {/* 01 — исходник */}
        <div id="montage-source" className="grid scroll-mt-24 gap-3">
          <span className="flex items-center gap-2.5"><span className="sec-num">01</span><span className="sec-title">исходник</span></span>
          <div className="flex flex-wrap gap-2">
            {(['video', 'upload'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setSource(k)}
                className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] transition-colors ${source === k ? 'border-transparent bg-blue text-white' : 'border-border-soft bg-white/[0.04] text-text-dim hover:bg-white/[0.07]'}`}
              >
                {k === 'video' ? <Film size={14} /> : <Upload size={14} />}
                {k === 'video' ? `Готовое видео · ${videos.length}` : 'Своя запись'}
              </button>
            ))}
          </div>
          {source === 'video' ? (
            videos.length ? (
              <select value={videoId} onChange={(e) => setVideoId(e.target.value)} className="input">
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
            <label className="grid cursor-pointer place-items-center gap-1.5 rounded-[24px] border border-dashed border-white/15 bg-white/[0.03] px-4 py-6 text-center transition-colors hover:border-gold/60 hover:bg-blue/[0.06]">
              <Upload size={20} className="text-text-mute" />
              <span className="text-[13px] font-medium text-text-dim">{file ? file.name : 'Своя запись'}</span>
              <input
                ref={fileRef}
                type="file"
                accept="video/mp4,video/quicktime,video/webm,video/x-m4v"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="sr-only"
              />
            </label>
          )}
          <p className="text-[12px] text-text-mute">вертикальная запись лица для рилса · до 15 минут · до 500 МБ</p>
        </div>

        {/* 02 — стиль */}
        <div id="montage-style" className="grid scroll-mt-24 gap-3">
          <span className="flex items-center gap-2.5"><span className="sec-num">02</span><span className="sec-title">скилл-стиль монтажа · {MONTAGE_PRESETS.length}</span></span>
          <div className="stagger grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {MONTAGE_PRESETS.map((p) => {
              const active = p.id === style;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setStyle(p.id)}
                  onMouseEnter={() => setHovered(p.id)}
                  onMouseLeave={() => setHovered((h) => (h === p.id ? null : h))}
                  onFocus={() => setHovered(p.id)}
                  onBlur={() => setHovered((h) => (h === p.id ? null : h))}
                  className={`content-start grid gap-2.5 rounded-2xl border p-3 text-left transition-[transform,border-color,background-color,box-shadow] duration-300 ease-out hover:-translate-y-0.5 ${
                    active ? 'border-gold bg-blue/[0.12] shadow-glow' : 'border-border-soft bg-white/[0.03] hover:border-border-2 hover:bg-white/[0.06]'
                  }`}
                >
                  <PresetPreview preset={p} playing={active || hovered === p.id} />
                  <div className="flex items-center gap-2.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/skill-previews/${p.styleId ?? p.id}.jpg`} alt="" className="h-[44px] w-auto rounded-lg border border-border-soft" loading="lazy" />
                    <div className="grid gap-0.5 min-w-0">
                      <span className={`text-[14px] font-semibold leading-tight ${active ? 'text-text' : 'text-text-dim'}`}>{p.label}</span>
                      <span className="truncate text-[11px] text-text-mute">
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
        <div id="montage-text" className="grid scroll-mt-24 gap-4 sm:grid-cols-2">
          <label className="grid gap-2">
            <span className="flex items-center gap-2.5"><span className="sec-num">03</span><span className="sec-title">титр хука (первые 3 c)</span></span>
            <input
              value={hookTitle}
              onChange={(e) => setHookTitle(e.target.value)}
              maxLength={120}
              placeholder="монтаж рилсов *кодом* — в звёздочках акцент"
              className="input"
            />
          </label>
          <label className="grid content-end gap-2">
            <span className="label">кодовое слово призыва</span>
            <input
              value={ctaWord}
              onChange={(e) => setCtaWord(e.target.value)}
              maxLength={24}
              placeholder={`${preset.ctaVerb} «ГАЙД»`}
              className="input"
            />
          </label>
        </div>

        {/* опции */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-[20px] border border-border-soft bg-white/[0.03] px-4 py-3.5 text-[13px] text-text-dim">
          <label className="flex cursor-pointer items-center gap-2.5">
            <input type="checkbox" className="toggle" checked={cutSilence} onChange={(e) => setCutSilence(e.target.checked)} />
            резать паузы &gt; {preset.gapMax} c
          </label>
          <label className="flex cursor-pointer items-center gap-2.5">
            <input type="checkbox" className="toggle" checked={subtitles} onChange={(e) => setSubtitles(e.target.checked)} />
            пословные субтитры {preset.words[0]}–{preset.words[1]} сл.
          </label>
          <label className="flex cursor-pointer items-center gap-2.5">
            <input type="checkbox" className="toggle" checked={punch} onChange={(e) => setPunch(e.target.checked)} />
            зум-панчи на склейках
          </label>
          <span className="self-center text-[12px] text-text-mute">громкость −14 LUFS · {preset.format === '16:9' ? '1920×1080' : '1080×1920'}</span>
        </div>

        <div id="montage-go" className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={submit}
            disabled={Boolean(busy) || !sourceReady}
            className="btn-primary"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Scissors size={15} />}
            {busy ?? `Смонтировать · ${cost} токенов`}
          </button>
          {error && <span className="text-[13px] text-danger">{error}</span>}
        </div>
      </section>

      <section className="grid gap-3">
        <div className="flex items-center gap-3">
          <span className="sec-num">/02</span>
          <span className="sec-title">Ролики · {rows.length}</span>
          <span className="flex-1 border-b border-border-soft" />
        </div>
        {rows.length === 0 ? (
          <div className="panel flex items-center gap-4 p-6">
            <Icon3D name="montage" size={30} tile sway />
            <p className="text-[14px] text-text-dim">Пока пусто — запусти первый монтаж выше.</p>
          </div>
        ) : (
          <div className="stagger grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((r) => {
              const p = findMontagePreset(r.style);
              return (
                <article key={r.id} className="panel grid gap-3 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`status-badge ${statusClass(r.status)}`}>{r.status}</span>
                    <span className="truncate text-[12px] text-text-mute">
                      {p?.label ?? r.style} · {r.format}
                    </span>
                  </div>
                  {r.status === 'completed' && r.resultUrl ? (
                    <video
                      src={r.resultUrl}
                      controls
                      playsInline
                      className={`w-full rounded-[18px] bg-black ${r.format === '16:9' ? 'aspect-video' : 'aspect-[9/16]'}`}
                    />
                  ) : (
                    <div className={`grid w-full place-items-center rounded-[18px] border border-border-soft bg-white/[0.03] ${r.format === '16:9' ? 'aspect-video' : 'aspect-[9/16]'}`}>
                      <span className={`flex flex-col items-center gap-2 px-4 text-center text-[12px] ${r.status === 'failed' ? 'text-danger' : 'text-text-mute'}`}>
                        {r.status !== 'failed' && <Loader2 size={18} className="animate-spin text-gold" />}
                        {r.status === 'failed' ? r.errorMsg ?? 'ошибка' : 'распознаю речь · режу паузы · рендер…'}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-2 text-[12px] tabular-nums text-text-mute">
                    <span>
                      {new Date(r.createdAt).toLocaleString('ru-RU')}
                      {r.durationSec ? ` · ${r.durationSec.toFixed(1)} c` : ''}
                    </span>
                    {r.status === 'completed' && (
                      <span className="flex items-center gap-1.5">
                        <a href={`/schedule/new?source=montage&id=${r.id}`} className="btn-ghost !px-3.5 !py-1.5 text-[12px]">
                          <CalendarPlus size={13} /> в план
                        </a>
                        <a href={`/api/montages/${r.id}/download`} className="btn-ghost !px-3.5 !py-1.5 text-[12px]">
                          <Download size={13} /> скачать
                        </a>
                      </span>
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
