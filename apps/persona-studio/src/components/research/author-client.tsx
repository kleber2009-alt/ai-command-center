'use client';

// Клиентский компонент страницы автора. Hero с метриками + грид рилсов
// + блок page-analysis (или CTA для заказа).

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { igProxy } from './types';
import { apiErrorText } from './error-text';

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
        setError(apiErrorText(json, res.status));
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
        setError(apiErrorText(json, res.status));
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
      <section className="border border-border bg-surface p-6 grid lg:grid-cols-[auto_1fr_auto] gap-5 items-start">
        {author.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={igProxy(author.avatarUrl)}
            alt={author.username}
            referrerPolicy="no-referrer"
            className="w-20 h-20 rounded-full object-cover bg-bg border border-border"
          />
        ) : (
          <div className="w-20 h-20 rounded-full bg-bg border border-border" />
        )}

        <div className="grid gap-2 min-w-0">
          <div className="flex items-baseline gap-3 flex-wrap">
            <h1 className="font-serif text-[28px] text-text leading-none">@{author.username}</h1>
            {author.lowConfidence && (
              <span className="px-1.5 py-0.5 mono text-[8px] tracking-widest uppercase border border-warm text-warm">
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
          <div className="mono text-[9px] tracking-widest uppercase text-text-mute">
            обновлено: {relDate(author.lastIndexedAt)}
            {author.profileUrl && (
              <>
                {' · '}
                <a
                  href={author.profileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-lime"
                >
                  открыть профиль ↗
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
            className="btn-primary text-[12px] tracking-widest uppercase whitespace-nowrap"
          >
            {analysis ? 'Анализ готов ✓' : pendingAnalyze ? 'Анализирую…' : 'Анализ страницы (10 кр.) →'}
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={refresh}
              disabled={pendingRefresh}
              className="btn-ghost text-[10px] tracking-widest uppercase"
            >
              {pendingRefresh ? '…' : 'Обновить (5 кр.)'}
            </button>
            <button
              type="button"
              onClick={toggleWatch}
              disabled={pendingWatch}
              className={`btn-ghost text-[10px] tracking-widest uppercase ${
                author.isWatching ? 'border-pink text-pink' : ''
              }`}
              title={author.isWatching ? 'Перестать наблюдать' : 'Добавить в наблюдение'}
            >
              {author.isWatching ? 'в наблюдении ✓' : '+ наблюдать'}
            </button>
          </div>
        </div>
      </section>

      {error && (
        <div className="border border-pink/40 bg-pink/5 px-3 py-2 mono text-[11px] text-pink">
          {error}
        </div>
      )}

      {/* Analysis block */}
      {analysis ? (
        <PageAnalysisView analysis={analysis} reels={reels} />
      ) : (
        <section className="border border-border-soft bg-surface/50 p-8 text-center grid gap-3">
          <div className="font-serif italic text-[17px] text-text-dim">
            Разбор страницы ещё не заказан.
          </div>
          <div className="font-serif text-[14px] text-text-mute max-w-prose mx-auto">
            Claude посмотрит последние рилсы, найдёт выбросы, скажет на каком формате растёт аккаунт,
            что повторять и что игнорировать.
          </div>
        </section>
      )}

      {/* Reels grid */}
      <section className="grid gap-3">
        <h2 className="mono text-[10px] tracking-widest uppercase text-text-mute">
          Последние {reels.length} рилсов
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-0.5 bg-border-soft">
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
      className="relative aspect-[4/5] bg-surface block overflow-hidden hover:border hover:border-lime"
    >
      {reel.thumbnailUrl && !thumbFailed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={igProxy(reel.thumbnailUrl)}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setThumbFailed(true)}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center mono text-[9px] tracking-widest uppercase text-text-mute">
          REEL
        </div>
      )}
      {reel.virality != null && (
        <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-black/85 mono text-[10px] tracking-wider text-gold">
          🔥 {reel.virality.toFixed(1)}×
        </div>
      )}
      <div className="absolute bottom-1 left-1 right-1 flex justify-between mono text-[9px] tracking-wider text-text">
        <span className="bg-black/85 px-1">{fmt(reel.views)}</span>
        {reel.engagementRate != null && (
          <span className="bg-black/85 px-1 text-cyan">{reel.engagementRate.toFixed(1)}%</span>
        )}
      </div>
    </Link>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: 'gold' | 'lime' | 'cyan' }) {
  const cls =
    accent === 'gold' ? 'text-gold' : accent === 'lime' ? 'text-lime' : accent === 'cyan' ? 'text-cyan' : 'text-text';
  return (
    <div className="grid gap-0.5">
      <span className="mono text-[8px] tracking-widest uppercase text-text-mute">{label}</span>
      <span className={`font-serif text-[20px] leading-none ${cls}`}>{value}</span>
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
    <section className="grid gap-4">
      <div className="border border-gold/40 bg-gold/5 p-5 grid gap-2">
        <h3 className="mono text-[10px] tracking-widest uppercase text-gold">Резюме</h3>
        <p className="font-serif text-[15px] leading-relaxed text-text">{analysis.summary}</p>
      </div>

      {outliers.length > 0 && (
        <div className="border border-border bg-surface p-5 grid gap-3">
          <h3 className="mono text-[10px] tracking-widest uppercase text-text-mute">Выбросы</h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {outliers.map((o) => {
              const reel = reelById.get(o.reel_id);
              return (
                <Link
                  key={o.reel_id}
                  href={`/research/${o.reel_id}`}
                  className="border border-border-soft p-3 bg-bg hover:border-gold grid gap-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="mono text-[12px] tracking-wider text-gold">🔥 {o.virality.toFixed(1)}×</span>
                    {reel && <span className="mono text-[10px] text-text-mute">{fmt(reel.views)} просм.</span>}
                  </div>
                  <p className="font-serif text-[13px] leading-snug text-text-dim line-clamp-3">{o.why}</p>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        {cadence && (
          <div className="border border-border bg-surface p-4 grid gap-2">
            <h3 className="mono text-[10px] tracking-widest uppercase text-text-mute">Ритм публикаций</h3>
            <div className="grid grid-cols-3 gap-3">
              <Stat label="ПОСТ./НЕД" value={String(cadence.posts_per_week ?? '—')} />
              <Stat label="ЛУЧ. ДНИ" value={(cadence.best_days || []).join(', ') || '—'} />
              <Stat label="ВРЕМЯ" value={cadence.best_time || '—'} />
            </div>
          </div>
        )}
        {formats.length > 0 && (
          <div className="border border-border bg-surface p-4 grid gap-2">
            <h3 className="mono text-[10px] tracking-widest uppercase text-text-mute">Работающие форматы</h3>
            <div className="flex flex-wrap gap-1.5">
              {formats.map((f) => (
                <span key={f} className="px-2 py-1 border border-border mono text-[11px] tracking-wider text-text">
                  {f}
                </span>
              ))}
            </div>
          </div>
        )}
        {topics.length > 0 && (
          <div className="border border-border bg-surface p-4 grid gap-2">
            <h3 className="mono text-[10px] tracking-widest uppercase text-text-mute">Темы, которые заходят</h3>
            <div className="flex flex-wrap gap-1.5">
              {topics.map((t) => (
                <span key={t} className="px-2 py-1 border border-cyan/40 mono text-[11px] tracking-wider text-cyan">
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}
        {hooks.length > 0 && (
          <div className="border border-border bg-surface p-4 grid gap-2">
            <h3 className="mono text-[10px] tracking-widest uppercase text-text-mute">Хук-формулы автора</h3>
            <div className="flex flex-wrap gap-1.5">
              {hooks.map((h) => (
                <span key={h} className="px-2 py-1 border border-lime/40 mono text-[11px] tracking-wider text-lime">
                  {h}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

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
