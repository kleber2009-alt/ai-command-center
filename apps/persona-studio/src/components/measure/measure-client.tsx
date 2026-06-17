'use client';

// Module D · Measure (Мастер-ТЗ §6). «Что у меня залетает»: опубликованные
// посты, твой Xn (views / твоя медиана) и сравнение с источником-вдохновением
// (твой Xn vs Xn источника). Метрики вводятся вручную (или будущим коллектором).

import { useState } from 'react';
import Link from 'next/link';
import { BarChart3, ExternalLink, Pencil } from 'lucide-react';
import type { MeasureDashboard, MeasurePost } from '@/lib/measure/measure';

const fmt = (n: number | null) => {
  if (n == null) return '—';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace('.0', '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace('.0', '') + 'K';
  return String(n);
};

function xnClass(v: number | null): string {
  if (v == null) return 'text-text-mute border-border';
  if (v >= 10) return 'text-gold border-gold';
  if (v >= 3) return 'text-lime border-lime';
  return 'text-text border-border';
}

export function MeasureClient({ initial }: { initial: MeasureDashboard }) {
  const [data, setData] = useState(initial);
  const [editing, setEditing] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch('/api/measure');
    const d = await res.json();
    if (res.ok) setData(d);
  }

  return (
    <div className="grid gap-5">
      <header className="grid gap-1">
        <h1 className="font-serif text-2xl text-text">Аналитика</h1>
        <p className="mono text-[11px] tracking-widest uppercase text-text-mute">
          что у меня залетает · твой Xn vs источник
        </p>
      </header>

      {/* Сводка */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Опубликовано" value={String(data.publishedCount)} />
        <Stat label="С метриками" value={String(data.withMetrics)} />
        <Stat label="Твоя медиана" value={fmt(data.myMedian)} />
        <Stat label="Лучший Xn" value={data.bestXn != null ? `${data.bestXn}×` : '—'} />
      </div>

      {data.posts.length === 0 ? (
        <div className="border border-border-soft bg-surface p-10 text-center grid gap-2">
          <p className="mono text-[11px] tracking-widest uppercase text-text-mute">
            Нет опубликованных постов
          </p>
          <p className="font-serif text-[13px] text-text-dim">
            Опубликуйте материал из воркспейса — и метрики появятся здесь.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
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
    <div className="border border-border bg-surface p-3 grid gap-1">
      <span className="mono text-[9px] tracking-widest uppercase text-text-mute">{label}</span>
      <span className="font-serif text-[20px] text-text">{value}</span>
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
    <div className="border border-border bg-surface p-4 grid gap-3">
      <div className="flex items-start gap-3">
        {/* источник-вдохновение */}
        <div
          className="w-12 h-12 shrink-0 border border-border-soft bg-bg grid place-items-center"
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
            <span className="mono text-[10px] tracking-widest uppercase text-text-dim">
              {post.platform}
              {post.channel ? ` · ${post.channel}` : ''}
            </span>
            {post.permalink && (
              <a href={post.permalink} target="_blank" rel="noopener noreferrer" className="text-text-mute hover:text-gold">
                <ExternalLink size={12} />
              </a>
            )}
          </div>
          {post.caption && (
            <p className="font-serif text-[12.5px] text-text-dim line-clamp-1">{post.caption}</p>
          )}
          {post.source && (
            <p className="mono text-[9px] tracking-widest uppercase text-text-mute">
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
          <span className={`mono text-[13px] tracking-wider border px-2 py-1 ${xnClass(post.myXn)}`}>
            {post.myXn != null ? `🔥 ${post.myXn}×` : '—'}
          </span>
          <span className="mono text-[9px] tracking-widest uppercase text-text-mute">
            {fmt(post.views)} просм.
          </span>
        </div>
      </div>

      {/* метрики + редактор */}
      <div className="flex items-center gap-4 pt-2 border-t border-border-soft">
        <span className="mono text-[10px] tracking-wider text-text-dim">👁 {fmt(post.views)}</span>
        <span className="mono text-[10px] tracking-wider text-text-dim">♥ {fmt(post.likes)}</span>
        <span className="mono text-[10px] tracking-wider text-text-dim">💬 {fmt(post.comments)}</span>
        {post.capturedAt && (
          <span className="mono text-[9px] tracking-widest uppercase text-text-mute">снимок {post.capturedAt}</span>
        )}
        <button
          onClick={editing ? onClose : onEdit}
          className="ml-auto flex items-center gap-1 mono text-[9px] tracking-widest uppercase text-text-mute hover:text-gold"
        >
          <Pencil size={11} /> {editing ? 'закрыть' : 'обновить метрики'}
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
        throw new Error(d.error || 'save_failed');
      }
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-2 border border-gold/30 bg-bg p-3">
      <div className="flex flex-wrap gap-2">
        <NumIn label="Просмотры" value={views} onChange={setViews} />
        <NumIn label="Лайки" value={likes} onChange={setLikes} />
        <NumIn label="Комменты" value={comments} onChange={setComments} />
      </div>
      {error && <p className="mono text-[10px] text-pink">{error}</p>}
      <button
        onClick={save}
        disabled={busy}
        className="justify-self-start px-4 py-1.5 border border-gold bg-gold/10 mono text-[10px] tracking-widest uppercase text-gold hover:bg-gold/20 disabled:opacity-50"
      >
        {busy ? 'Сохранение…' : 'Сохранить снимок'}
      </button>
    </div>
  );
}

function NumIn({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="grid gap-1">
      <span className="mono text-[9px] tracking-widest uppercase text-text-mute">{label}</span>
      <input
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ''))}
        className="w-28 bg-surface border border-border px-2 py-1.5 mono text-[12px] text-text focus:border-gold outline-none"
      />
    </label>
  );
}
