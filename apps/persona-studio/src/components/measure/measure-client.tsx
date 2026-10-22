'use client';

// Module D · Measure (Мастер-ТЗ §6). «Что у меня залетает»: опубликованные
// посты, твой Xn (views / твоя медиана) и сравнение с источником-вдохновением
// (твой Xn vs Xn источника). Метрики вводятся вручную (или будущим коллектором).

import { useState } from 'react';
import Link from 'next/link';
import { BarChart3, Eye, ExternalLink, Flame, Heart, MessageCircle, Pencil, RefreshCw } from 'lucide-react';
import { Icon3D } from '@/components/ui/icon3d';
import { PageHero } from '@/components/shell/page-hero';
import type { MeasureDashboard, MeasurePost } from '@/lib/measure/measure';
import { errorText } from '@/lib/error-text';

const fmt = (n: number | null) => {
  if (n == null) return '—';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace('.0', '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace('.0', '') + 'K';
  return String(n);
};

function xnClass(v: number | null): string {
  if (v == null) return 'bg-white/[0.06] text-text-mute';
  if (v >= 10) return 'bg-blue text-white shadow-glow';
  if (v >= 3) return 'bg-lime text-bg';
  return 'bg-white/[0.06] text-text';
}

export function MeasureClient({ initial }: { initial: MeasureDashboard }) {
  const [data, setData] = useState(initial);
  const [editing, setEditing] = useState<string | null>(null);
  const [collecting, setCollecting] = useState(false);
  const [collectMsg, setCollectMsg] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch('/api/measure');
    const d = await res.json();
    if (res.ok) setData(d);
  }

  // Авто-сбор метрик из API площадок (Instagram/PostMyPost) по запросу.
  async function collect() {
    setCollecting(true);
    setCollectMsg(null);
    try {
      const res = await fetch('/api/measure/collect', { method: 'POST' });
      const d = await res.json();
      if (res.ok) {
        setCollectMsg(`Собрано: ${d.collected}, пропущено: ${d.skipped}`);
        await refresh();
      } else {
        setCollectMsg('Не удалось собрать метрики');
      }
    } catch {
      setCollectMsg('Ошибка сети');
    } finally {
      setCollecting(false);
    }
  }

  return (
    <div className="grid gap-5">
      <PageHero
        eyebrow="MEASURE · ANALYTICS"
        title="Аналитика"
        icon="analytics"
        description="что у меня залетает · твой Xn vs источник"
        extra={
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={collect}
              disabled={collecting}
              className="btn-primary"
            >
              <RefreshCw size={16} className={collecting ? 'animate-spin' : ''} />
              {collecting ? 'Сбор…' : 'Собрать метрики'}
            </button>
            {collectMsg && (
              <span className="text-[13px] text-text-mute fade-in">{collectMsg}</span>
            )}
          </div>
        }
      />

      {/* Сводка */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 stagger">
        <Stat label="Опубликовано" value={String(data.publishedCount)} />
        <Stat label="С метриками" value={String(data.withMetrics)} />
        <Stat label="Твоя медиана" value={fmt(data.myMedian)} />
        <Stat label="Лучший Xn" value={data.bestXn != null ? `${data.bestXn}×` : '—'} />
      </div>

      {data.posts.length === 0 ? (
        <div className="rounded-[24px] border border-dashed border-white/15 bg-white/[0.03] p-10 flex flex-col items-center gap-2 text-center fade-in">
          <Icon3D name="analytics" size={44} tile sway />
          <p className="mt-2 text-[17px] font-semibold tracking-[-0.02em] text-text">
            Нет опубликованных постов
          </p>
          <p className="text-[14px] text-text-dim">
            Опубликуйте материал из воркспейса — и метрики появятся здесь.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 stagger">
          {data.posts.map((p) => (
            <PostRow
              key={p.postTargetId}
              post={p}
              editing={editing === p.postTargetId}
              onEdit={() => setEditing(p.postTargetId)}
              onClose={() => setEditing(null)}
              onSaved={async () => {
                setEditing(null);
                await refresh();
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel p-4 grid gap-1.5">
      <span className="label">{label}</span>
      <span className="text-[26px] font-extrabold leading-none tabular-nums tracking-[-0.02em] text-text">{value}</span>
    </div>
  );
}

function PostRow({
  post,
  editing,
  onEdit,
  onClose,
  onSaved,
}: {
  post: MeasurePost;
  editing: boolean;
  onEdit: () => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  return (
    <div className="panel p-5 grid gap-3">
      <div className="flex items-start gap-3">
        {/* источник-вдохновение */}
        <div
          className="w-12 h-12 shrink-0 rounded-2xl bg-white/[0.05] ring-1 ring-white/10 grid place-items-center overflow-hidden"
          style={
            post.source?.thumbnailUrl
              ? { backgroundImage: `url(${post.source.thumbnailUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
              : undefined
          }
        >
          {!post.source?.thumbnailUrl && <BarChart3 size={16} className="text-text-mute" />}
        </div>

        <div className="min-w-0 flex-1 grid gap-1">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-white/[0.06] px-2.5 py-0.5 text-[12px] font-medium text-text-dim">
              {post.platform}
              {post.channel ? ` · ${post.channel}` : ''}
            </span>
            {post.permalink && (
              <a href={post.permalink} target="_blank" rel="noopener noreferrer" className="text-text-mute hover:text-gold" aria-label="Открыть пост">
                <ExternalLink size={12} />
              </a>
            )}
          </div>
          {post.caption && (
            <p className="text-[13.5px] text-text-dim line-clamp-1">{post.caption}</p>
          )}
          {post.source && (
            <p className="text-[12px] text-text-mute">
              вдохновение: {post.source.authorUsername ? `@${post.source.authorUsername}` : 'источник'}
              {post.source.sourceXn != null ? ` · источник ${post.source.sourceXn}×` : ''}
              {post.source.briefId ? (
                <>
                  {' · '}
                  <Link href={`/briefs/${post.source.briefId}`} className="text-gold hover:underline">
                    бриф
                  </Link>
                </>
              ) : null}
            </p>
          )}
        </div>

        {/* твой Xn */}
        <div className="text-right grid gap-1">
          <span className={`inline-flex items-center justify-end gap-1 rounded-full px-3 py-1 text-[14px] font-bold tabular-nums ${xnClass(post.myXn)}`}>
            {post.myXn != null && <Flame className="h-3.5 w-3.5" />}
            {post.myXn != null ? `${post.myXn}×` : '—'}
          </span>
          <span className="text-[12px] tabular-nums text-text-mute">
            {fmt(post.views)} просм.
          </span>
        </div>
      </div>

      {/* метрики + редактор */}
      <div className="flex flex-wrap items-center gap-4 pt-3 border-t border-border-soft">
        <span className="inline-flex items-center gap-1.5 text-[12.5px] tabular-nums text-text-dim"><Eye className="h-3.5 w-3.5" /> {fmt(post.views)}</span>
        <span className="inline-flex items-center gap-1.5 text-[12.5px] tabular-nums text-text-dim"><Heart className="h-3.5 w-3.5" /> {fmt(post.likes)}</span>
        <span className="inline-flex items-center gap-1.5 text-[12.5px] tabular-nums text-text-dim"><MessageCircle className="h-3.5 w-3.5" /> {fmt(post.comments)}</span>
        {post.capturedAt && (
          <span className="text-[12px] text-text-mute">снимок {post.capturedAt}</span>
        )}
        <button
          type="button"
          onClick={editing ? onClose : onEdit}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-border-soft bg-white/[0.04] px-3 py-1.5 text-[12.5px] text-text-dim transition-colors hover:bg-white/[0.07] hover:text-gold"
        >
          <Pencil size={12} /> {editing ? 'закрыть' : 'обновить метрики'}
        </button>
      </div>

      {editing && <MetricForm post={post} onSaved={onSaved} />}
    </div>
  );
}

function MetricForm({ post, onSaved }: { post: MeasurePost; onSaved: () => void }) {
  const [views, setViews] = useState(String(post.views ?? ''));
  const [likes, setLikes] = useState(String(post.likes ?? ''));
  const [comments, setComments] = useState(String(post.comments ?? ''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const v = Number(views);
    if (!Number.isFinite(v) || v < 0) {
      setError('Введите число просмотров');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/measure/${post.postTargetId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          views: v,
          likes: Number(likes) || 0,
          comments: Number(comments) || 0,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(errorText(d, res.status));
      }
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-3 rounded-[20px] border border-gold/30 bg-blue/[0.05] p-4 pop-in">
      <div className="flex flex-wrap gap-2">
        <NumIn label="Просмотры" value={views} onChange={setViews} />
        <NumIn label="Лайки" value={likes} onChange={setLikes} />
        <NumIn label="Комменты" value={comments} onChange={setComments} />
      </div>
      {error && <p className="text-[13px] text-pink">{error}</p>}
      <button
        type="button"
        onClick={save}
        disabled={busy}
        className="btn-primary justify-self-start !px-4 !py-2 !text-[13px]"
      >
        {busy ? 'Сохранение…' : 'Сохранить снимок'}
      </button>
    </div>
  );
}

function NumIn({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-[12px] text-text-mute">{label}</span>
      <input
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ''))}
        className="input !w-32 !py-2 tabular-nums"
      />
    </label>
  );
}
