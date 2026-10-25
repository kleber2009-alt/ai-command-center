'use client';

// «Скиллы монтажа»: галерея стилей Студии Кадрика, форма запуска под выбранный
// стиль (видео / ссылка / текст) и список роликов с автополлингом. Монтирует
// бот Кадрика скиллом через Claude Code — см. src/lib/montage/kadrik.ts.

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDown, CalendarPlus, Download, FileArchive, Film, Link2, Loader2, Scissors, Upload } from 'lucide-react';
import { Icon3D } from '@/components/ui/icon3d';
import { findKadrikStyle, kadrikCostFactor, KADRIK_STYLES } from '@/lib/montage/kadrik-styles';
import { findMontagePreset } from '@/lib/montage/presets';
import { EditsStepper } from '@/components/edits-stepper';
import { StyleGallery } from '@/components/montage/style-gallery';
import { errorText, jobErrorText, exceptionText } from '@/lib/error-text';
import { statusLabel } from '@/lib/i18n';

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
  progress: string | null;
  createdAt: string;
};

const done = (s: string) => s === 'completed' || s === 'failed';

const statusClass = (s: string) =>
  s === 'completed' ? 'status-ready' : s === 'failed' ? 'status-failed' : s === 'pending' ? 'status-queued' : 'status-processing';

/** подпись стиля ролика: стиль Кадрика или старый ffmpeg-пресет */
const styleName = (id: string) => findKadrikStyle(id)?.name ?? findMontagePreset(id)?.label ?? id;

const DEFAULT_STYLE = 'montazh-rils';

export function MontageStudio({ videos, initial, cost }: { videos: Video[]; initial: MontageRow[]; cost: number }) {
  const router = useRouter();
  const [source, setSource] = useState<'video' | 'upload'>(videos.length ? 'video' : 'upload');
  const [videoId, setVideoId] = useState(videos[0]?.id ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [style, setStyle] = useState(DEFAULT_STYLE);
  const [link, setLink] = useState('');
  const [script, setScript] = useState('');
  const [wish, setWish] = useState('');
  const [ctaWord, setCtaWord] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<MontageRow[]>(initial);
  const fileRef = useRef<HTMLInputElement>(null);
  const [formVisible, setFormVisible] = useState(false);

  // плашка «Выбран …» нужна, пока листаешь галерею, — над формой она лишняя
  useEffect(() => {
    const el = document.getElementById('montage-form');
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setFormVisible(e.isIntersecting), { threshold: 0.05 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

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

  const st = findKadrikStyle(style) ?? KADRIK_STYLES[0];
  const price = cost * kadrikCostFactor(st);
  const inputReady =
    st.inp === 'video'
      ? source === 'video'
        ? Boolean(videoId)
        : Boolean(file)
      : st.inp === 'link'
        ? /^https?:\/\/\S+$/.test(link.trim())
        : Boolean(script.trim());

  function pick(id: string) {
    setStyle(id);
    setError(null);
  }

  async function submit() {
    setError(null);
    try {
      let sourceUrl: string | undefined;
      if (st.inp === 'video' && source === 'upload') {
        if (!file) return;
        setBusy('Загружаю запись…');
        const up = await fetch('/api/montages/upload', {
          method: 'POST',
          headers: { 'content-type': file.type || 'video/mp4' },
          body: file,
        });
        const uj = await up.json().catch(() => ({}));
        if (!up.ok) throw new Error(uj.error === 'file_too_large' ? 'Файл больше 500 МБ' : errorText(uj, up.status));
        sourceUrl = uj.url;
      }
      setBusy('Отправляю Кадрику…');
      const res = await fetch('/api/montages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          style,
          ...(st.inp === 'video' ? (source === 'video' ? { videoGenerationId: videoId } : { sourceUrl }) : {}),
          ...(st.inp === 'link' ? { link: link.trim() } : {}),
          ...(st.inp === 'text' ? { script: script.trim() } : {}),
          wish: wish.trim() || undefined,
          ctaWord: ctaWord.trim() || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          json.error === 'insufficient_tokens' ? `Не хватает токенов: нужно ${json.need}, есть ${json.have}` : errorText(json, res.status),
        );
      }
      setRows((r) => [
        {
          id: json.id,
          style,
          format: st.format,
          hookTitle: null,
          ctaWord: ctaWord.trim() || null,
          status: 'pending',
          resultUrl: null,
          durationSec: null,
          errorMsg: null,
          progress: 'в очереди',
          createdAt: new Date().toISOString(),
        },
        ...r,
      ]);
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      router.refresh();
    } catch (e) {
      setError(exceptionText(e));
    } finally {
      setBusy(null);
    }
  }

  const jump = (key: string) => document.getElementById(`montage-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const steps = [
    { key: 'style', label: 'Стиль', done: Boolean(style) },
    { key: 'source', label: st.inp === 'link' ? 'Ссылка' : st.inp === 'text' ? 'Текст' : 'Исходник', done: inputReady },
    { key: 'text', label: 'Пожелания', done: Boolean(wish || ctaWord) },
    { key: 'go', label: 'Монтаж', done: false },
  ];

  return (
    <div className="grid gap-8">
      {/* 01 — стиль: галерея как на витрине */}
      <section id="montage-style" className="grid scroll-mt-24 gap-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <span className="flex items-center gap-2.5">
            <span className="sec-num">01</span>
            <span className="sec-title">стиль монтажа · {KADRIK_STYLES.length} из Студии Кадрика</span>
          </span>
          <span className="text-[12px] text-text-mute">примеры — на заглушке; твой монтаж — на твоём видео, в твоих цветах и шрифтах</span>
        </div>
        <StyleGallery value={style} onChange={pick} />
      </section>

      <section id="montage-form" className="panel reveal grid scroll-mt-24 gap-6 p-5 sm:p-6">
        <EditsStepper steps={steps} activeKey={!inputReady ? 'source' : wish || ctaWord ? 'go' : 'text'} onJump={jump} />

        {/* выбранный стиль */}
        <div className="flex flex-wrap items-center gap-4 rounded-[20px] border border-border-soft bg-white/[0.03] p-3">
          <div className={`relative shrink-0 overflow-hidden rounded-xl bg-[#1c1c1f] ${st.format === '16:9' ? 'h-[54px] w-24' : 'h-24 w-[54px]'}`}>
            {st.poster ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={st.poster} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="grid h-full place-items-center text-[10px] text-text-mute">{st.format === 'text' ? 'текст' : st.format}</span>
            )}
          </div>
          <div className="grid min-w-0 flex-1 gap-1">
            <span className="text-[16px] font-semibold leading-tight text-text">{st.name}</span>
            <span className="text-[12px] text-text-mute">
              на входе: {st.need || '—'} · на выходе: {st.get || '—'}
            </span>
          </div>
          <button type="button" onClick={() => jump('style')} className="btn-ghost !px-3.5 !py-1.5 text-[12px]">
            сменить стиль
          </button>
        </div>

        {/* 02 — вход под стиль */}
        <div id="montage-source" className="grid scroll-mt-24 gap-3">
          <span className="flex items-center gap-2.5">
            <span className="sec-num">02</span>
            <span className="sec-title">{st.inp === 'link' ? 'ссылка на видео' : st.inp === 'text' ? 'текст или сценарий' : 'исходник'}</span>
          </span>
          {st.inp === 'video' && (
            <>
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
              <p className="text-[12px] text-text-mute">{st.need || 'видео с лицом'} · до 500 МБ</p>
            </>
          )}
          {st.inp === 'link' && (
            <label className="relative">
              <Link2 size={15} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text-mute" />
              <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://youtube.com/watch?v=…" className="input !pl-10" inputMode="url" />
            </label>
          )}
          {st.inp === 'text' && (
            <textarea
              value={script}
              onChange={(e) => setScript(e.target.value)}
              maxLength={20_000}
              rows={6}
              placeholder={st.kind === 'styles' ? 'О чём ролик: продукт, фичи, призыв в конце…' : 'Сценарий или текст урока'}
              className="input"
            />
          )}
        </div>

        {/* 03 — пожелания и призыв */}
        <div id="montage-text" className="grid scroll-mt-24 gap-4 sm:grid-cols-[1fr_240px]">
          <label className="grid gap-2">
            <span className="flex items-center gap-2.5">
              <span className="sec-num">03</span>
              <span className="sec-title">пожелания к монтажу</span>
            </span>
            <textarea
              value={wish}
              onChange={(e) => setWish(e.target.value)}
              maxLength={1500}
              rows={3}
              placeholder="титр хука, что подсветить, длительность, музыка — необязательно"
              className="input !min-h-[84px]"
            />
          </label>
          <label className="grid content-end gap-2">
            <span className="label">кодовое слово призыва</span>
            <input value={ctaWord} onChange={(e) => setCtaWord(e.target.value)} maxLength={24} placeholder="пиши «ГАЙД»" className="input" />
          </label>
        </div>

        <div id="montage-go" className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={submit} disabled={Boolean(busy) || !inputReady} className="btn-primary">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Scissors size={15} />}
            {busy ?? `Смонтировать «${st.name}» · ${price} токенов`}
          </button>
          <span className="text-[12px] text-text-mute">монтирует Кадрик скиллом через Claude Code · обычно 20–90 минут</span>
          {error && <span className="w-full text-[13px] text-danger">{error}</span>}
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
            <p className="text-[14px] text-text-dim">Пока пусто — выбери стиль выше и запусти первый монтаж.</p>
          </div>
        ) : (
          <div className="stagger grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((r) => {
              const wide = r.format === '16:9';
              const isText = r.format === 'text';
              return (
                <article key={r.id} className="panel grid content-start gap-3 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`status-badge ${statusClass(r.status)}`}>{statusLabel(r.status)}</span>
                    <span className="truncate text-[12px] text-text-mute">
                      {styleName(r.style)} · {isText ? 'текст' : r.format}
                    </span>
                  </div>
                  {r.status === 'completed' && r.resultUrl && !isText ? (
                    <video src={r.resultUrl} controls playsInline className={`w-full rounded-[18px] bg-black ${wide ? 'aspect-video' : 'aspect-[9/16]'}`} />
                  ) : (
                    <div
                      className={`grid w-full place-items-center rounded-[18px] border border-border-soft bg-white/[0.03] ${isText ? 'aspect-[4/3]' : wide ? 'aspect-video' : 'aspect-[9/16]'}`}
                    >
                      <span className={`flex flex-col items-center gap-2 px-4 text-center text-[12px] ${r.status === 'failed' ? 'text-danger' : 'text-text-mute'}`}>
                        {r.status === 'completed' ? (
                          <>
                            <FileArchive size={22} className="text-gold" />
                            <span className="line-clamp-6 whitespace-pre-line">{r.progress || 'готово — архив с результатом'}</span>
                          </>
                        ) : r.status === 'failed' ? (
                          jobErrorText(r.errorMsg)
                        ) : (
                          <>
                            <Loader2 size={18} className="animate-spin text-gold" />
                            <span className="line-clamp-4">{r.progress || 'монтирую…'}</span>
                          </>
                        )}
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
                        {!isText && (
                          <a href={`/schedule/new?source=montage&id=${r.id}`} className="btn-ghost !px-3.5 !py-1.5 text-[12px]">
                            <CalendarPlus size={13} /> в план
                          </a>
                        )}
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

      {/* выбранный стиль под рукой, пока листаешь галерею */}
      <div
        className={`pointer-events-none sticky bottom-4 z-20 -mt-4 flex justify-center transition-opacity duration-300 ${formVisible ? 'opacity-0 [&>*]:!pointer-events-none' : ''}`}
      >
        <button
          type="button"
          onClick={() => jump('form')}
          className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/15 bg-[#141416]/90 px-4 py-2 text-[13px] text-text shadow-editorial backdrop-blur"
        >
          Выбран «{st.name}» · {price} т. <ArrowDown size={14} className="text-gold" />
        </button>
      </div>
    </div>
  );
}
