'use client';

// Клиентская часть страницы разбора ролика. Слева — превью + полные
// метрики + кнопки действий; справа — транскрипция и анализ (если есть)
// или CTA «заказать анализ». Дизайн в системе Persona Studio.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, ArrowUpRight, Check, Clapperboard, Copy, ExternalLink, FileText, Flame, Languages, RefreshCw, Sparkles, Wand2, X } from 'lucide-react';
import { Icon3D } from '@/components/ui/icon3d';
import { igProxy } from './types';

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
        setError(json.message || json.error || `HTTP ${res.status}`);
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
        setError(json.message || json.error || `HTTP ${res.status}`);
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
        setError(json.message || json.error || `HTTP ${res.status}`);
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
      setForgeError(json.message || json.error || `HTTP ${res.status}`);
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
        setForgeError(json.message || json.error || `HTTP ${res.status}`);
        return;
      }
      setReel((r) => ({ ...r, transcripts: [json.transcript, ...r.transcripts] }));
      router.refresh();
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      {/* Left: thumbnail + metrics + actions */}
      <aside className="grid gap-4 content-start stagger">
        <div className="panel relative aspect-[4/5] overflow-hidden">
          {reel.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={igProxy(reel.thumbnailUrl)}
              alt={reel.author.username}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Icon3D name="video" size={48} />
            </div>
          )}
          {reel.virality != null && (
            <div className="absolute top-3 left-3 inline-flex items-center gap-1 rounded-full bg-blue px-3 py-1 text-[14px] font-bold tabular-nums text-white shadow-glow">
              <Flame className="h-4 w-4" />
              {reel.virality.toFixed(1)}×
            </div>
          )}
        </div>

        <div className="panel p-4 grid gap-3">
          <a
            href={`/research/author/${reel.author.username}`}
            className="group flex items-center gap-3 rounded-2xl p-1 transition-colors hover:bg-white/[0.04]"
          >
            {reel.author.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={igProxy(reel.author.avatarUrl)}
                alt={reel.author.username}
                referrerPolicy="no-referrer"
                className="w-9 h-9 rounded-full object-cover bg-white/[0.05] ring-1 ring-white/10"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-white/[0.05] ring-1 ring-white/10" />
            )}
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-medium text-text group-hover:text-gold transition-colors">@{reel.author.username}</div>
              <div className="text-[12px] tabular-nums text-text-mute">
                {reel.author.followers != null ? `${fmt(reel.author.followers)} follow` : 'нет данных'}
                {reel.author.medianViews != null && ` · мед. ${fmt(reel.author.medianViews)}`}
              </div>
            </div>
            <ArrowUpRight className="h-4 w-4 text-text-mute group-hover:text-gold" />
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

          <div className="text-[12px] text-text-mute">
            {relDate(reel.postedAt)}
            {reel.durationSec ? ` · ${reel.durationSec}s` : ''}
            {reel.language ? ` · ${reel.language}` : ''}
          </div>

          <a
            href={reel.url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost w-full !py-2.5 !text-[13px]"
          >
            Открыть в Instagram
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>

        {/* Action buttons */}
        <div className="grid gap-2">
          <button
            type="button"
            onClick={analyze}
            disabled={pendingAnalyze || analysis !== null}
            className="btn-primary w-full"
          >
            {analysis ? <Check className="h-4 w-4" /> : pendingAnalyze ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {analysis
              ? 'Анализ готов'
              : pendingAnalyze
                ? 'Анализирую…'
                : 'Заказать анализ (5 кр.)'}
          </button>
          <button
            type="button"
            onClick={openForge}
            className="btn-ghost w-full !border-gold/40 !text-gold"
            title="Выбрать источник текста и создать видео"
          >
            <Clapperboard className="h-4 w-4" />
            Переработать в видео
          </button>
          <button
            type="button"
            onClick={transcribe}
            disabled={pendingTranscribe || Boolean(transcript?.improved)}
            className="btn-ghost w-full"
          >
            {transcript?.improved ? <Check className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
            {transcript?.improved
              ? 'Транскрипт готов'
              : pendingTranscribe
                ? 'Транскрибирую…'
                : 'Транскрибация (5 кр.)'}
          </button>
        </div>

        {error && (
          <div className="rounded-2xl border border-pink/40 bg-pink/[0.06] px-4 py-2.5 text-[13px] text-pink">
            {error}
          </div>
        )}
      </aside>

      {/* Right: caption + transcript + analysis */}
      <main className="grid gap-6 content-start stagger">
        {reel.caption && (
          <section className="panel p-6 grid gap-3">
            <h2 className="flex items-center gap-3">
              <span className="sec-num">/01</span>
              <span className="sec-title">Описание</span>
            </h2>
            <p className="text-[14.5px] leading-relaxed text-text-dim whitespace-pre-wrap">
              {reel.caption}
            </p>
            {reel.hashtags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {reel.hashtags.map((h) => (
                  <span
                    key={h}
                    className="rounded-full bg-cyan/[0.08] px-2.5 py-0.5 text-[12px] text-cyan"
                  >
                    #{h}
                  </span>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Transcript */}
        <section className="panel p-6 grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-3">
              <span className="sec-num">/02</span>
              <span className="sec-title">Транскрибация {transcript?.improved && '(улучшенная)'}</span>
            </h2>
            {transcript && (
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={copyTranscript}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border-soft bg-white/[0.04] px-3 py-1.5 text-[12px] text-text-dim transition-colors hover:bg-white/[0.07] hover:text-lime"
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'скопировано' : 'копировать'}
                </button>
                <button
                  type="button"
                  onClick={translate}
                  disabled={pendingTranslate || Boolean(translation)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border-soft bg-white/[0.04] px-3 py-1.5 text-[12px] text-text-dim transition-colors hover:bg-white/[0.07] hover:text-cyan disabled:opacity-60"
                  title="Перевести на русский (1 кр.)"
                >
                  {translation ? <Check className="h-3.5 w-3.5" /> : <Languages className="h-3.5 w-3.5" />}
                  {translation ? 'переведено' : pendingTranslate ? 'перевожу…' : 'перевести (1 кр.)'}
                </button>
              </div>
            )}
          </div>
          {transcript ? (
            <>
              <p className="text-[14.5px] leading-relaxed text-text whitespace-pre-wrap">
                {transcript.text}
              </p>
              {translation && (
                <div className="border-t border-border-soft pt-3 grid gap-1.5">
                  <span className="label !text-cyan">
                    Перевод ({translation.lang})
                  </span>
                  <p className="text-[14.5px] leading-relaxed text-text whitespace-pre-wrap">
                    {translation.text}
                  </p>
                </div>
              )}
              {transcript.source === 'caption' && (
                <div className="rounded-2xl border border-amber/25 bg-amber/[0.06] px-4 py-2.5 text-[12.5px] text-text-dim">
                  Источник — описание поста (whisper-сервис не настроен). Для реальной речи подключи WHISPER_SERVICE_URL.
                </div>
              )}
            </>
          ) : (
            <p className="text-[14px] text-text-mute">
              Транскрипция не заказана. Без неё анализ будет основан только на описании и метриках.
            </p>
          )}
        </section>

        {/* Analysis */}
        {analysis ? (
          <AnalysisView analysis={analysis} />
        ) : (
          <section className="rounded-[24px] border border-dashed border-white/15 bg-white/[0.03] p-8 flex flex-col items-center text-center gap-3">
            <Icon3D name="brain" size={40} tile />
            <div className="text-[17px] font-semibold tracking-[-0.02em] text-text">
              Глубокий разбор ещё не заказан.
            </div>
            <div className="text-[14px] text-text-dim max-w-prose">
              Claude разложит ролик на компоненты: хуки, сторителлинг, формат, визуал, и объяснит ПОЧЕМУ
              именно этот ролик пробил медиану автора в {reel.virality?.toFixed(1) ?? '—'}× раз.
            </div>
            <button
              type="button"
              onClick={analyze}
              disabled={pendingAnalyze}
              className="btn-primary mt-1"
            >
              {pendingAnalyze ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {pendingAnalyze ? 'Анализирую…' : 'Заказать анализ (5 кр.)'}
            </button>
          </section>
        )}
      </main>

      {/* Модалка «Переработать в видео» — выбор источника текста */}
      {forgeOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 fade-in"
          onClick={() => !forgeBusy && setForgeOpen(false)}
        >
          <div
            className="panel !bg-surface/95 shadow-glass w-full max-w-3xl max-h-[88vh] overflow-y-auto p-6 grid gap-5 pop-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <Icon3D name="video" size={26} tile />
                <div className="grid gap-0.5">
                  <h2 className="text-[20px] font-semibold tracking-[-0.02em] text-text">Переработать в видео</h2>
                  <p className="text-[13px] text-text-mute">
                    Выбери источник текста для сценария
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !forgeBusy && setForgeOpen(false)}
                aria-label="Закрыть"
                className="btn-icon shrink-0"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {/* Вариант 1 — транскрибация (дословно) */}
              <div className="rounded-[20px] border border-border-soft bg-white/[0.03] p-5 grid gap-3 content-start">
                <h3 className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.02em] text-cyan">
                  <FileText className="h-4 w-4" />
                  Транскрибация
                </h3>
                <p className="text-[13px] text-text-mute leading-snug">
                  Дословный текст из ролика — то, что реально произносится.
                </p>
                {transcript?.text ? (
                  <>
                    <div className="rounded-2xl border border-border-soft bg-white/[0.03] p-3.5 max-h-40 overflow-y-auto">
                      <p className="text-[13px] leading-relaxed text-text-dim whitespace-pre-wrap">
                        {transcript.text}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={createFromTranscript}
                      disabled={forgeBusy !== null}
                      className="btn-primary"
                    >
                      {forgeBusy === 'transcript' ? 'Готовлю…' : 'Создать видео'}
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-[13px] text-text-mute">
                      Транскрипта ещё нет. Закажи транскрибацию ролика.
                    </p>
                    <button
                      type="button"
                      onClick={transcribeInModal}
                      disabled={forgeBusy !== null || pendingTranscribe}
                      className="btn-ghost"
                    >
                      {forgeBusy === 'transcribe' || pendingTranscribe ? 'Транскрибирую…' : 'Транскрибация (5 кр.)'}
                    </button>
                  </>
                )}
              </div>

              {/* Вариант 2 — уникализация (рерайт, тот же смысл/язык) */}
              <div className="rounded-[20px] border border-border-soft bg-white/[0.03] p-5 grid gap-3 content-start">
                <h3 className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.02em] text-gold">
                  <Wand2 className="h-4 w-4" />
                  Уникализация
                </h3>
                <p className="text-[13px] text-text-mute leading-snug">
                  Новый текст — тот же смысл и язык, но переписан другими словами.
                </p>
                {uniquified ? (
                  <>
                    <div className="rounded-2xl border border-gold/30 bg-blue/[0.06] p-3.5 max-h-40 overflow-y-auto">
                      <p className="text-[13px] leading-relaxed text-text whitespace-pre-wrap">
                        {uniquified.text}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={runUniquify}
                        disabled={forgeBusy !== null}
                        className="btn-ghost !px-3 !text-[13px]"
                      >
                        <RefreshCw className={`h-4 w-4 ${forgeBusy === 'uniquify' ? 'animate-spin' : ''}`} />
                        {forgeBusy === 'uniquify' ? 'Ещё раз…' : 'Заново'}
                      </button>
                      <button
                        type="button"
                        onClick={createFromUniquified}
                        disabled={forgeBusy !== null}
                        className="btn-primary !px-3 !text-[13px]"
                      >
                        Создать видео
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-[13px] text-text-mute">
                      {transcript?.text
                        ? 'Источник — транскрипт ролика.'
                        : 'Источник — описание поста (или закажи транскрибацию слева для точности).'}
                    </p>
                    <button
                      type="button"
                      onClick={runUniquify}
                      disabled={forgeBusy !== null}
                      className="btn-primary"
                    >
                      <Wand2 className="h-4 w-4" />
                      {forgeBusy === 'uniquify' ? 'Уникализирую…' : 'Уникализировать'}
                    </button>
                  </>
                )}
              </div>
            </div>

            {forgeError && (
              <div className="rounded-2xl border border-pink/40 bg-pink/[0.06] px-4 py-2.5 text-[13px] text-pink">
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
    <div className="grid gap-1 rounded-2xl border border-border-soft bg-white/[0.03] px-3 py-2.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-text-mute">{label}</span>
      <span className={`text-[19px] font-extrabold tabular-nums tracking-[-0.02em] leading-none ${cls}`}>{value}</span>
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
      <div className="panel !border-gold/30 !bg-blue/[0.06] p-6 grid gap-2.5">
        <h3 className="flex items-center gap-2.5 text-[15px] font-semibold tracking-[-0.02em] text-gold">
          <Icon3D name="viral" size={20} tile />
          Почему залетело
        </h3>
        <p className="text-[15px] leading-relaxed text-text">{analysis.whyViral}</p>
      </div>

      {/* Hooks */}
      {hooks.length > 0 && (
        <div className="panel p-6 grid gap-3">
          <h3 className="flex items-center gap-2.5 text-[15px] font-semibold tracking-[-0.02em] text-text">
            <Icon3D name="hooks" size={20} tile />
            Хуки
          </h3>
          <div className="grid gap-2">
            {hooks.map((h, i) => (
              <div key={i} className="rounded-2xl border border-lime/20 bg-lime/[0.04] px-4 py-3 grid gap-1.5">
                <div className="text-[14.5px] font-medium text-text">«{h.text}»</div>
                <div className="flex flex-wrap gap-3 text-[12px] text-text-mute">
                  {h.formula && <span>формула: <span className="text-cyan">{h.formula}</span></span>}
                  {h.strength != null && <span>сила: <span className="font-semibold tabular-nums text-lime">{h.strength}/10</span></span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Storytelling + Format + Style — 3 column on lg */}
      <div className="grid lg:grid-cols-3 gap-4">
        {story && (
          <div className="panel p-5 grid gap-2 content-start">
            <h3 className="label">Сторителлинг</h3>
            <div className="text-[14px] font-medium text-text">{story.structure}</div>
            {Array.isArray(story.beats) && story.beats.length > 0 && (
              <ol className="grid gap-1.5 mt-1">
                {story.beats.map((b, i) => (
                  <li key={i} className="flex gap-2 text-[13px] text-text-dim">
                    <span className="tabular-nums text-text-mute">{i + 1}.</span> <span>{b}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
        {format && (
          <div className="panel p-5 grid gap-2.5 content-start">
            <h3 className="label">Формат</h3>
            <Row label="Тип" value={format.type} />
            <Row label="Длит." value={format.duration_band} />
            <Row label="Темп" value={format.pacing} />
          </div>
        )}
        {style && (
          <div className="panel p-5 grid gap-2.5 content-start">
            <h3 className="label">Стиль</h3>
            <Row label="Визуал" value={style.visual} />
            <Row label="Аудио" value={style.audio} />
            <Row label="Текст overlay" value={style.text_overlay ? 'да' : 'нет'} />
          </div>
        )}
      </div>

      {/* Recommendations */}
      {recs.length > 0 && (
        <div className="panel !border-lime/30 !bg-lime/[0.05] p-6 grid gap-3">
          <h3 className="label !text-lime">Рекомендации</h3>
          <ol className="grid gap-2.5">
            {recs.map((r, i) => (
              <li key={i} className="flex gap-3 text-[14.5px] leading-snug text-text">
                <span className="inline-flex h-6 min-w-[30px] items-center justify-center rounded-full bg-lime/15 text-[11px] font-semibold tabular-nums text-lime">{String(i + 1).padStart(2, '0')}</span>
                <span>{r}</span>
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
      <span className="text-[12px] text-text-mute">{label}</span>
      <span className="text-[13.5px] text-text">{value || '—'}</span>
    </div>
  );
}
