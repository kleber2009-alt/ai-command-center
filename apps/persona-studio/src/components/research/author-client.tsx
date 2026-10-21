'use client';

// Клиентский компонент страницы автора. Hero с метриками + грид рилсов
// + блок page-analysis (или CTA для заказа).

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ExternalLink, Eye, Flame, RefreshCw, Sparkles } from 'lucide-react';
import { Icon3D } from '@/components/ui/icon3d';
import { igProxy } from './types';

type Author = {
  id: string;
  username: string;
  followers: number | null;
  postsCount: number | null;
  avatarUrl: string | null;
  profileUrl: string | null;
  medianViews: number | null;
  engagementAvg: number | null;
  lowConfidence: boolean;
  lastIndexedAt: string | null;
  isWatching: boolean;
};

type Reel = {
  id: string;
  url: string;
  thumbnailUrl: string | null;
  caption: string | null;
  views: number;
  likes: number;
  comments: number;
  virality: number | null;
  engagementRate: number | null;
  postedAt: string | null;
};

type Analysis = {
  id: string;
  summary: string;
  outliers: unknown;
  cadence: unknown;
  bestFormats: unknown;
  bestTopics: unknown;
  recurringHooks: unknown;
  recommendations: unknown;
  createdAt: string;
};

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
  if (d < 30) return `${d} д.`;
  if (d < 365) return `${Math.floor(d / 30)} мес.`;
  return `${Math.floor(d / 365)} г.`;
}

export function AuthorClient({
  author: initialAuthor,
  reels: initialReels,
  analysis: initialAnalysis,
}: {
  author: Author;
  reels: Reel[];
  analysis: Analysis | null;
}) {
  const router = useRouter();
  const [author, setAuthor] = useState<Author>(initialAuthor);
  const [analysis, setAnalysis] = useState<Analysis | null>(initialAnalysis);
  const [pendingRefresh, startRefresh] = useTransition();
  const [pendingAnalyze, startAnalyze] = useTransition();
  const [pendingWatch, startWatch] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const reels = initialReels;

  function refresh() {
    setError(null);
    startRefresh(async () => {
      const res = await fetch(`/api/research/authors/${author.id}/refresh`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) {
        setError(json.message || json.error || `HTTP ${res.status}`);
        return;
      }
      router.refresh();
    });
  }

  function analyze() {
    setError(null);
    startAnalyze(async () => {
      const res = await fetch(`/api/research/authors/${author.id}/analyze-page`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) {
        setError(json.message || json.error || `HTTP ${res.status}`);
        return;
      }
      setAnalysis(json.analysis);
    });
  }

  function toggleWatch() {
    startWatch(async () => {
      const res = await fetch('/api/research/watchlist', {
        method: author.isWatching ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authorId: author.id }),
      });
      if (res.ok) {
        setAuthor((a) => ({ ...a, isWatching: !a.isWatching }));
      }
    });
  }

  return (
    <div className="grid gap-6">
      {/* Profile hero */}
      <section className="panel relative overflow-hidden !rounded-[28px] p-6 md:p-8 reveal">
        <div className="hero-gradient pointer-events-none absolute inset-0" />
        <div className="relative grid lg:grid-cols-[auto_1fr_auto] gap-6 items-start">
        {author.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={igProxy(author.avatarUrl)}
            alt={author.username}
            referrerPolicy="no-referrer"
            className="w-20 h-20 rounded-full object-cover bg-white/[0.05] ring-2 ring-white/15 pop-in"
          />
        ) : (
          <div className="w-20 h-20 rounded-full bg-white/[0.05] ring-2 ring-white/15 flex items-center justify-center">
            <Icon3D name="bloggers" size={36} />
          </div>
        )}

        <div className="grid gap-4 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-[30px] font-semibold tracking-[-0.02em] text-text leading-none">@{author.username}</h1>
            {author.lowConfidence && (
              <span className="status-badge status-partial">
                low confidence
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="ПОДПИСЧИКИ" value={author.followers != null ? fmt(author.followers) : '—'} />
            <Stat label="ПОСТЫ" value={author.postsCount != null ? fmt(author.postsCount) : '—'} />
            <Stat label="МЕДИАНА" value={author.medianViews != null ? fmt(author.medianViews) : '—'} accent="gold" />
            <Stat
              label="СРЕД. ER"
              value={author.engagementAvg != null ? `${author.engagementAvg.toFixed(1)}%` : '—'}
              accent="cyan"
            />
          </div>
          <div className="flex flex-wrap items-center gap-x-1 text-[12px] text-text-mute">
            обновлено: {relDate(author.lastIndexedAt)}
            {author.profileUrl && (
              <>
                {' · '}
                <a
                  href={author.profileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 hover:text-gold transition-colors"
                >
                  открыть профиль
                  <ExternalLink className="h-3 w-3" />
                </a>
              </>
            )}
          </div>
        </div>

        <div className="grid gap-2 lg:justify-items-end">
          <button
            type="button"
            onClick={analyze}
            disabled={pendingAnalyze || analysis !== null}
            className="btn-primary"
          >
            {analysis ? <Check className="h-4 w-4" /> : pendingAnalyze ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {analysis ? 'Анализ готов' : pendingAnalyze ? 'Анализирую…' : 'Анализ страницы (10 кр.)'}
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={refresh}
              disabled={pendingRefresh}
              className="btn-ghost !px-4 !py-2 !text-[13px]"
            >
              <RefreshCw className={`h-4 w-4 ${pendingRefresh ? 'animate-spin' : ''}`} />
              {pendingRefresh ? '…' : 'Обновить (5 кр.)'}
            </button>
            <button
              type="button"
              onClick={toggleWatch}
              disabled={pendingWatch}
              className={`btn-ghost !px-4 !py-2 !text-[13px] ${
                author.isWatching ? '!border-pink/50 !text-pink' : ''
              }`}
              title={author.isWatching ? 'Перестать наблюдать' : 'Добавить в наблюдение'}
            >
              {author.isWatching ? <Check className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              {author.isWatching ? 'в наблюдении' : 'наблюдать'}
            </button>
          </div>
        </div>
        </div>
      </section>

      {error && (
        <div className="rounded-2xl border border-pink/40 bg-pink/[0.06] px-4 py-2.5 text-[13px] text-pink fade-in">
          {error}
        </div>
      )}

      {/* Analysis block */}
      {analysis ? (
        <PageAnalysisView analysis={analysis} reels={reels} />
      ) : (
        <section className="rounded-[24px] border border-dashed border-white/15 bg-white/[0.03] p-8 flex flex-col items-center text-center gap-3 reveal" style={{ ['--i' as string]: 1 } as React.CSSProperties}>
          <Icon3D name="analytics" size={40} tile />
          <div className="text-[17px] font-semibold tracking-[-0.02em] text-text">
            Разбор страницы ещё не заказан.
          </div>
          <div className="text-[14px] text-text-dim max-w-prose">
            Claude посмотрит последние рилсы, найдёт выбросы, скажет на каком формате растёт аккаунт,
            что повторять и что игнорировать.
          </div>
        </section>
      )}

      {/* Reels grid */}
      <section className="grid gap-4">
        <h2 className="flex items-center gap-3">
          <span className="sec-num">/01</span>
          <span className="sec-title">Последние {reels.length} рилсов</span>
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 stagger">
          {reels.map((r) => (
            <ReelTile key={r.id} reel={r} />
          ))}
        </div>
      </section>
    </div>
  );
}

function ReelTile({ reel }: { reel: Reel }) {
  const [thumbFailed, setThumbFailed] = useState(false);
  return (
    <Link
      href={`/research/${reel.id}`}
      className="card-editorial group relative block aspect-[4/5] overflow-hidden !rounded-[20px]"
    >
      {reel.thumbnailUrl && !thumbFailed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={igProxy(reel.thumbnailUrl)}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setThumbFailed(true)}
          className="w-full h-full object-cover transition-transform duration-500 ease-settle group-hover:scale-[1.04]"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <Icon3D name="video" size={32} />
        </div>
      )}
      {reel.virality != null && (
        <div className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[12px] font-bold tabular-nums text-gold backdrop-blur-md">
          <Flame className="h-3 w-3" />
          {reel.virality.toFixed(1)}×
        </div>
      )}
      <div className="absolute bottom-2 left-2 right-2 flex justify-between text-[11px] font-semibold tabular-nums text-text">
        <span className="rounded-full bg-black/60 px-2 py-0.5 backdrop-blur-md">{fmt(reel.views)}</span>
        {reel.engagementRate != null && (
          <span className="rounded-full bg-black/60 px-2 py-0.5 text-cyan backdrop-blur-md">{reel.engagementRate.toFixed(1)}%</span>
        )}
      </div>
    </Link>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: 'gold' | 'lime' | 'cyan' }) {
  const cls =
    accent === 'gold' ? 'text-gold' : accent === 'lime' ? 'text-lime' : accent === 'cyan' ? 'text-cyan' : 'text-text';
  return (
    <div className="grid gap-1 rounded-2xl border border-border-soft bg-white/[0.04] px-3.5 py-3">
      <span className="label">{label}</span>
      <span className={`text-[22px] font-extrabold tabular-nums tracking-[-0.02em] leading-none ${cls}`}>{value}</span>
    </div>
  );
}

type Cadence = { posts_per_week: number; best_days: string[]; best_time: string };
type Outlier = { reel_id: string; virality: number; why: string };

function PageAnalysisView({ analysis, reels }: { analysis: Analysis; reels: Reel[] }) {
  const outliers = Array.isArray(analysis.outliers) ? (analysis.outliers as Outlier[]) : [];
  const cadence = analysis.cadence as Cadence | null;
  const formats = Array.isArray(analysis.bestFormats) ? (analysis.bestFormats as string[]) : [];
  const topics = Array.isArray(analysis.bestTopics) ? (analysis.bestTopics as string[]) : [];
  const hooks = Array.isArray(analysis.recurringHooks) ? (analysis.recurringHooks as string[]) : [];
  const recs = Array.isArray(analysis.recommendations) ? (analysis.recommendations as string[]) : [];
  const reelById = new Map(reels.map((r) => [r.id, r]));

  return (
    <section className="grid gap-4 stagger">
      <div className="panel !border-gold/30 !bg-blue/[0.06] p-6 grid gap-2.5">
        <h3 className="flex items-center gap-2.5 text-[15px] font-semibold tracking-[-0.02em] text-gold">
          <Icon3D name="brain" size={20} tile />
          Резюме
        </h3>
        <p className="text-[15px] leading-relaxed text-text">{analysis.summary}</p>
      </div>

      {outliers.length > 0 && (
        <div className="panel p-5 grid gap-3">
          <h3 className="label">Выбросы</h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {outliers.map((o) => {
              const reel = reelById.get(o.reel_id);
              return (
                <Link
                  key={o.reel_id}
                  href={`/research/${o.reel_id}`}
                  className="rounded-2xl border border-border-soft bg-white/[0.03] p-4 grid gap-2 transition-colors hover:border-gold/50 hover:bg-blue/[0.06]"
                >
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-[14px] font-bold tabular-nums text-gold">
                      <Flame className="h-3.5 w-3.5" />
                      {o.virality.toFixed(1)}×
                    </span>
                    {reel && <span className="text-[12px] tabular-nums text-text-mute">{fmt(reel.views)} просм.</span>}
                  </div>
                  <p className="text-[13px] leading-snug text-text-dim line-clamp-3">{o.why}</p>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        {cadence && (
          <div className="panel p-5 grid gap-3">
            <h3 className="label">Ритм публикаций</h3>
            <div className="grid grid-cols-3 gap-3">
              <Stat label="ПОСТ./НЕД" value={String(cadence.posts_per_week ?? '—')} />
              <Stat label="ЛУЧ. ДНИ" value={(cadence.best_days || []).join(', ') || '—'} />
              <Stat label="ВРЕМЯ" value={cadence.best_time || '—'} />
            </div>
          </div>
        )}
        {formats.length > 0 && (
          <div className="panel p-5 grid gap-3 content-start">
            <h3 className="label">Работающие форматы</h3>
            <div className="flex flex-wrap gap-1.5">
              {formats.map((f) => (
                <span key={f} className="rounded-full border border-border-soft bg-white/[0.04] px-3 py-1 text-[13px] text-text">
                  {f}
                </span>
              ))}
            </div>
          </div>
        )}
        {topics.length > 0 && (
          <div className="panel p-5 grid gap-3 content-start">
            <h3 className="label">Темы, которые заходят</h3>
            <div className="flex flex-wrap gap-1.5">
              {topics.map((t) => (
                <span key={t} className="rounded-full border border-cyan/30 bg-cyan/[0.08] px-3 py-1 text-[13px] text-cyan">
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}
        {hooks.length > 0 && (
          <div className="panel p-5 grid gap-3 content-start">
            <h3 className="label">Хук-формулы автора</h3>
            <div className="flex flex-wrap gap-1.5">
              {hooks.map((h) => (
                <span key={h} className="rounded-full border border-lime/30 bg-lime/[0.08] px-3 py-1 text-[13px] text-lime">
                  {h}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

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
