'use client';

// Клиентская часть страницы разбора ролика. Слева — превью + полные
// метрики + кнопки действий; справа — транскрипция и анализ (если есть)
// или CTA «заказать анализ». Дизайн в системе Persona Studio.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { igProxy } from './types';
import { apiErrorText } from './error-text';

type Reel = {
  id: string;
  url: string;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  caption: string | null;
  postedAt: string | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  durationSec: number | null;
  virality: number | null;
  engagementRate: number | null;
  velocity: number | null;
  viralScore: number | null;
  reach: number | null;
  language: string | null;
  hashtags: string[];
  author: {
    id: string;
    username: string;
    followers: number | null;
    medianViews: number | null;
    avatarUrl: string | null;
  };
  transcripts: Array<{
    id: string;
    text: string;
    improved: boolean;
    source: string;
    lang: string;
    createdAt: string;
  }>;
  analyses: Array<{
    id: string;
    hooks: unknown;
    storytelling: unknown;
    format: unknown;
    style: unknown;
    whyViral: string;
    recommendations: unknown;
    createdAt: string;
  }>;
};

type Hook = { text: string; formula?: string; strength?: number };
type Storytelling = { structure: string; beats: string[] };
type Format = { type: string; duration_band: string; pacing: string };
type Style = { visual: string; audio: string; text_overlay: boolean };

const fmt = (n: number) => {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
};

function relDate(iso: string | null): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  const d = Math.floor(ms / 86_400_000);
  if (d < 1) return 'сегодня';
  if (d < 7) return `${d} д. назад`;
  const w = Math.floor(d / 7);
  if (w < 4) return `${w} нед. назад`;
  const m = Math.floor(d / 30);
  if (m < 12) return `${m} мес. назад`;
  return `${Math.floor(d / 365)} г. назад`;
}

export function ReelDetailClient({ reel: initialReel }: { reel: Reel }) {
  const router = useRouter();
  const [reel, setReel] = useState<Reel>(initialReel);
  const [pendingTranscribe, startTranscribe] = useTransition();
  const [pendingAnalyze, startAnalyze] = useTransition();
  const [, startForge] = useTransition();
  const [pendingTranslate, startTranslate] = useTransition();
  const [translation, setTranslation] = useState<{ text: string; lang: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Модалка «Переработать в видео»: выбор источника текста.
  const [forgeOpen, setForgeOpen] = useState(false);
  const [forgeBusy, setForgeBusy] = useState<null | 'uniquify' | 'transcript' | 'transcribe'>(null);
  const [forgeError, setForgeError] = useState<string | null>(null);
  const [uniquified, setUniquified] = useState<{ text: string; parserItemId: string } | null>(null);

  const transcript = reel.transcripts[0] || null;
  const analysis = reel.analyses[0] || null;

  function transcribe() {
    setError(null);
    startTranscribe(async () => {
      const res = await fetch(`/api/research/reels/${reel.id}/transcribe`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) {
        setError(apiErrorText(json, res.status));
        return;
      }
      setReel((r) => ({ ...r, transcripts: [json.transcript, ...r.transcripts] }));
      router.refresh();
    });
  }

  function analyze() {
    setError(null);
    startAnalyze(async () => {
      const res = await fetch(`/api/research/reels/${reel.id}/analyze`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) {
        setError(apiErrorText(json, res.status));
        return;
      }
      setReel((r) => ({ ...r, analyses: [json.analysis, ...r.analyses] }));
      router.refresh();
    });
  }

  function copyTranscript() {
    if (!transcript) return;
    navigator.clipboard.writeText(transcript.text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function translate() {
    if (!transcript) return;
    setError(null);
    startTranslate(async () => {
      const res = await fetch(`/api/research/reels/${reel.id}/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'transcript', targetLang: 'ru' }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(apiErrorText(json, res.status));
        return;
      }
      setTranslation({ text: json.translated, lang: json.targetLang });
    });
  }

  // Открыть модалку выбора источника текста.
  function openForge() {
    setForgeError(null);
    setUniquified(null);
    setForgeOpen(true);
  }

  async function forge(mode: 'uniquify' | 'transcript'): Promise<{ parserItemId: string; script: string | null } | null> {
    const res = await fetch(`/api/research/reels/${reel.id}/forge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
    });
    const json = await res.json();
    if (!res.ok || !json.parserItemId) {
      setForgeError(apiErrorText(json, res.status));
      return null;
    }
    return { parserItemId: json.parserItemId, script: json.script ?? null };
  }

  // Уникализация: рерайт текста (тот же смысл/язык), показываем превью.
  function runUniquify() {
    setForgeError(null);
    setForgeBusy('uniquify');
    startForge(async () => {
      const r = await forge('uniquify');
      setForgeBusy(null);
      if (r && r.script) setUniquified({ text: r.script, parserItemId: r.parserItemId });
      else if (r) setForgeError('Не удалось уникализировать текст (Claude недоступен).');
    });
  }

  // Создать видео из дословного транскрипта.
  function createFromTranscript() {
    setForgeError(null);
    setForgeBusy('transcript');
    startForge(async () => {
      const r = await forge('transcript');
      setForgeBusy(null);
      if (r) router.push(`/videos/new?parserItemId=${r.parserItemId}`);
    });
  }

  // Создать видео из уникализированного текста (parserItem уже готов).
  function createFromUniquified() {
    if (!uniquified) return;
    router.push(`/videos/new?parserItemId=${uniquified.parserItemId}`);
  }

  // Заказать транскрибацию прямо из модалки (5 кр.).
  function transcribeInModal() {
    setForgeError(null);
    setForgeBusy('transcribe');
    startTranscribe(async () => {
      const res = await fetch(`/api/research/reels/${reel.id}/transcribe`, { method: 'POST' });
      const json = await res.json();
      setForgeBusy(null);
      if (!res.ok) {
        setForgeError(apiErrorText(json, res.status));
        return;
      }
      setReel((r) => ({ ...r, transcripts: [json.transcript, ...r.transcripts] }));
      router.refresh();
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      {/* Left: thumbnail + metrics + actions */}
      <aside className="grid gap-4">
        <div className="relative aspect-[4/5] border border-border bg-bg overflow-hidden">
          {reel.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={igProxy(reel.thumbnailUrl)}
              alt={reel.author.username}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center mono text-[10px] tracking-widest uppercase text-text-mute">
              REEL
            </div>
          )}
          {reel.virality != null && (
            <div className="absolute top-2 left-2 px-2 py-1 bg-black/85 border border-gold mono text-[13px] tracking-wider text-gold">
              🔥 {reel.virality.toFixed(1)}×
            </div>
          )}
        </div>

        <div className="border border-border bg-surface p-4 grid gap-3">
          <a
            href={`/research/author/${reel.author.username}`}
            className="flex items-center gap-2 hover:text-lime"
          >
            {reel.author.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={igProxy(reel.author.avatarUrl)}
                alt={reel.author.username}
                referrerPolicy="no-referrer"
                className="w-8 h-8 rounded-full object-cover bg-bg"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-bg border border-border" />
            )}
            <div className="flex-1 min-w-0">
              <div className="mono text-[12px] tracking-wider text-text">@{reel.author.username}</div>
              <div className="mono text-[9px] tracking-widest uppercase text-text-mute">
                {reel.author.followers != null ? `${fmt(reel.author.followers)} follow` : 'нет данных'}
                {reel.author.medianViews != null && ` · мед. ${fmt(reel.author.medianViews)}`}
              </div>
            </div>
            <span className="mono text-[9px] tracking-widest uppercase text-text-mute">↗</span>
          </a>

          <div className="grid grid-cols-2 gap-2">
            <Metric label="ПРОСМ." value={fmt(reel.views)} />
            <Metric label="ЛАЙКИ" value={fmt(reel.likes)} />
            <Metric label="КОММ." value={fmt(reel.comments)} />
            <Metric label="РЕПОСТ" value={reel.shares > 0 ? fmt(reel.shares) : '—'} />
            <Metric
              label="ВИРАЛЬН."
              value={reel.virality != null ? `${reel.virality.toFixed(1)}×` : '—'}
              accent="gold"
            />
            <Metric
              label="ВОВЛ."
              value={reel.engagementRate != null ? `${reel.engagementRate.toFixed(1)}%` : '—'}
              accent="cyan"
            />
            <Metric label="МЕДИАНА" value={reel.author.medianViews != null ? fmt(reel.author.medianViews) : '—'} />
            <Metric
              label="VS"
              value={reel.viralScore != null ? `${reel.viralScore.toFixed(0)}` : '—'}
              accent="lime"
            />
          </div>

          <div className="mono text-[9px] tracking-widest uppercase text-text-mute">
            {relDate(reel.postedAt)}
            {reel.durationSec ? ` · ${reel.durationSec}s` : ''}
            {reel.language ? ` · ${reel.language}` : ''}
          </div>

          <a
            href={reel.url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost text-[11px] tracking-widest uppercase text-center"
          >
            Открыть в Instagram ↗
          </a>
        </div>

        {/* Action buttons */}
        <div className="grid gap-2">
          <button
            type="button"
            onClick={analyze}
            disabled={pendingAnalyze || analysis !== null}
            className="btn-primary text-[12px] tracking-widest uppercase"
          >
            {analysis
              ? 'Анализ готов ✓'
              : pendingAnalyze
                ? 'Анализирую…'
                : 'Заказать анализ (5 кр.) →'}
          </button>
          <button
            type="button"
            onClick={openForge}
            className="btn-ghost text-[11px] tracking-widest uppercase border-gold/50 text-gold"
            title="Выбрать источник текста и создать видео"
          >
            Переработать в видео →
          </button>
          <button
            type="button"
            onClick={transcribe}
            disabled={pendingTranscribe || Boolean(transcript?.improved)}
            className="btn-ghost text-[11px] tracking-widest uppercase"
          >
            {transcript?.improved
              ? 'Транскрипт готов ✓'
              : pendingTranscribe
                ? 'Транскрибирую…'
                : 'Транскрибация (5 кр.)'}
          </button>
        </div>

        {error && (
          <div className="border border-pink/40 bg-pink/5 px-3 py-2 mono text-[10px] text-pink">
            {error}
          </div>
        )}
      </aside>

      {/* Right: caption + transcript + analysis */}
      <main className="grid gap-6">
        {reel.caption && (
          <section className="border border-border bg-surface p-5 grid gap-2">
            <h2 className="mono text-[10px] tracking-widest uppercase text-text-mute">Описание</h2>
            <p className="font-serif text-[14.5px] leading-relaxed text-text-dim whitespace-pre-wrap">
              {reel.caption}
            </p>
            {reel.hashtags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-2">
                {reel.hashtags.map((h) => (
                  <span
                    key={h}
                    className="mono text-[10px] tracking-wider text-cyan"
                  >
                    #{h}
                  </span>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Transcript */}
        <section className="border border-border bg-surface p-5 grid gap-3">
          <div className="flex items-center justify-between">
            <h2 className="mono text-[10px] tracking-widest uppercase text-text-mute">
              Транскрибация {transcript?.improved && '(улучшенная)'}
            </h2>
            {transcript && (
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={copyTranscript}
                  className="mono text-[9px] tracking-widest uppercase text-text-mute hover:text-lime"
                >
                  {copied ? '✓ скопировано' : 'копировать'}
                </button>
                <button
                  type="button"
                  onClick={translate}
                  disabled={pendingTranslate || Boolean(translation)}
                  className="mono text-[9px] tracking-widest uppercase text-text-mute hover:text-cyan"
                  title="Перевести на русский (1 кр.)"
                >
                  {translation ? '✓ переведено' : pendingTranslate ? 'перевожу…' : 'перевести (1 кр.)'}
                </button>
              </div>
            )}
          </div>
          {transcript ? (
            <>
              <p className="font-serif text-[14.5px] leading-relaxed text-text whitespace-pre-wrap">
                {transcript.text}
              </p>
              {translation && (
                <div className="border-t border-border-soft pt-3 grid gap-1">
                  <span className="mono text-[9px] tracking-widest uppercase text-cyan">
                    Перевод ({translation.lang})
                  </span>
                  <p className="font-serif text-[14.5px] leading-relaxed text-text whitespace-pre-wrap">
                    {translation.text}
                  </p>
                </div>
              )}
              {transcript.source === 'caption' && (
                <div className="border-l-2 border-warm bg-warm/5 px-3 py-2 mono text-[10px] tracking-wider text-text-dim">
                  Это описание поста, а не расшифровка речи — транскрибация аудио сейчас недоступна. Токены за запрос возвращены.
                </div>
              )}
            </>
          ) : (
            <p className="font-serif italic text-[14px] text-text-mute">
              Транскрипция не заказана. Без неё анализ будет основан только на описании и метриках.
            </p>
          )}
        </section>

        {/* Analysis */}
        {analysis ? (
          <AnalysisView analysis={analysis} />
        ) : (
          <section className="border border-border-soft bg-surface/50 p-8 text-center grid gap-3">
            <div className="font-serif italic text-[17px] text-text-dim">
              Глубокий разбор ещё не заказан.
            </div>
            <div className="font-serif text-[14px] text-text-mute max-w-prose mx-auto">
              Claude разложит ролик на компоненты: хуки, сторителлинг, формат, визуал, и объяснит ПОЧЕМУ
              именно этот ролик пробил медиану автора в {reel.virality?.toFixed(1) ?? '—'}× раз.
            </div>
            <button
              type="button"
              onClick={analyze}
              disabled={pendingAnalyze}
              className="btn-primary text-[12px] tracking-widest uppercase justify-self-center"
            >
              {pendingAnalyze ? 'Анализирую…' : 'Заказать анализ (5 кр.) →'}
            </button>
          </section>
        )}
      </main>

      {/* Модалка «Переработать в видео» — выбор источника текста */}
      {forgeOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => !forgeBusy && setForgeOpen(false)}
        >
          <div
            className="w-full max-w-3xl max-h-[88vh] overflow-y-auto border border-border bg-surface p-6 grid gap-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="grid gap-1">
                <h2 className="font-serif text-[20px] text-text">Переработать в видео</h2>
                <p className="mono text-[10px] tracking-widest uppercase text-text-mute">
                  Выбери источник текста для сценария
                </p>
              </div>
              <button
                type="button"
                onClick={() => !forgeBusy && setForgeOpen(false)}
                className="mono text-[12px] tracking-widest uppercase text-text-mute hover:text-text"
              >
                ✕
              </button>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {/* Вариант 1 — транскрибация (дословно) */}
              <div className="border border-border-soft bg-bg p-4 grid gap-3 content-start">
                <h3 className="mono text-[10px] tracking-widest uppercase text-cyan">
                  Транскрибация
                </h3>
                <p className="font-serif text-[13px] text-text-mute leading-snug">
                  Дословный текст из ролика — то, что реально произносится.
                </p>
                {transcript?.text ? (
                  <>
                    <div className="border border-border-soft bg-surface p-3 max-h-40 overflow-y-auto">
                      <p className="font-serif text-[13px] leading-relaxed text-text-dim whitespace-pre-wrap">
                        {transcript.text}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={createFromTranscript}
                      disabled={forgeBusy !== null}
                      className="btn-primary text-[11px] tracking-widest uppercase justify-center"
                    >
                      {forgeBusy === 'transcript' ? 'Готовлю…' : 'Создать видео →'}
                    </button>
                  </>
                ) : (
                  <>
                    <p className="font-serif italic text-[13px] text-text-mute">
                      Транскрипта ещё нет. Закажи транскрибацию ролика.
                    </p>
                    <button
                      type="button"
                      onClick={transcribeInModal}
                      disabled={forgeBusy !== null || pendingTranscribe}
                      className="btn-ghost text-[11px] tracking-widest uppercase justify-center"
                    >
                      {forgeBusy === 'transcribe' || pendingTranscribe ? 'Транскрибирую…' : 'Транскрибация (5 кр.)'}
                    </button>
                  </>
                )}
              </div>

              {/* Вариант 2 — уникализация (рерайт, тот же смысл/язык) */}
              <div className="border border-border-soft bg-bg p-4 grid gap-3 content-start">
                <h3 className="mono text-[10px] tracking-widest uppercase text-gold">
                  Уникализация
                </h3>
                <p className="font-serif text-[13px] text-text-mute leading-snug">
                  Новый текст — тот же смысл и язык, но переписан другими словами.
                </p>
                {uniquified ? (
                  <>
                    <div className="border border-gold/40 bg-surface p-3 max-h-40 overflow-y-auto">
                      <p className="font-serif text-[13px] leading-relaxed text-text whitespace-pre-wrap">
                        {uniquified.text}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={runUniquify}
                        disabled={forgeBusy !== null}
                        className="btn-ghost text-[10px] tracking-widest uppercase justify-center"
                      >
                        {forgeBusy === 'uniquify' ? 'Ещё раз…' : 'Заново'}
                      </button>
                      <button
                        type="button"
                        onClick={createFromUniquified}
                        disabled={forgeBusy !== null}
                        className="btn-primary text-[10px] tracking-widest uppercase justify-center"
                      >
                        Создать видео →
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="font-serif italic text-[13px] text-text-mute">
                      {transcript?.text
                        ? 'Источник — транскрипт ролика.'
                        : 'Источник — описание поста (или закажи транскрибацию слева для точности).'}
                    </p>
                    <button
                      type="button"
                      onClick={runUniquify}
                      disabled={forgeBusy !== null}
                      className="btn-primary text-[11px] tracking-widest uppercase justify-center"
                    >
                      {forgeBusy === 'uniquify' ? 'Уникализирую…' : 'Уникализировать'}
                    </button>
                  </>
                )}
              </div>
            </div>

            {forgeError && (
              <div className="border border-pink/40 bg-pink/5 px-3 py-2 mono text-[10px] text-pink">
                {forgeError}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: 'gold' | 'lime' | 'cyan' }) {
  const cls =
    accent === 'gold' ? 'text-gold' : accent === 'lime' ? 'text-lime' : accent === 'cyan' ? 'text-cyan' : 'text-text';
  return (
    <div className="grid gap-0.5 p-2 border border-border-soft bg-bg">
      <span className="mono text-[8px] tracking-widest uppercase text-text-mute">{label}</span>
      <span className={`font-serif text-[18px] leading-none ${cls}`}>{value}</span>
    </div>
  );
}

function AnalysisView({
  analysis,
}: {
  analysis: { hooks: unknown; storytelling: unknown; format: unknown; style: unknown; whyViral: string; recommendations: unknown };
}) {
  const hooks = Array.isArray(analysis.hooks) ? (analysis.hooks as Hook[]) : [];
  const story = analysis.storytelling as Storytelling | null;
  const format = analysis.format as Format | null;
  const style = analysis.style as Style | null;
  const recs = Array.isArray(analysis.recommendations)
    ? (analysis.recommendations as string[])
    : [];

  return (
    <section className="grid gap-4">
      {/* Why viral */}
      <div className="border border-gold/40 bg-gold/5 p-5 grid gap-2">
        <h3 className="mono text-[10px] tracking-widest uppercase text-gold">Почему залетело</h3>
        <p className="font-serif text-[15px] leading-relaxed text-text">{analysis.whyViral}</p>
      </div>

      {/* Hooks */}
      {hooks.length > 0 && (
        <div className="border border-border bg-surface p-5 grid gap-3">
          <h3 className="mono text-[10px] tracking-widest uppercase text-text-mute">Хуки</h3>
          <div className="grid gap-2">
            {hooks.map((h, i) => (
              <div key={i} className="border-l-2 border-lime pl-3 grid gap-1">
                <div className="font-serif text-[14.5px] text-text">«{h.text}»</div>
                <div className="flex gap-3 mono text-[9px] tracking-widest uppercase text-text-mute">
                  {h.formula && <span>формула: <span className="text-cyan">{h.formula}</span></span>}
                  {h.strength != null && <span>сила: <span className="text-lime">{h.strength}/10</span></span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Storytelling + Format + Style — 3 column on lg */}
      <div className="grid lg:grid-cols-3 gap-4">
        {story && (
          <div className="border border-border bg-surface p-4 grid gap-2">
            <h3 className="mono text-[10px] tracking-widest uppercase text-text-mute">Сторителлинг</h3>
            <div className="font-serif text-[14px] text-text">{story.structure}</div>
            {Array.isArray(story.beats) && story.beats.length > 0 && (
              <ol className="grid gap-1 mt-1">
                {story.beats.map((b, i) => (
                  <li key={i} className="font-serif text-[13px] text-text-dim">
                    <span className="mono text-[10px] tracking-wider text-text-mute">{i + 1}.</span> {b}
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
        {format && (
          <div className="border border-border bg-surface p-4 grid gap-2">
            <h3 className="mono text-[10px] tracking-widest uppercase text-text-mute">Формат</h3>
            <Row label="Тип" value={format.type} />
            <Row label="Длит." value={format.duration_band} />
            <Row label="Темп" value={format.pacing} />
          </div>
        )}
        {style && (
          <div className="border border-border bg-surface p-4 grid gap-2">
            <h3 className="mono text-[10px] tracking-widest uppercase text-text-mute">Стиль</h3>
            <Row label="Визуал" value={style.visual} />
            <Row label="Аудио" value={style.audio} />
            <Row label="Текст overlay" value={style.text_overlay ? 'да' : 'нет'} />
          </div>
        )}
      </div>

      {/* Recommendations */}
      {recs.length > 0 && (
        <div className="border border-lime/40 bg-lime/5 p-5 grid gap-3">
          <h3 className="mono text-[10px] tracking-widest uppercase text-lime">Рекомендации</h3>
          <ol className="grid gap-2">
            {recs.map((r, i) => (
              <li key={i} className="font-serif text-[14.5px] leading-snug text-text">
                <span className="mono text-[10px] tracking-wider text-lime">{String(i + 1).padStart(2, '0')}.</span> {r}
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-0.5">
      <span className="mono text-[9px] tracking-widest uppercase text-text-mute">{label}</span>
      <span className="font-serif text-[13.5px] text-text">{value || '—'}</span>
    </div>
  );
}
