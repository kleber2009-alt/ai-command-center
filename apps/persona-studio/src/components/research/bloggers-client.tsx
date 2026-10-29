'use client';

// Страница «Блогеры / Шпион + Анализ аккаунта».
// UI — дизайн-система UI-моушн (glass-карточки, Onest, токены tailwind).
// Источник данных — существующий backend /research:
//   - каталог авторов        GET  /api/research/authors
//   - добавить блогера        POST /api/research/authors { username }
//   - карточка + рилсы + разбор GET /api/research/authors/:id
//   - AI-разбор страницы      POST /api/research/authors/:id/analyze-page
//   - папка «Шпион»           GET/POST/DELETE /api/research/watchlist
//   - папки блогеров          GET/POST /api/research/folders?type=bloggers
// Все графики «Обзор/Виральность» считаются из реальных рилсов; «Контент/
// Тайминг/AI-разбор» — из ResearchPageAnalysis (Claude) + рилсов.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import {
  ArrowRight, BarChart3, Check, ChevronRight, Copy, Eye, EyeOff, Folder as FolderIcon, Instagram,
  Play, Plus, RefreshCw, Search, Sparkles, Star, TrendingDown, TrendingUp, X,
} from 'lucide-react';
import { Icon3D } from '@/components/ui/icon3d';
import { PageHero } from '@/components/shell/page-hero';
import { igProxy, type ResearchReelView } from './types';

// Design tokens (tailwind.config.ts). Hex values are only used where SVG
// charts need a raw colour; everything else uses token classes.
type Tone = 'text' | 'blue' | 'lime' | 'pink' | 'mute';
const TONE_TEXT: Record<Tone, string> = {
  text: 'text-text', blue: 'text-gold', lime: 'text-lime', pink: 'text-pink', mute: 'text-text-mute',
};
const TONE_BG: Record<Tone, string> = {
  text: 'bg-text', blue: 'bg-blue', lime: 'bg-lime', pink: 'bg-pink', mute: 'bg-white/20',
};
const HEX = { blue: '#3B8CFF', lime: '#B8F04A', pink: '#FF3D8B' };

type BloggerRow = {
  id: string;
  platform: string;
  username: string;
  niche: string | null;
  followers: number;
  postsCount: number;
  medianViews: number;
  engagementAvg: number;
  avatarUrl: string;
  lowConfidence: boolean;
  lastIndexedAt: string | null;
  isWatching: boolean;
  refreshInterval: number | null;
  folderIds: string[];
};

type FolderRow = { id: string; name: string; type: string; _count: { items: number } };

type ReelRow = {
  id: string;
  url: string;
  thumbnailUrl: string | null;
  caption: string | null;
  views: number;
  likes: number;
  comments: number;
  postedAt: string | null;
  durationSec: number | null;
  postType: string;
  virality: number | null;
  engagementRate: number | null;
};

type PageAnalysis = {
  summary: string;
  cadence: { posts_per_week?: number; best_days?: string[]; best_time?: string } | null;
  bestFormats: string[];
  bestTopics: string[];
  recurringHooks: string[];
  recommendations: string[];
  model: string;
  createdAt: string;
};

type AuthorDetail = BloggerRow & {
  reels: ReelRow[];
  pageAnalysis: PageAnalysis | null;
};

const fmt = (n: number): string => {
  if (n >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(Math.round(n));
};
const erTone = (er: number): Tone => (er >= 5 ? 'lime' : er >= 2 ? 'blue' : 'mute');
const xnTone = (x: number): Tone => (x >= 2 ? 'lime' : x >= 1.3 ? 'blue' : 'mute');

// Segmented / chip styles (UI-моушн pills).
const chipCls = (active: boolean) =>
  `rounded-full border px-3.5 py-1.5 text-[13px] transition-colors ${
    active
      ? 'border-transparent bg-blue text-white'
      : 'border-border-soft bg-white/[0.04] text-text-dim hover:bg-white/[0.07]'
  }`;

const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const SLOTS = ['Утро', 'День', 'Вечер', 'Ночь'];

// ── Аналитика из реальных рилсов ──────────────────────────────────────────
type Derived = ReturnType<typeof deriveAnalysis>;
function deriveAnalysis(d: AuthorDetail) {
  const reels = d.reels ?? [];
  const views = reels.map((r) => r.views).filter((v) => v > 0);
  const avg = views.length ? views.reduce((s, v) => s + v, 0) / views.length : 0;
  const median = d.medianViews || (views.length ? [...views].sort((a, b) => a - b)[Math.floor(views.length / 2)] : 0) || 1;
  const xnOf = (r: ReelRow) => (r.virality != null ? r.virality : median ? r.views / median : 0);

  // рост / просмотры по времени
  const byDate = [...reels].filter((r) => r.postedAt).sort((a, b) => +new Date(a.postedAt!) - +new Date(b.postedAt!));
  const growth = (byDate.length >= 2 ? byDate : reels).map((r) => r.views).filter((v) => v >= 0);
  const recentViews = reels.slice(0, 14).map((r) => r.views);

  // дельта за 30 дней
  let delta30: number | null = null;
  if (byDate.length >= 4) {
    const cut = Date.now() - 30 * 864e5;
    const recent = byDate.filter((r) => +new Date(r.postedAt!) >= cut).map((r) => r.views);
    const older = byDate.filter((r) => +new Date(r.postedAt!) < cut).map((r) => r.views);
    if (recent.length && older.length) {
      const ra = recent.reduce((s, v) => s + v, 0) / recent.length;
      const oa = older.reduce((s, v) => s + v, 0) / older.length;
      if (oa > 0) delta30 = ((ra - oa) / oa) * 100;
    }
  }

  // форматы
  let reelsN = 0, carouselN = 0, photoN = 0;
  for (const r of reels) {
    if (r.postType === 'carousel') carouselN++;
    else if (r.postType === 'image' || r.postType === 'photo') photoN++;
    else reelsN++;
  }
  const totalT = reels.length || 1;
  const reelsPct = Math.round((reelsN / totalT) * 100);
  const carouselPct = Math.round((carouselN / totalT) * 100);
  const photoPct = Math.max(0, 100 - reelsPct - carouselPct);

  // частота постинга
  let perWeek: number | null = d.pageAnalysis?.cadence?.posts_per_week ?? null;
  if (perWeek == null && byDate.length >= 2) {
    const spanDays = (+new Date(byDate[byDate.length - 1].postedAt!) - +new Date(byDate[0].postedAt!)) / 864e5;
    if (spanDays > 0) perWeek = +((reels.length / spanDays) * 7).toFixed(1);
  }

  // hit-rate / CV
  const xns = reels.map(xnOf).filter((x) => x > 0);
  const hitRate = xns.length ? Math.round((100 * xns.filter((x) => x > 1).length) / xns.length) : 0;
  const variance = views.length ? views.reduce((s, v) => s + (v - avg) ** 2, 0) / views.length : 0;
  const cv = avg ? +(Math.sqrt(variance) / avg).toFixed(2) : 0;

  // распределение по Xn
  const buckets = [
    { label: '<1x', test: (x: number) => x < 1 },
    { label: '1–2x', test: (x: number) => x >= 1 && x < 2 },
    { label: '2–3x', test: (x: number) => x >= 2 && x < 3 },
    { label: '3–5x', test: (x: number) => x >= 3 && x < 5 },
    { label: '5x+', test: (x: number) => x >= 5 },
  ];
  const xnDist = buckets.map((b) => ({
    label: b.label,
    v: xns.length ? Math.round((100 * xns.filter(b.test).length) / xns.length) : 0,
  }));

  // топ-виральные
  const topViral = [...reels]
    .map((r) => ({ r, x: xnOf(r) }))
    .sort((a, b) => b.x - a.x)
    .slice(0, 3);

  // длина → виральность
  const lenDefs = [
    { label: '0–10с', lo: 0, hi: 10 },
    { label: '10–20с', lo: 10, hi: 20 },
    { label: '20–40с', lo: 20, hi: 40 },
    { label: '40с+', lo: 40, hi: Infinity },
  ];
  const lenBuckets = lenDefs.map((b) => {
    const inB = reels.filter((r) => r.durationSec != null && r.durationSec >= b.lo && r.durationSec < b.hi);
    const xn = inB.length ? +(inB.map(xnOf).reduce((s, v) => s + v, 0) / inB.length).toFixed(1) : 0;
    return { label: b.label, xn, n: inB.length };
  });
  const hasLen = lenBuckets.some((b) => b.n > 0);

  // тепловая карта тайминга
  const sum: number[][] = SLOTS.map(() => DAYS.map(() => 0));
  const cnt: number[][] = SLOTS.map(() => DAYS.map(() => 0));
  for (const r of reels) {
    if (!r.postedAt) continue;
    const dt = new Date(r.postedAt);
    const di = (dt.getDay() + 6) % 7; // Пн=0
    const h = dt.getHours();
    const si = h < 6 ? 3 : h < 12 ? 0 : h < 18 ? 1 : 2;
    sum[si][di] += xnOf(r);
    cnt[si][di] += 1;
  }
  const avgCell = SLOTS.map((_, si) => DAYS.map((_, di) => (cnt[si][di] ? sum[si][di] / cnt[si][di] : 0)));
  const maxCell = Math.max(0.0001, ...avgCell.flat());
  const heat = avgCell.map((row) => row.map((v) => v / maxCell));
  let best = { v: -1, d: 0, s: 0 };
  avgCell.forEach((row, si) => row.forEach((v, di) => { if (cnt[si][di] && v > best.v) best = { v, d: di, s: si }; }));
  const hasTiming = best.v >= 0;
  const bestWindow = d.pageAnalysis?.cadence?.best_time
    ? d.pageAnalysis.cadence.best_time
    : hasTiming ? `${DAYS[best.d]} · ${SLOTS[best.s].toLowerCase()}` : '—';

  return {
    median, growth, recentViews, delta30, reelsPct, carouselPct, photoPct, perWeek,
    hitRate, cv, xnDist, topViral, lenBuckets, hasLen, heat, hasTiming, best, bestWindow,
    hasReels: reels.length > 0,
  };
}

/* ---------- atoms ---------- */
const AVATAR_TINTS = ['bg-lime/25', 'bg-blue/30', 'bg-pink/30', 'bg-white/10'];

function Avatar({ src, name, seed, size = 48 }: { src?: string; name: string; seed: number; size?: number }) {
  const [ok, setOk] = useState(Boolean(src));
  useEffect(() => setOk(Boolean(src)), [src]);
  const badge = Math.round(size * 0.42);
  return (
    <div className="relative flex-none" style={{ width: size, height: size }}>
      <div
        className={`flex h-full w-full items-center justify-center overflow-hidden rounded-full font-semibold text-text ring-1 ring-white/10 ${ok ? 'bg-white/[0.05]' : AVATAR_TINTS[seed % 4]}`}
        style={{ fontSize: size * 0.38 }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {ok ? <img src={src} alt={name} onError={() => setOk(false)} className="block h-full w-full object-cover" /> : (name[0] || '?').toUpperCase()}
      </div>
      <span
        className="absolute -bottom-0.5 -left-0.5 flex items-center justify-center rounded-full bg-pink text-white ring-2 ring-surface"
        style={{ width: badge, height: badge }}
      >
        <Instagram style={{ width: badge * 0.58, height: badge * 0.58 }} strokeWidth={2.2} />
      </span>
    </div>
  );
}
function Stat({ label, value, tone = 'text' }: { label: string; value: string; tone?: Tone }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-text-mute">{label}</span>
      <span className={`text-[16px] font-bold tabular-nums tracking-[-0.01em] ${TONE_TEXT[tone]}`}>{value}</span>
    </div>
  );
}
function Bars({ data, color }: { data: number[]; color: string }) {
  if (!data.length) return null;
  const max = Math.max(...data, 1);
  return (
    <svg viewBox="0 0 120 36" className="h-11 w-full">
      {data.map((d, i) => {
        const h = (d / max) * 32 + 2, w = 120 / data.length - 3;
        return <rect key={i} x={i * (120 / data.length) + 1.5} y={36 - h} width={w} height={h} rx={2} fill={color} opacity={0.35 + (d / max) * 0.65} />;
      })}
    </svg>
  );
}
function Line({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const max = Math.max(...data), min = Math.min(...data);
  const pts = data.map((d, i) => `${(i / (data.length - 1)) * 120},${34 - ((d - min) / (max - min || 1)) * 30 - 2}`).join(' ');
  return (
    <svg viewBox="0 0 120 36" className="h-[50px] w-full">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      {data.map((d, i) => i === data.length - 1 && <circle key={i} cx={(i / (data.length - 1)) * 120} cy={34 - ((d - min) / (max - min || 1)) * 30 - 2} r="2.2" fill={color} />)}
    </svg>
  );
}
function HBar({ label, value, max, suffix, tone, sub }: { label: string; value: number; max: number; suffix: string; tone: Tone; sub?: string }) {
  return (
    <div className="mb-2.5">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[13px] text-text">{label}{sub && <span className="text-[11.5px] text-text-mute">  ·  {sub}</span>}</span>
        <span className={`text-[12.5px] font-semibold tabular-nums ${TONE_TEXT[tone]}`}>{value}{suffix}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
        <div className={`h-full rounded-full ${TONE_BG[tone]}`} style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
      </div>
    </div>
  );
}
function Donut({ segs, size = 96 }: { segs: { value: number; color: string }[]; size?: number }) {
  const total = segs.reduce((s, x) => s + x.value, 0) || 1; let acc = 0; const r = 38, cir = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 96 96" style={{ width: size, height: size }}>
      <circle cx="48" cy="48" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="11" />
      {segs.map((s, i) => {
        const frac = s.value / total, dash = `${frac * cir} ${cir}`, off = -acc * cir; acc += frac;
        return <circle key={i} cx="48" cy="48" r={r} fill="none" stroke={s.color} strokeWidth="11" strokeDasharray={dash} strokeDashoffset={off} transform="rotate(-90 48 48)" />;
      })}
      <text x="48" y="53" textAnchor="middle" fill="currentColor" className="text-[16px] font-bold text-text">{segs[0].value}%</text>
    </svg>
  );
}

/* ---------- media (reel) cover card ---------- */
function ReelCover({ reel }: { reel: ResearchReelView }) {
  const [failed, setFailed] = useState(false);
  const src = igProxy(reel.thumbnailUrl);
  const showThumb = src && !failed;
  const xn = reel.virality;
  return (
    <a href={reel.url} target="_blank" rel="noreferrer" className="card-editorial group block overflow-hidden !rounded-[20px] no-underline">
      <div className={`relative aspect-[4/5] w-full ${showThumb ? 'bg-white/[0.03]' : AVATAR_TINTS[(reel.id.length + reel.views) % 4]}`}>
        {showThumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={reel.caption?.slice(0, 40) || reel.author.username} onError={() => setFailed(true)} className="block h-full w-full object-cover transition-transform duration-500 ease-settle group-hover:scale-[1.04]" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[30px] font-bold text-text">{(reel.author.username[0] || '?').toUpperCase()}</div>
        )}
        {/* виральность badge */}
        {xn != null && xn > 0 && (
          <span className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[11.5px] font-bold tabular-nums backdrop-blur-md ${xn >= 2 ? 'bg-lime text-bg' : 'bg-black/60 text-text'}`}>{xn.toFixed(1)}x</span>
        )}
        {/* views + author overlay */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-b from-transparent to-black/85 px-2.5 pb-2.5 pt-5">
          <div className="flex items-center gap-1 text-[13px] font-semibold tabular-nums text-white"><Play className="h-3 w-3 fill-current" /> {fmt(reel.views)}</div>
          <div className="mt-0.5 truncate text-[11px] text-text-dim">@{reel.author.username}</div>
        </div>
      </div>
    </a>
  );
}

const SORTS = [{ id: 'followers', label: 'По подписчикам' }, { id: 'views', label: 'По просмотрам' }, { id: 'er', label: 'По вовлечению' }];
const TABS = ['Обзор', 'Виральность', 'Контент', 'Тайминг', 'AI-разбор'];

/* ---------- analysis drawer ---------- */
function Analysis({ author, seed, onClose, onToggleSpy, onToast }: {
  author: BloggerRow; seed: number; onClose: () => void; onToggleSpy: (id: string) => void; onToast: (m: string) => void;
}) {
  const router = useRouter();
  const [tab, setTab] = useState('Обзор');
  const [detail, setDetail] = useState<AuthorDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/research/authors/${author.id}`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (j.ok) {
          const a = j.author;
          setDetail({
            ...author,
            reels: a.reels ?? [],
            pageAnalysis: a.pageAnalyses?.[0]
              ? {
                  summary: a.pageAnalyses[0].summary,
                  cadence: a.pageAnalyses[0].cadence ?? null,
                  bestFormats: a.pageAnalyses[0].bestFormats ?? [],
                  bestTopics: a.pageAnalyses[0].bestTopics ?? [],
                  recurringHooks: a.pageAnalyses[0].recurringHooks ?? [],
                  recommendations: a.pageAnalyses[0].recommendations ?? [],
                  model: a.pageAnalyses[0].model,
                  createdAt: a.pageAnalyses[0].createdAt,
                }
              : null,
          });
        }
      })
      .catch(() => onToast('Не удалось загрузить аккаунт'))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [author.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const a = useMemo<Derived | null>(() => (detail ? deriveAnalysis(detail) : null), [detail]);
  const pa = detail?.pageAnalysis ?? null;
  const median = a?.median ?? author.medianViews;

  const runAI = async () => {
    if (!detail) return;
    setAiLoading(true);
    try {
      const res = await fetch(`/api/research/authors/${author.id}/analyze-page`, { method: 'POST' });
      const data = await res.json();
      if (data.ok && data.analysis) {
        setDetail((d) => d && ({
          ...d,
          pageAnalysis: {
            summary: data.analysis.summary,
            cadence: data.analysis.cadence ?? null,
            bestFormats: data.analysis.bestFormats ?? [],
            bestTopics: data.analysis.bestTopics ?? [],
            recurringHooks: data.analysis.recurringHooks ?? [],
            recommendations: data.analysis.recommendations ?? [],
            model: data.analysis.model,
            createdAt: data.analysis.createdAt,
          },
        }));
      } else if (data.error === 'insufficient_tokens') {
        onToast(`Не хватает токенов: нужно ${data.need}, есть ${data.have}`);
      } else if (data.error === 'not_enough_reels') {
        onToast('Слишком мало рилсов для разбора');
      } else {
        onToast('Разбор не удался, токены возвращены');
      }
    } catch {
      onToast('Ошибка генерации разбора');
    }
    setAiLoading(false);
  };

  const cloneTopFormat = () => {
    const top = a?.topViral?.[0]?.r;
    if (!top) { onToast('Нет рилсов для клонирования'); return; }
    router.push(`/research/${top.id}`);
  };

  const Sec = ({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) => (
    <div className="mt-6">
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <span className="label">{title}</span>
        {right}
      </div>
      {children}
    </div>
  );

  const tile = 'rounded-[20px] border border-border-soft bg-white/[0.04]';

  return (
    <Portal>
    <div onClick={onClose} className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm fade-in">
      <div onClick={(e) => e.stopPropagation()} className="m-2 h-[calc(100%-16px)] w-[720px] max-w-[96vw] overflow-y-auto rounded-[24px] border border-border-soft bg-surface/95 p-6 shadow-glass backdrop-blur-2xl md:p-7 reveal">
        {/* head */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3.5">
            <Avatar src={igProxy(author.avatarUrl)} name={author.username} seed={seed} size={58} />
            <div>
              <div className="text-[19px] font-semibold tracking-[-0.02em] text-text">@{author.username}</div>
              <div className="text-[13px] text-text-mute">{author.niche || 'без ниши'} · {author.platform}</div>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Закрыть" className="btn-icon shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* tabs */}
        <div className="mt-5 flex flex-wrap gap-1 rounded-full border border-border-soft bg-white/[0.04] p-1">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`flex-1 whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] transition-colors ${tab === t ? 'bg-blue font-semibold text-white' : 'text-text-dim hover:text-text'}`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* KPI row */}
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4 stagger">
          {([
            ['Подписчики', fmt(author.followers), 'text', a?.delta30 != null ? `${a.delta30 >= 0 ? '+' : ''}${a.delta30.toFixed(1)}% / 30д` : '—'],
            ['Медиана', fmt(median), 'blue', `постов: ${author.postsCount || '—'}`],
            ['Вовлечение', author.engagementAvg.toFixed(1) + '%', erTone(author.engagementAvg), a?.perWeek != null ? `${a.perWeek} постов/нед` : '—'],
            ['Доля хитов', (a?.hitRate ?? 0) + '%', (a?.hitRate ?? 0) >= 45 ? 'lime' : 'mute', 'выше медианы'],
          ] as Array<[string, string, Tone, string]>).map(([l, v, c, sub], k) => (
            <div key={k} className={`${tile} px-4 py-3.5`}>
              <div className="label mb-1.5 !text-[10px]">{l}</div>
              <div className={`text-[21px] font-extrabold leading-none tabular-nums tracking-[-0.02em] ${TONE_TEXT[c]}`}>{v}</div>
              <div className="mt-1.5 text-[11.5px] text-text-mute">{sub}</div>
            </div>
          ))}
        </div>

        {loading && (
          <div className="flex items-center justify-center gap-2 py-10 text-[13px] text-gold">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Загружаем аккаунт…
          </div>
        )}

        {!loading && a && !a.hasReels && (
          <div className={`${tile} mt-6 flex flex-col items-center p-6 text-center`}>
            <Icon3D name="processing" size={36} tile />
            <div className="mb-1.5 mt-3 text-[15px] font-semibold tracking-[-0.02em] text-text">Рилсы ещё не подтянулись</div>
            <div className="text-[13px] text-text-mute">Парсер собирает историю аккаунта в фоне — графики появятся после первого прохода.</div>
          </div>
        )}

        {!loading && a && a.hasReels && (
          <div className="fade-in" key={tab}>
            {/* ОБЗОР */}
            {tab === 'Обзор' && (<>
              <Sec title="Просмотры по рилсам · во времени" right={a.delta30 != null ? <span className={`inline-flex items-center gap-1 text-[12px] font-semibold tabular-nums ${a.delta30 >= 0 ? 'text-lime' : 'text-pink'}`}>{a.delta30 >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />} {Math.abs(a.delta30).toFixed(1)}%</span> : undefined}>
                <div className={`${tile} px-4 py-3`}>
                  {a.growth.length >= 2 ? <Line data={a.growth} color={HEX.lime} /> : <div className="py-3.5 text-[12px] text-text-mute">мало точек для графика</div>}
                </div>
              </Sec>
              <div className="grid gap-4 sm:grid-cols-2">
                <Sec title="Форматы контента">
                  <div className={`${tile} flex items-center gap-4 p-4`}>
                    <Donut segs={[{ value: a.reelsPct, color: HEX.blue }, { value: a.carouselPct, color: HEX.lime }, { value: a.photoPct, color: HEX.pink }]} />
                    <div className="flex flex-col gap-2">
                      {([['Reels', a.reelsPct, 'bg-blue'], ['Карусели', a.carouselPct, 'bg-lime'], ['Фото', a.photoPct, 'bg-pink']] as Array<[string, number, string]>).map(([l, v, c]) => (
                        <div key={l} className="flex items-center gap-2">
                          <span className={`h-2.5 w-2.5 rounded-full ${c}`} />
                          <span className="flex-1 text-[13px] text-text-dim">{l}</span>
                          <span className="text-[13px] font-semibold tabular-nums text-text">{v}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </Sec>
                <Sec title={`Просмотры · ${a.recentViews.length} Reels`}>
                  <div className={`${tile} px-4 py-4`}>
                    <Bars data={a.recentViews} color={HEX.blue} />
                    <div className="mt-2 text-[11.5px] text-text-mute">медиана канала: {fmt(median)}</div>
                  </div>
                </Sec>
              </div>
            </>)}

            {/* ВИРАЛЬНОСТЬ */}
            {tab === 'Виральность' && (<>
              <div className="mt-6 grid grid-cols-2 gap-2">
                <div className={`${tile} p-4`}>
                  <div className="label mb-2 !text-[10px]">Стабильность канала</div>
                  <div className={`text-[24px] font-extrabold tabular-nums tracking-[-0.02em] ${a.cv < 0.8 ? 'text-lime' : a.cv < 1.2 ? 'text-gold' : 'text-pink'}`}>{a.cv}</div>
                  <div className="mt-1.5 text-[12.5px] text-text-dim">{a.cv < 0.8 ? 'Стабильно выстреливает' : a.cv < 1.2 ? 'Умеренный разброс' : '«Лотерея» — редкие хиты'}</div>
                </div>
                <div className={`${tile} p-4`}>
                  <div className="label mb-2 !text-[10px]">Доля хитов</div>
                  <div className={`text-[24px] font-extrabold tabular-nums tracking-[-0.02em] ${a.hitRate >= 45 ? 'text-lime' : 'text-text-mute'}`}>{a.hitRate}%</div>
                  <div className="mt-1.5 text-[12.5px] text-text-dim">постов выше медианы канала</div>
                </div>
              </div>
              <Sec title="Распределение постов по Xn">
                <div className={`${tile} p-4`}>
                  {a.xnDist.map((d, i) => <HBar key={i} label={d.label} value={d.v} max={Math.max(...a.xnDist.map((x) => x.v), 1)} suffix="%" tone={i >= 3 ? 'lime' : i >= 1 ? 'blue' : 'mute'} />)}
                </div>
              </Sec>
              <Sec title="Топ виральные · Xn = просмотры ÷ медиана" right={<span className="text-[12px] tabular-nums text-text-mute">медиана {fmt(median)}</span>}>
                <div className="grid gap-1.5">
                  {a.topViral.map(({ r, x }, k) => (
                    <a key={r.id} href={r.url} target="_blank" rel="noreferrer" className={`${tile} flex items-center gap-3 px-3.5 py-2.5 no-underline transition-colors hover:border-gold/40 hover:bg-white/[0.06]`}>
                      <span className={`flex h-8 w-11 flex-none items-center justify-center rounded-full text-[12px] font-bold tabular-nums ${x >= 2 ? 'bg-lime text-bg' : 'bg-white/[0.08] text-text'}`}>{x.toFixed(1)}x</span>
                      <span className="flex-1 truncate text-[13px] text-text-dim">{r.caption?.slice(0, 60) || `Рилс №${k + 1}`}</span>
                      <span className="text-[13px] font-semibold tabular-nums text-gold">{fmt(r.views)}</span>
                    </a>
                  ))}
                </div>
              </Sec>
            </>)}

            {/* КОНТЕНТ */}
            {tab === 'Контент' && (<>
              {pa ? (
                <>
                  <Sec title="Темы / рубрики, которые заходят" right={<span className="text-[11.5px] text-text-mute">что копировать</span>}>
                    <div className="flex flex-wrap gap-2">
                      {pa.bestTopics.length ? pa.bestTopics.map((t, i) => (
                        <span key={i} className="rounded-full border border-border-soft bg-white/[0.04] px-3.5 py-1.5 text-[13px] text-text">{t}</span>
                      )) : <span className="text-[12px] text-text-mute">—</span>}
                    </div>
                  </Sec>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Sec title="Повторяющиеся хуки">
                      <div className={`${tile} px-4 py-2`}>
                        {pa.recurringHooks.length ? pa.recurringHooks.map((h, i) => (
                          <div key={i} className={`flex gap-2.5 py-2 ${i < pa.recurringHooks.length - 1 ? 'border-b border-border-soft' : ''}`}>
                            <ChevronRight className="mt-0.5 h-3.5 w-3.5 flex-none text-lime" />
                            <span className="flex-1 text-[13px] text-text-dim">{h}</span>
                          </div>
                        )) : <span className="text-[12px] text-text-mute">—</span>}
                      </div>
                    </Sec>
                    <Sec title="Длина видео → виральность">
                      <div className={`${tile} p-4`}>
                        {a.hasLen ? <>
                          {a.lenBuckets.filter((l) => l.n > 0).map((l, i) => <HBar key={i} label={l.label} value={l.xn} max={Math.max(...a.lenBuckets.map((x) => x.xn), 1)} suffix="x" tone={xnTone(l.xn)} sub={`${l.n} рилс.`} />)}
                          <div className="mt-1 text-[11.5px] text-text-mute">оптимум: {[...a.lenBuckets].filter((l) => l.n > 0).sort((x, y) => y.xn - x.xn)[0]?.label ?? '—'}</div>
                        </> : <span className="text-[12px] text-text-mute">нет данных о длительности</span>}
                      </div>
                    </Sec>
                  </div>
                  {pa.bestFormats.length > 0 && (
                    <Sec title="Лучшие форматы">
                      <div className="flex flex-wrap gap-2">
                        {pa.bestFormats.map((f, i) => <span key={i} className="rounded-full border border-gold/30 bg-blue/[0.08] px-3.5 py-1.5 text-[13px] text-gold">{f}</span>)}
                      </div>
                    </Sec>
                  )}
                </>
              ) : (
                <div className={`${tile} mt-6 flex flex-col items-center p-6 text-center`}>
                  <div className="mb-4 text-[14px] text-text-dim">Рубрики и хуки собираются из расшифровок при AI-разборе.</div>
                  <button type="button" onClick={() => setTab('AI-разбор')} className="btn-ghost !border-lime/40 !text-lime">
                    Перейти к AI-разбору
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              )}
            </>)}

            {/* ТАЙМИНГ */}
            {tab === 'Тайминг' && (
              <Sec title="Лучшее время постинга" right={a.hasTiming ? <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-lime"><Star className="h-3.5 w-3.5 fill-current" /> {a.bestWindow}</span> : undefined}>
                <div className={`${tile} p-4`}>
                  {a.hasTiming ? <>
                    <div className="grid gap-1 [grid-template-columns:48px_repeat(7,1fr)]">
                      <span />
                      {DAYS.map((d) => <span key={d} className="text-center text-[11px] text-text-mute">{d}</span>)}
                      {SLOTS.map((s, si) => (
                        <React.Fragment key={s}>
                          <span className="self-center text-[11px] text-text-mute">{s}</span>
                          {DAYS.map((_, di) => {
                            const v = a.heat[si][di], isBest = a.best.d === di && a.best.s === si;
                            return <span key={di} title={`${DAYS[di]} ${s}`} className={`h-7 rounded-lg ${isBest ? 'ring-2 ring-lime' : ''}`} style={{ background: `rgba(31,123,255,${0.1 + v * 0.8})` }} />;
                          })}
                        </React.Fragment>
                      ))}
                    </div>
                    <div className="mt-4 flex items-center gap-2">
                      <span className="text-[11px] text-text-mute">меньше</span>
                      <div className="h-1.5 flex-1 rounded-full bg-gradient-to-r from-blue/10 to-blue/90" />
                      <span className="text-[11px] text-text-mute">выше виральность</span>
                    </div>
                  </> : <span className="text-[12px] text-text-mute">нет дат публикаций для тепловой карты</span>}
                  {pa?.cadence?.best_days?.length ? <div className="mt-3 text-[12px] text-text-dim">Claude: лучшие дни — {pa.cadence.best_days.join(', ')}</div> : null}
                </div>
              </Sec>
            )}

            {/* AI-РАЗБОР */}
            {tab === 'AI-разбор' && (
              <Sec title="Стратегический разбор от Claude" right={pa ? <span className="text-[11px] text-text-mute">{pa.model}</span> : undefined}>
                <div className={`${tile} p-5`}>
                  {!pa && !aiLoading && (
                    <div className="flex flex-col items-center py-2 text-center">
                      <Icon3D name="brain" size={40} tile sway />
                      <p className="mb-4 mt-3 text-[14px] leading-relaxed text-text-dim">
                        Claude соберёт из метрик готовый план: какие рубрики, хуки, длину и тайминг копировать, чтобы повторить виральность @{author.username} в твоём контенте.
                      </p>
                      <button type="button" onClick={runAI} className="btn-lime">
                        <Sparkles className="h-4 w-4" />
                        Сгенерировать разбор
                      </button>
                    </div>
                  )}
                  {aiLoading && (
                    <div className="flex items-center justify-center gap-2 py-5 text-[13px] text-gold">
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Claude анализирует аккаунт…
                    </div>
                  )}
                  {pa && !aiLoading && (
                    <div>
                      <div className="whitespace-pre-wrap text-[14px] leading-relaxed text-text">{pa.summary}</div>
                      {pa.recommendations.length > 0 && (
                        <div className="mt-4 border-t border-border-soft pt-4">
                          <div className="label mb-2.5">Что копировать</div>
                          {pa.recommendations.map((rec, i) => (
                            <div key={i} className="mb-2.5 flex gap-2.5">
                              <span className="inline-flex h-6 min-w-[24px] items-center justify-center rounded-full bg-lime/15 text-[11px] font-semibold tabular-nums text-lime">{i + 1}</span>
                              <span className="flex-1 text-[13.5px] leading-relaxed text-text">{rec}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </Sec>
            )}
          </div>
        )}

        {/* actions */}
        <div className="mt-7 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onToggleSpy(author.id)}
            className={`flex-1 ${author.isWatching ? 'btn-ghost !border-pink/45 !text-pink' : 'btn-primary !bg-pink !shadow-[0_8px_24px_rgba(255,61,139,0.35)] hover:!bg-pink/90'}`}
          >
            {author.isWatching ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {author.isWatching ? 'Убрать из наблюдения' : 'Взять под наблюдение'}
          </button>
          <button type="button" onClick={cloneTopFormat} className="btn-ghost !border-lime/40 !text-lime">
            <Copy className="h-4 w-4" />
            Клонировать топ-формат
          </button>
        </div>
        {author.isWatching && (
          <div className="mt-3 flex items-center justify-center gap-2 text-[12px] text-pink">
            <span className="h-1.5 w-1.5 rounded-full bg-pink animate-pulse" />
            Парсер активен · обновление каждые {author.refreshInterval ?? 24} ч
          </div>
        )}
      </div>
    </div>
    </Portal>
  );
}

/* ---------- add-blogger modal ---------- */
function AddModal({ onClose, onAdded, onToast }: { onClose: () => void; onAdded: () => void; onToast: (m: string) => void }) {
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const handle = username.replace(/^@/, '').trim();
    if (!handle || busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/research/authors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: handle }),
      });
      const data = await res.json();
      if (data.ok) { onToast(`@${handle} добавлен`); onAdded(); onClose(); }
      else if (data.error === 'insufficient_tokens') onToast(`Не хватает токенов: нужно ${data.need}, есть ${data.have}`);
      else onToast('Не удалось добавить блогера');
    } catch { onToast('Ошибка добавления'); }
    setBusy(false);
  };
  return (
    <Portal>
    <div onClick={onClose} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm fade-in">
      <div onClick={(e) => e.stopPropagation()} className="panel !bg-surface/95 w-[420px] max-w-[92vw] p-6 shadow-glass pop-in">
        <div className="mb-4 flex items-center gap-3">
          <Icon3D name="bloggers" size={22} tile />
          <span className="text-[17px] font-semibold tracking-[-0.02em] text-text">Добавить блогера</span>
        </div>
        <div className="relative mb-4">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[14px] text-text-mute">@</span>
          <input autoFocus value={username} onChange={(e) => setUsername(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} placeholder="username в Instagram" className="input !rounded-full !pl-9" />
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="btn-ghost flex-1">Отмена</button>
          <button type="button" onClick={submit} disabled={busy} className="btn-lime flex-1">
            {busy && <RefreshCw className="h-4 w-4 animate-spin" />}
            {busy ? 'Парсим…' : 'Добавить'}
          </button>
        </div>
        <div className="mt-3.5 text-[12px] leading-relaxed text-text-mute">Первичный парс собирает последние рилсы и считает медиану. Списываются кредиты за скрейп.</div>
      </div>
    </div>
    </Portal>
  );
}

/* ---------- page ---------- */
export function BloggersClient() {
  const [bloggers, setBloggers] = useState<BloggerRow[]>([]);
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [folder, setFolder] = useState<string | null>(null);
  const [sort, setSort] = useState('followers');
  const [sizeMin, setSizeMin] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [toast, setToast] = useState('');
  // Лента поиска: media (reels с обложками) + блогеры. null = режим каталога.
  const [feed, setFeed] = useState<ResearchReelView[] | null>(null);
  const [searching, setSearching] = useState(false);
  // Причина пустой выдачи: 'empty' — реально ничего, 'scraper' — парсер
  // (Apify) упал/исчерпал лимит. Различаем, чтобы не врать «ничего не нашли».
  const [searchNote, setSearchNote] = useState<'empty' | 'scraper' | null>(null);

  const showToast = useCallback((m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(''), 3200);
  }, []);

  const loadAuthors = useCallback(() => {
    setLoading(true);
    fetch('/api/research/authors')
      .then((r) => r.json())
      .then((j) => { if (j.ok) setBloggers(j.authors); })
      .catch(() => showToast('Не удалось загрузить блогеров'))
      .finally(() => setLoading(false));
  }, [showToast]);

  const loadFolders = useCallback(() => {
    fetch('/api/research/folders?type=bloggers')
      .then((r) => r.json())
      .then((j) => { if (j.ok) setFolders(j.folders); })
      .catch(() => {});
  }, []);

  useEffect(() => { loadAuthors(); loadFolders(); }, [loadAuthors, loadFolders]);

  const runSearch = useCallback(async () => {
    const niche = query.trim();
    if (niche.length < 2) { showToast('Введите запрос для поиска'); return; }
    setSearching(true);
    setSearchNote(null);
    try {
      const res = await fetch('/api/research/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ niche, limit: 30 }),
      });
      const data = await res.json();
      if (data.ok) {
        setFeed(data.reels ?? []);
        // Поиск индексирует новых авторов — подтянем их в каталог,
        // чтобы карточки блогеров в ленте были с полным функционалом.
        loadAuthors();
        if (!data.reels?.length) {
          // Бэкенд при сбое Apify (исчерпан лимит / упал актор) всё равно
          // отдаёт ok:true с пустым reels и причиной в data.errors. Не выдаём
          // это за «ничего не нашли» — показываем честную причину.
          const errs: string[] = Array.isArray(data.errors) ? data.errors : [];
          const scraperDown = errs.some((e) =>
            /budget|limit|platform-feature-disabled|apify \d{3}|reels_search_not_configured|apify fetch/i.test(e),
          );
          setSearchNote(scraperDown ? 'scraper' : 'empty');
          showToast(scraperDown
            ? 'Поиск временно недоступен: парсер исчерпал лимит. Попробуйте позже'
            : 'Ничего не нашли по этому запросу');
        }
      } else if (data.error === 'apify_not_configured') {
        setSearchNote('scraper');
        showToast('Поиск недоступен: APIFY не настроен на сервере');
      } else if (data.error === 'insufficient_tokens') {
        showToast(`Не хватает токенов: нужно ${data.need}, есть ${data.have}`);
      } else {
        setSearchNote('scraper');
        showToast('Поиск не удался');
      }
    } catch {
      setSearchNote('scraper');
      showToast('Ошибка поиска');
    }
    setSearching(false);
  }, [query, loadAuthors, showToast]);

  const clearSearch = useCallback(() => { setFeed(null); setQuery(''); setSearchNote(null); }, []);

  const spyCount = bloggers.filter((b) => b.isWatching).length;

  const toggleSpy = useCallback(async (id: string) => {
    const b = bloggers.find((x) => x.id === id);
    if (!b) return;
    const next = !b.isWatching;
    setBloggers((p) => p.map((x) => (x.id === id ? { ...x, isWatching: next } : x)));
    try {
      const res = await fetch('/api/research/watchlist', {
        method: next ? 'POST' : 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authorId: id }),
      });
      if (!res.ok) throw new Error();
      showToast(next ? `@${b.username} под наблюдением` : `@${b.username} снят с наблюдения`);
    } catch {
      setBloggers((p) => p.map((x) => (x.id === id ? { ...x, isWatching: !next } : x)));
      showToast('Не удалось изменить наблюдение');
    }
  }, [bloggers, showToast]);

  const addFolder = async () => {
    const name = window.prompt('Название папки');
    if (!name?.trim()) return;
    try {
      const res = await fetch('/api/research/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), type: 'bloggers' }),
      });
      if (res.ok) loadFolders();
    } catch { showToast('Не удалось создать папку'); }
  };

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const r = bloggers.filter((b) => {
      const okQ = !q || b.username.toLowerCase().includes(q) || (b.niche || '').toLowerCase().includes(q);
      const okF = !folder || (folder === 'spy' ? b.isWatching : b.folderIds.includes(folder));
      return okQ && okF && b.followers >= sizeMin;
    });
    r.sort((a, b) => (sort === 'views' ? b.medianViews - a.medianViews : sort === 'er' ? b.engagementAvg - a.engagementAvg : b.followers - a.followers));
    return r;
  }, [bloggers, query, folder, sort, sizeMin]);

  // Топ блогеров ниши — ранжированный список авторов из ленты поиска.
  // Агрегируем рилсы по автору (его лучшие просмотры / средний ER / число
  // попаданий в выдачу), мёржим с каталогом (isWatching / папки / полный
  // функционал карточки), синтезируем строку для ещё не проиндексированных
  // авторов. Сортировка/фильтр — те же чипы, что и в каталоге.
  const topBloggers = useMemo(() => {
    if (!feed) return [] as Array<BloggerRow & { hits: number; topViews: number }>;
    const byCatalog = new Map(bloggers.map((b) => [b.id, b]));
    const agg = new Map<string, {
      a: ResearchReelView['author']; hits: number; topViews: number; erSum: number; erN: number;
    }>();
    for (const r of feed) {
      const id = r.author.id;
      const cur = agg.get(id) ?? { a: r.author, hits: 0, topViews: 0, erSum: 0, erN: 0 };
      cur.hits += 1;
      cur.topViews = Math.max(cur.topViews, r.views || 0);
      if (r.engagementRate != null) { cur.erSum += r.engagementRate; cur.erN += 1; }
      agg.set(id, cur);
    }
    const rows = Array.from(agg.values()).map(({ a, hits, topViews, erSum, erN }) => {
      const cat = byCatalog.get(a.id);
      const erFromFeed = erN ? erSum / erN : 0;
      const row: BloggerRow & { hits: number; topViews: number } = cat
        ? { ...cat, hits, topViews }
        : {
            id: a.id, platform: 'instagram', username: a.username, niche: null,
            followers: a.followers ?? 0, postsCount: 0,
            medianViews: a.medianViews ?? topViews, engagementAvg: erFromFeed,
            avatarUrl: a.avatarUrl ?? '', lowConfidence: true, lastIndexedAt: null,
            isWatching: false, refreshInterval: null, folderIds: [], hits, topViews,
          };
      return row;
    });
    const ranked = rows.filter((b) => b.followers >= sizeMin);
    ranked.sort((a, b) =>
      sort === 'views'
        ? (b.medianViews || b.topViews) - (a.medianViews || a.topViews)
        : sort === 'er'
          ? b.engagementAvg - a.engagementAvg
          : (b.followers || b.topViews) - (a.followers || a.topViews));
    return ranked;
  }, [feed, bloggers, sort, sizeMin]);

  const detail = bloggers.find((b) => b.id === selected) ?? null;
  const detailSeed = detail ? bloggers.indexOf(detail) : 0;
  const activeFolderName = folder === 'spy' ? 'Шпион' : folders.find((f) => f.id === folder)?.name;

  const renderBloggerCard = (b: BloggerRow, i: number) => (
    <div
      key={b.id}
      onClick={() => setSelected(b.id)}
      className={`card-editorial relative cursor-pointer p-5 ${b.isWatching ? '!border-pink/35' : ''}`}
    >
      {b.isWatching && (
        <div className="absolute top-4 right-4 inline-flex items-center gap-1.5 rounded-full bg-pink/[0.12] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-pink">
          <span className="h-1.5 w-1.5 rounded-full bg-pink animate-pulse" />
          Парсинг
        </div>
      )}
      <div className="mb-4 flex items-center gap-3">
        <Avatar src={igProxy(b.avatarUrl)} name={b.username} seed={i} size={48} />
        <div className="min-w-0">
          <div className="truncate text-[15px] font-semibold tracking-[-0.01em] text-text">@{b.username}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-text-mute">
            <span className="rounded-full border border-border-soft px-1.5 py-px text-[10px] font-semibold text-text-mute">IG</span>
            {b.niche || 'без ниши'}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2.5 border-t border-border-soft pt-4">
        <Stat label="Подписч." value={fmt(b.followers)} />
        <Stat label="Медиана" value={fmt(b.medianViews)} tone="blue" />
        <Stat label="Вовлеч." value={b.engagementAvg.toFixed(1) + '%'} tone={erTone(b.engagementAvg)} />
      </div>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setSelected(b.id); }}
          className="btn-ghost flex-1 !px-3 !py-2 !text-[13px]"
        >
          <BarChart3 className="h-4 w-4" />
          Анализ
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); toggleSpy(b.id); }}
          className={`btn-ghost flex-1 !px-3 !py-2 !text-[13px] ${b.isWatching ? '!border-pink/45 !bg-pink/[0.1] !text-pink' : 'hover:!border-pink/45 hover:!text-pink'}`}
        >
          {b.isWatching ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          Шпион
        </button>
      </div>
    </div>
  );

  return (
    <div className="text-text">
      <PageHero
        eyebrow="Persona Studio · Разведка"
        title="Блогеры"
        icon="bloggers"
        extra={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-[320px]">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-text-mute" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && runSearch()}
                placeholder="Ниша, тема или @username"
                className="input !rounded-full !pl-11"
              />
            </div>
            <button type="button" onClick={runSearch} disabled={searching} className="btn-primary">
              {searching ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {searching ? 'Ищем…' : 'Поиск'}
            </button>
            <button type="button" onClick={() => setShowAdd(true)} className="btn-lime">
              <Plus className="h-4 w-4" />
              Добавить блогера
            </button>
          </div>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        {SORTS.map((s) => (
          <button key={s.id} type="button" onClick={() => setSort(s.id)} className={chipCls(sort === s.id)}>
            {s.label}
          </button>
        ))}
        <div className="mx-1 h-6 w-px bg-border-soft" />
        {[{ v: 0, l: 'Все' }, { v: 1e6, l: '1M+' }, { v: 25e6, l: '25M+' }, { v: 50e6, l: '50M+' }].map((o) => (
          <button key={o.v} type="button" onClick={() => setSizeMin(o.v)} className={chipCls(sizeMin === o.v)}>
            {o.l}
          </button>
        ))}
      </div>

      <div className="mb-5 flex flex-wrap items-baseline gap-3">
        <span className="label">{feed ? 'Лента поиска' : 'Найдено'}</span>
        {feed ? (
          <>
            <span className="text-[34px] font-extrabold leading-none tabular-nums tracking-[-0.02em] text-text">{searching ? '—' : feed.length}</span>
            <span className="text-[13px] text-text-mute">медиа · {topBloggers.length} блогеров</span>
            <button type="button" onClick={clearSearch} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[13px] text-pink transition-colors hover:bg-pink/[0.1]">
              <X className="h-3.5 w-3.5" />
              Сбросить
            </button>
          </>
        ) : (
          <>
            <span className="text-[34px] font-extrabold leading-none tabular-nums tracking-[-0.02em] text-text">{loading ? '—' : list.length}</span>
            {folder && (
              <button type="button" onClick={() => setFolder(null)} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[13px] text-pink transition-colors hover:bg-pink/[0.1]">
                <X className="h-3.5 w-3.5" />
                {activeFolderName}
              </button>
            )}
          </>
        )}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_280px]">
        {feed ? (
          <div className="grid gap-8">
            {/* Топ блогеров ниши — главный результат поиска */}
            <div>
              <h2 className="mb-4 flex items-center gap-3">
                <span className="sec-num">/01</span>
                <span className="sec-title">Топ блогеров ниши · {searching ? '…' : topBloggers.length}</span>
              </h2>
              {searching ? (
                <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]">
                  {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-[188px] !rounded-[24px]" />)}
                </div>
              ) : topBloggers.length ? (
                <div className="grid gap-3 stagger [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]">
                  {topBloggers.map((b, i) => renderBloggerCard(b, i))}
                </div>
              ) : (
                <div className="panel flex flex-col items-center px-6 py-10 text-center">
                  <Icon3D name={searchNote === 'scraper' ? 'warning' : 'research'} size={40} tile />
                  {searchNote === 'scraper' ? (
                    <>
                      <div className="mt-4 text-[16px] font-semibold tracking-[-0.02em] text-text">Поиск временно недоступен</div>
                      <div className="mt-1.5 text-[13px] text-text-mute">Парсер исчерпал месячный лимит или недоступен. Попробуйте позже</div>
                    </>
                  ) : (
                    <>
                      <div className="mt-4 text-[16px] font-semibold tracking-[-0.02em] text-text">Ничего не нашли</div>
                      <div className="mt-1.5 text-[13px] text-text-mute">Попробуй другой запрос</div>
                    </>
                  )}
                </div>
              )}
            </div>
            {/* Медиа — обложки рилсов (доказательная база ниши) */}
            {(searching || feed.length > 0) && (
              <div>
                <h2 className="mb-4 flex items-center gap-3">
                  <span className="sec-num">/02</span>
                  <span className="sec-title">Медиа · {searching ? '…' : feed.length} обложек</span>
                </h2>
                {searching ? (
                  <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]">
                    {Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton aspect-[4/5] !rounded-[20px]" />)}
                  </div>
                ) : (
                  <div className="grid gap-3 stagger [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]">
                    {feed.map((r) => <ReelCover key={r.id} reel={r} />)}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="grid gap-3 stagger [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]">
            {loading && Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="panel h-[188px] p-5">
                <div className="flex items-center gap-3">
                  <div className="skeleton h-12 w-12 !rounded-full" />
                  <div className="flex-1">
                    <div className="skeleton mb-2 h-3 w-3/5" />
                    <div className="skeleton h-2.5 w-2/5" />
                  </div>
                </div>
              </div>
            ))}
            {!loading && list.map((b, i) => renderBloggerCard(b, i))}
            {!loading && list.length === 0 && (
              <div className="panel col-span-full flex flex-col items-center px-6 py-14 text-center">
                <Icon3D name="bloggers" size={44} tile />
                <div className="mt-4 text-[17px] font-semibold tracking-[-0.02em] text-text">Никого не нашли</div>
                <div className="mt-1.5 text-[13px] text-text-mute">Введите нишу и нажмите «Поиск», либо добавьте блогера через «+ Добавить блогера»</div>
              </div>
            )}
          </div>
        )}

        <aside className="panel !sticky top-5 hidden p-4 lg:block">
          <div className="mb-3.5 flex items-center justify-between px-1">
            <span className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.02em] text-text">
              <Icon3D name="folders" size={20} />
              Папки
            </span>
            <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[12px] tabular-nums text-text-mute">{folders.length + 1}</span>
          </div>
          <button
            type="button"
            onClick={addFolder}
            className="mb-3 flex w-full items-center justify-center gap-1.5 rounded-full border border-dashed border-lime/40 py-2 text-[13px] font-medium text-lime transition-colors hover:bg-lime/[0.08]"
          >
            <Plus className="h-4 w-4" />
            Добавить папку
          </button>

          {/* Шпион = watchlist */}
          <button
            type="button"
            onClick={() => setFolder(folder === 'spy' ? null : 'spy')}
            className={`mb-1 flex w-full items-center gap-2.5 rounded-2xl px-3 py-2.5 text-left transition-colors ${folder === 'spy' ? 'bg-pink/[0.1]' : 'hover:bg-white/[0.05]'}`}
          >
            <span className="h-2 w-2 flex-none rounded-full bg-pink animate-pulse" />
            <span className="flex-1 text-[14px] text-text">Шпион</span>
            <span className="text-[12px] font-semibold tabular-nums text-pink">{spyCount}</span>
          </button>

          {folders.map((f) => {
            const active = folder === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFolder(active ? null : f.id)}
                className={`mb-1 flex w-full items-center gap-2.5 rounded-2xl px-3 py-2.5 text-left transition-colors ${active ? 'bg-blue/[0.12]' : 'hover:bg-white/[0.05]'}`}
              >
                <FolderIcon className={`h-4 w-4 flex-none ${active ? 'text-gold' : 'text-text-mute'}`} />
                <span className={`flex-1 truncate text-[14px] ${active ? 'text-text' : 'text-text-dim'}`}>{f.name}</span>
                <span className="text-[12px] font-semibold tabular-nums text-text-mute">{f._count.items}</span>
              </button>
            );
          })}

          <div className="mt-3.5 border-t border-border-soft px-1 pt-3.5">
            <div className="label mb-2">Папка «Шпион»</div>
            <p className="m-0 text-[12.5px] leading-relaxed text-text-mute">Блогеры здесь под наблюдением: парсер забирает Reels, считает виральность по медиане и шлёт алёрты на всплески.</p>
          </div>
        </aside>
      </div>

      {detail && <Analysis author={detail} seed={detailSeed} onClose={() => setSelected(null)} onToggleSpy={toggleSpy} onToast={showToast} />}
      {showAdd && <AddModal onClose={() => setShowAdd(false)} onAdded={loadAuthors} onToast={showToast} />}

      {toast && (
        <Portal>
        <div className="fixed bottom-6 left-1/2 z-[80] -translate-x-1/2 rounded-full border border-border-soft bg-surface/90 px-5 py-3 text-[13px] text-text shadow-glass backdrop-blur-xl fade-in">
          {toast}
        </div>
        </Portal>
      )}
    </div>
  );
}

// Overlays render into <body>: an animated ancestor (filter/transform) would
// otherwise become the containing block for `position: fixed`.
function Portal({ children }: { children: React.ReactNode }) {
  return createPortal(children, document.body);
}
