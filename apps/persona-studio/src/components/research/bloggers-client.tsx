'use client';

// Страница «Блогеры / Шпион + Анализ аккаунта».
// UI — дизайн-система AI Mastery (#080808 / #f5f0e8 / lime·blue·pink, Georgia +
// JetBrains Mono). Источник данных — существующий backend /research:
//   - каталог авторов        GET  /api/research/authors
//   - добавить блогера        POST /api/research/authors { username }
//   - карточка + рилсы + разбор GET /api/research/authors/:id
//   - AI-разбор страницы      POST /api/research/authors/:id/analyze-page
//   - папка «Шпион»           GET/POST/DELETE /api/research/watchlist
//   - папки блогеров          GET/POST /api/research/folders?type=bloggers
// Все графики «Обзор/Виральность» считаются из реальных рилсов; «Контент/
// Тайминг/AI-разбор» — из ResearchPageAnalysis (Claude) + рилсов.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { igProxy, type ResearchReelView } from './types';

const C = {
  bg: '#080808', panel: '#0e0e0e', card: '#121212', cardHover: '#181818',
  border: '#1f1f1f', borderSoft: '#171717', text: '#f5f0e8', muted: '#8a857c',
  faint: '#55514a', lime: '#c8f060', blue: '#60c8f0', pink: '#f06090',
};

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
const erColor = (er: number) => (er >= 5 ? C.lime : er >= 2 ? C.blue : C.muted);
const xnColor = (x: number) => (x >= 2 ? C.lime : x >= 1.3 ? C.blue : C.muted);

const avatarGrad = (seed: number) => {
  const p = [['#c8f060', '#1f3a12'], ['#60c8f0', '#0f2a3a'], ['#f06090', '#3a0f22'], ['#f5f0e8', '#2a2a2a']][seed % 4];
  return `linear-gradient(135deg, ${p[0]} 0%, ${p[1]} 100%)`;
};

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
function Avatar({ src, name, seed, size = 48 }: { src?: string; name: string; seed: number; size?: number }) {
  const [ok, setOk] = useState(Boolean(src));
  useEffect(() => setOk(Boolean(src)), [src]);
  const badge = Math.round(size * 0.42);
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <div style={{ width: size, height: size, borderRadius: '50%', overflow: 'hidden', background: ok ? '#000' : avatarGrad(seed), display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Georgia', fontSize: size * 0.38, color: '#0a0a0a', fontWeight: 700, border: `1px solid ${C.border}` }}>
        {ok ? <img src={src} alt={name} onError={() => setOk(false)} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : (name[0] || '?').toUpperCase()}
      </div>
      <span style={{ position: 'absolute', left: -2, bottom: -2, width: badge, height: badge, borderRadius: badge, background: 'linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)', border: `2px solid ${C.bg}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ width: badge * 0.46, height: badge * 0.46, border: '1.5px solid #fff', borderRadius: badge * 0.18, position: 'relative' }}>
          <span style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: badge * 0.2, height: badge * 0.2, border: '1.5px solid #fff', borderRadius: '50%' }} />
        </span>
      </span>
    </div>
  );
}
function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
      <span className="mono" style={{ fontSize: 9, letterSpacing: '.09em', textTransform: 'uppercase', color: C.faint }}>{label}</span>
      <span className="mono" style={{ fontSize: 15, fontWeight: 600, color: color || C.text }}>{value}</span>
    </div>
  );
}
function Bars({ data, color }: { data: number[]; color: string }) {
  if (!data.length) return null;
  const max = Math.max(...data, 1);
  return (
    <svg viewBox="0 0 120 36" style={{ width: '100%', height: 44 }}>
      {data.map((d, i) => {
        const h = (d / max) * 32 + 2, w = 120 / data.length - 3;
        return <rect key={i} x={i * (120 / data.length) + 1.5} y={36 - h} width={w} height={h} rx={1.5} fill={color} opacity={0.35 + (d / max) * 0.65} />;
      })}
    </svg>
  );
}
function Line({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const max = Math.max(...data), min = Math.min(...data);
  const pts = data.map((d, i) => `${(i / (data.length - 1)) * 120},${34 - ((d - min) / (max - min || 1)) * 30 - 2}`).join(' ');
  return (
    <svg viewBox="0 0 120 36" style={{ width: '100%', height: 50 }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      {data.map((d, i) => i === data.length - 1 && <circle key={i} cx={(i / (data.length - 1)) * 120} cy={34 - ((d - min) / (max - min || 1)) * 30 - 2} r="2.2" fill={color} />)}
    </svg>
  );
}
function HBar({ label, value, max, suffix, color, sub }: { label: string; value: number; max: number; suffix: string; color: string; sub?: string }) {
  return (
    <div style={{ marginBottom: 9 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <span style={{ fontSize: 12.5, color: C.text, fontFamily: 'Georgia' }}>{label}{sub && <span style={{ color: C.faint, fontSize: 11 }}>  ·  {sub}</span>}</span>
        <span className="mono" style={{ fontSize: 12, color, fontWeight: 600 }}>{value}{suffix}</span>
      </div>
      <div style={{ height: 5, background: '#1a1a1a', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(100, (value / max) * 100)}%`, height: '100%', background: color, borderRadius: 4 }} />
      </div>
    </div>
  );
}
function Donut({ segs, size = 96 }: { segs: { value: number; color: string }[]; size?: number }) {
  const total = segs.reduce((s, x) => s + x.value, 0) || 1; let acc = 0; const r = 38, cir = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 96 96" style={{ width: size, height: size }}>
      {segs.map((s, i) => {
        const frac = s.value / total, dash = `${frac * cir} ${cir}`, off = -acc * cir; acc += frac;
        return <circle key={i} cx="48" cy="48" r={r} fill="none" stroke={s.color} strokeWidth="11" strokeDasharray={dash} strokeDashoffset={off} transform="rotate(-90 48 48)" />;
      })}
      <text x="48" y="52" textAnchor="middle" fill={C.text} style={{ font: "600 16px 'JetBrains Mono'" }}>{segs[0].value}%</text>
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
    <a href={reel.url} target="_blank" rel="noreferrer" className="card-b" style={{ display: 'block', background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', textDecoration: 'none' }}>
      <div style={{ position: 'relative', width: '100%', aspectRatio: '4 / 5', background: showThumb ? '#000' : avatarGrad(reel.id.length + reel.views) }}>
        {showThumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={reel.caption?.slice(0, 40) || reel.author.username} onError={() => setFailed(true)} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Georgia', fontSize: 30, color: '#0a0a0a', fontWeight: 700 }}>{(reel.author.username[0] || '?').toUpperCase()}</div>
        )}
        {/* виральность badge */}
        {xn != null && xn > 0 && (
          <span className="mono" style={{ position: 'absolute', top: 8, left: 8, padding: '3px 7px', borderRadius: 7, fontSize: 11, fontWeight: 700, background: xn >= 2 ? C.lime : 'rgba(8,8,8,.78)', color: xn >= 2 ? '#0a0a0a' : C.text }}>{xn.toFixed(1)}x</span>
        )}
        {/* views + author overlay */}
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '18px 10px 9px', background: 'linear-gradient(180deg, transparent, rgba(8,8,8,.92))' }}>
          <div className="mono" style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>▶ {fmt(reel.views)}</div>
          <div className="mono" style={{ fontSize: 10, color: '#d8d2c8', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>@{reel.author.username}</div>
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
    <div style={{ marginTop: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <span className="mono" style={{ fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: C.faint }}>{title}</span>
        {right}
      </div>
      {children}
    </div>
  );

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.72)', display: 'flex', justifyContent: 'flex-end', zIndex: 50, backdropFilter: 'blur(2px)' }}>
      <div className="ps-scroll" onClick={(e) => e.stopPropagation()} style={{ width: 720, maxWidth: '96vw', height: '100%', background: C.panel, borderLeft: `1px solid ${C.border}`, overflowY: 'auto', padding: 26 }}>
        {/* head */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <Avatar src={igProxy(author.avatarUrl)} name={author.username} seed={seed} size={58} />
            <div>
              <div className="mono" style={{ fontSize: 17, fontWeight: 700 }}>@{author.username}</div>
              <div style={{ fontSize: 13, color: C.muted }}>{author.niche || 'без ниши'} · {author.platform}</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: C.muted, fontSize: 24, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        {/* tabs */}
        <div style={{ display: 'flex', gap: 4, marginTop: 20, borderBottom: `1px solid ${C.border}` }}>
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)} className="mono" style={{ background: 'transparent', border: 'none', borderBottom: `2px solid ${tab === t ? C.lime : 'transparent'}`, color: tab === t ? C.text : C.muted, padding: '9px 12px', fontSize: 11.5, letterSpacing: '.03em', cursor: 'pointer', textTransform: 'uppercase', marginBottom: -1 }}>{t}</button>
          ))}
        </div>

        {/* KPI row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 2, marginTop: 20 }}>
          {[
            ['Подписчики', fmt(author.followers), C.text, a?.delta30 != null ? `${a.delta30 >= 0 ? '+' : ''}${a.delta30.toFixed(1)}% / 30д` : '—'],
            ['Медиана', fmt(median), C.blue, `постов: ${author.postsCount || '—'}`],
            ['Вовлечение', author.engagementAvg.toFixed(1) + '%', erColor(author.engagementAvg), a?.perWeek != null ? `${a.perWeek} постов/нед` : '—'],
            ['Hit-rate', (a?.hitRate ?? 0) + '%', (a?.hitRate ?? 0) >= 45 ? C.lime : C.muted, 'выше медианы'],
          ].map(([l, v, c, sub], k) => (
            <div key={k} style={{ background: C.card, padding: '13px 14px', borderRadius: k === 0 ? '10px 0 0 10px' : k === 3 ? '0 10px 10px 0' : 0 }}>
              <div className="mono" style={{ fontSize: 8.5, letterSpacing: '.1em', textTransform: 'uppercase', color: C.faint, marginBottom: 6 }}>{l as string}</div>
              <div className="mono" style={{ fontSize: 19, fontWeight: 600, color: c as string }}>{v as string}</div>
              <div className="mono" style={{ fontSize: 9.5, color: C.faint, marginTop: 4 }}>{sub as string}</div>
            </div>
          ))}
        </div>

        {loading && <div className="mono" style={{ fontSize: 12, color: C.blue, textAlign: 'center', padding: '40px 0' }}>Загружаем аккаунт…</div>}

        {!loading && a && !a.hasReels && (
          <div style={{ marginTop: 24, background: C.card, borderRadius: 10, padding: 20, textAlign: 'center' }}>
            <div style={{ fontSize: 14, color: C.text, fontFamily: 'Georgia', marginBottom: 6 }}>Рилсы ещё не подтянулись</div>
            <div className="mono" style={{ fontSize: 11.5, color: C.faint }}>Парсер собирает историю аккаунта в фоне — графики появятся после первого прохода.</div>
          </div>
        )}

        {!loading && a && a.hasReels && (
          <>
            {/* ОБЗОР */}
            {tab === 'Обзор' && (<>
              <Sec title="Просмотры по рилсам · во времени" right={a.delta30 != null ? <span className="mono" style={{ fontSize: 11, color: a.delta30 >= 0 ? C.lime : C.pink }}>{a.delta30 >= 0 ? '▲' : '▼'} {Math.abs(a.delta30).toFixed(1)}%</span> : undefined}>
                <div style={{ background: C.card, borderRadius: 10, padding: '12px 14px' }}>
                  {a.growth.length >= 2 ? <Line data={a.growth} color={C.lime} /> : <div className="mono" style={{ fontSize: 11, color: C.faint, padding: '14px 0' }}>мало точек для графика</div>}
                </div>
              </Sec>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <Sec title="Форматы контента">
                  <div style={{ display: 'flex', gap: 14, alignItems: 'center', background: C.card, borderRadius: 10, padding: 14 }}>
                    <Donut segs={[{ value: a.reelsPct, color: C.blue }, { value: a.carouselPct, color: C.lime }, { value: a.photoPct, color: C.pink }]} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {[['Reels', a.reelsPct, C.blue], ['Карусели', a.carouselPct, C.lime], ['Фото', a.photoPct, C.pink]].map(([l, v, c]) => (
                        <div key={l as string} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ width: 9, height: 9, borderRadius: 3, background: c as string }} />
                          <span style={{ fontSize: 12.5, color: C.muted, fontFamily: 'Georgia', flex: 1 }}>{l as string}</span>
                          <span className="mono" style={{ fontSize: 12, color: C.text }}>{v as number}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </Sec>
                <Sec title={`Просмотры · ${a.recentViews.length} Reels`}>
                  <div style={{ background: C.card, borderRadius: 10, padding: '16px 14px' }}>
                    <Bars data={a.recentViews} color={C.blue} />
                    <div className="mono" style={{ fontSize: 9.5, color: C.faint, marginTop: 8 }}>медиана канала: {fmt(median)}</div>
                  </div>
                </Sec>
              </div>
            </>)}

            {/* ВИРАЛЬНОСТЬ */}
            {tab === 'Виральность' && (<>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, marginTop: 22 }}>
                <div style={{ background: C.card, padding: 16, borderRadius: '10px 0 0 10px' }}>
                  <div className="mono" style={{ fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: C.faint, marginBottom: 8 }}>Стабильность канала</div>
                  <div className="mono" style={{ fontSize: 22, fontWeight: 600, color: a.cv < 0.8 ? C.lime : a.cv < 1.2 ? C.blue : C.pink }}>{a.cv}</div>
                  <div style={{ fontSize: 12, color: C.muted, fontFamily: 'Georgia', marginTop: 6 }}>{a.cv < 0.8 ? 'Стабильно выстреливает' : a.cv < 1.2 ? 'Умеренный разброс' : '«Лотерея» — редкие хиты'}</div>
                </div>
                <div style={{ background: C.card, padding: 16, borderRadius: '0 10px 10px 0' }}>
                  <div className="mono" style={{ fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: C.faint, marginBottom: 8 }}>Hit-rate</div>
                  <div className="mono" style={{ fontSize: 22, fontWeight: 600, color: a.hitRate >= 45 ? C.lime : C.muted }}>{a.hitRate}%</div>
                  <div style={{ fontSize: 12, color: C.muted, fontFamily: 'Georgia', marginTop: 6 }}>постов выше медианы канала</div>
                </div>
              </div>
              <Sec title="Распределение постов по Xn">
                <div style={{ background: C.card, borderRadius: 10, padding: 16 }}>
                  {a.xnDist.map((d, i) => <HBar key={i} label={d.label} value={d.v} max={Math.max(...a.xnDist.map((x) => x.v), 1)} suffix="%" color={i >= 3 ? C.lime : i >= 1 ? C.blue : C.faint} />)}
                </div>
              </Sec>
              <Sec title="Топ виральные · Xn = просмотры ÷ медиана" right={<span className="mono" style={{ fontSize: 11, color: C.muted }}>медиана {fmt(median)}</span>}>
                {a.topViral.map(({ r, x }, k) => (
                  <a key={r.id} href={r.url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 12, padding: '11px 12px', background: C.card, borderRadius: 9, marginBottom: 2 }}>
                    <span className="mono" style={{ width: 34, height: 30, borderRadius: 7, background: x >= 2 ? C.lime : '#1c1c1c', color: x >= 2 ? '#0a0a0a' : C.text, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{x.toFixed(1)}x</span>
                    <span style={{ flex: 1, fontSize: 12.5, color: C.muted, fontFamily: 'Georgia', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.caption?.slice(0, 60) || `Reel #${k + 1}`}</span>
                    <span className="mono" style={{ fontSize: 13, color: C.blue, fontWeight: 600 }}>{fmt(r.views)}</span>
                  </a>
                ))}
              </Sec>
            </>)}

            {/* КОНТЕНТ */}
            {tab === 'Контент' && (<>
              {pa ? (
                <>
                  <Sec title="Темы / рубрики, которые заходят" right={<span className="mono" style={{ fontSize: 10, color: C.faint }}>что копировать</span>}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {pa.bestTopics.length ? pa.bestTopics.map((t, i) => (
                        <span key={i} className="mono" style={{ fontSize: 12, color: C.text, background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px' }}>{t}</span>
                      )) : <span className="mono" style={{ fontSize: 11.5, color: C.faint }}>—</span>}
                    </div>
                  </Sec>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <Sec title="Повторяющиеся хуки">
                      <div style={{ background: C.card, borderRadius: 10, padding: 14 }}>
                        {pa.recurringHooks.length ? pa.recurringHooks.map((h, i) => (
                          <div key={i} style={{ display: 'flex', gap: 10, padding: '7px 0', borderBottom: i < pa.recurringHooks.length - 1 ? `1px solid ${C.borderSoft}` : 'none' }}>
                            <span className="mono" style={{ fontSize: 11, color: C.lime, fontWeight: 700 }}>›</span>
                            <span style={{ flex: 1, fontSize: 12, color: C.muted, fontFamily: 'Georgia' }}>{h}</span>
                          </div>
                        )) : <span className="mono" style={{ fontSize: 11.5, color: C.faint }}>—</span>}
                      </div>
                    </Sec>
                    <Sec title="Длина видео → виральность">
                      <div style={{ background: C.card, borderRadius: 10, padding: 16 }}>
                        {a.hasLen ? <>
                          {a.lenBuckets.filter((l) => l.n > 0).map((l, i) => <HBar key={i} label={l.label} value={l.xn} max={Math.max(...a.lenBuckets.map((x) => x.xn), 1)} suffix="x" color={xnColor(l.xn)} sub={`${l.n} рилс.`} />)}
                          <div className="mono" style={{ fontSize: 9.5, color: C.faint, marginTop: 4 }}>оптимум: {[...a.lenBuckets].filter((l) => l.n > 0).sort((x, y) => y.xn - x.xn)[0]?.label ?? '—'}</div>
                        </> : <span className="mono" style={{ fontSize: 11.5, color: C.faint }}>нет данных о длительности</span>}
                      </div>
                    </Sec>
                  </div>
                  {pa.bestFormats.length > 0 && (
                    <Sec title="Лучшие форматы">
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {pa.bestFormats.map((f, i) => <span key={i} className="mono" style={{ fontSize: 11.5, color: C.blue, background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 11px' }}>{f}</span>)}
                      </div>
                    </Sec>
                  )}
                </>
              ) : (
                <div style={{ marginTop: 24, background: C.card, borderRadius: 10, padding: 20, textAlign: 'center' }}>
                  <div style={{ fontSize: 13.5, color: C.muted, fontFamily: 'Georgia', marginBottom: 14 }}>Рубрики и хуки собираются из расшифровок при AI-разборе.</div>
                  <button onClick={() => setTab('AI-разбор')} className="btn-prim mono" style={{ background: 'transparent', border: `1px solid ${C.lime}55`, color: C.lime, borderRadius: 9, padding: '10px 18px', fontSize: 11, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', cursor: 'pointer' }}>Перейти к AI-разбору</button>
                </div>
              )}
            </>)}

            {/* ТАЙМИНГ */}
            {tab === 'Тайминг' && (
              <Sec title="Лучшее время постинга" right={a.hasTiming ? <span className="mono" style={{ fontSize: 11, color: C.lime }}>★ {a.bestWindow}</span> : undefined}>
                <div style={{ background: C.card, borderRadius: 10, padding: 16 }}>
                  {a.hasTiming ? <>
                    <div style={{ display: 'grid', gridTemplateColumns: '44px repeat(7,1fr)', gap: 3 }}>
                      <span />
                      {DAYS.map((d) => <span key={d} className="mono" style={{ fontSize: 9.5, color: C.faint, textAlign: 'center' }}>{d}</span>)}
                      {SLOTS.map((s, si) => (
                        <React.Fragment key={s}>
                          <span className="mono" style={{ fontSize: 9.5, color: C.faint, alignSelf: 'center' }}>{s}</span>
                          {DAYS.map((_, di) => {
                            const v = a.heat[si][di], isBest = a.best.d === di && a.best.s === si;
                            return <span key={di} title={`${DAYS[di]} ${s}`} style={{ height: 26, borderRadius: 5, background: `rgba(96,200,240,${0.12 + v * 0.8})`, border: isBest ? `1.5px solid ${C.lime}` : 'none' }} />;
                          })}
                        </React.Fragment>
                      ))}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14 }}>
                      <span className="mono" style={{ fontSize: 9.5, color: C.faint }}>меньше</span>
                      <div style={{ flex: 1, height: 6, borderRadius: 4, background: 'linear-gradient(90deg, rgba(96,200,240,.12), rgba(96,200,240,.92))' }} />
                      <span className="mono" style={{ fontSize: 9.5, color: C.faint }}>выше виральность</span>
                    </div>
                  </> : <span className="mono" style={{ fontSize: 11.5, color: C.faint }}>нет дат публикаций для тепловой карты</span>}
                  {pa?.cadence?.best_days?.length ? <div className="mono" style={{ fontSize: 10.5, color: C.muted, marginTop: 12 }}>Claude: лучшие дни — {pa.cadence.best_days.join(', ')}</div> : null}
                </div>
              </Sec>
            )}

            {/* AI-РАЗБОР */}
            {tab === 'AI-разбор' && (
              <Sec title="Стратегический разбор от Claude" right={pa ? <span className="mono" style={{ fontSize: 9.5, color: C.faint }}>{pa.model}</span> : undefined}>
                <div style={{ background: C.card, borderRadius: 10, padding: 18 }}>
                  {!pa && !aiLoading && (
                    <div style={{ textAlign: 'center', padding: '10px 0 16px' }}>
                      <p style={{ margin: '0 0 16px', fontSize: 13, color: C.muted, fontFamily: 'Georgia', lineHeight: 1.5 }}>
                        Claude соберёт из метрик готовый план: какие рубрики, хуки, длину и тайминг копировать, чтобы повторить виральность @{author.username} в твоём контенте.
                      </p>
                      <button onClick={runAI} className="btn-prim mono" style={{ background: C.lime, color: '#0a0a0a', border: 'none', borderRadius: 9, padding: '11px 20px', fontSize: 11.5, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', cursor: 'pointer' }}>✦ Сгенерировать разбор</button>
                    </div>
                  )}
                  {aiLoading && <div className="mono" style={{ fontSize: 12, color: C.blue, textAlign: 'center', padding: '20px 0' }}>Claude анализирует аккаунт…</div>}
                  {pa && !aiLoading && (
                    <div>
                      <div style={{ fontSize: 13.5, color: C.text, fontFamily: 'Georgia', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{pa.summary}</div>
                      {pa.recommendations.length > 0 && (
                        <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.borderSoft}` }}>
                          <div className="mono" style={{ fontSize: 9.5, letterSpacing: '.1em', textTransform: 'uppercase', color: C.faint, marginBottom: 10 }}>Что копировать</div>
                          {pa.recommendations.map((rec, i) => (
                            <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 9 }}>
                              <span className="mono" style={{ fontSize: 12, color: C.lime, fontWeight: 700 }}>{i + 1}.</span>
                              <span style={{ flex: 1, fontSize: 13, color: C.text, fontFamily: 'Georgia', lineHeight: 1.5 }}>{rec}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </Sec>
            )}
          </>
        )}

        {/* actions */}
        <div style={{ display: 'flex', gap: 8, marginTop: 26 }}>
          <button onClick={() => onToggleSpy(author.id)} className="btn-prim mono" style={{ flex: 1, padding: '13px 0', borderRadius: 10, cursor: 'pointer', fontSize: 12, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', border: 'none', background: author.isWatching ? 'transparent' : C.pink, color: author.isWatching ? C.pink : '#0a0a0a', outline: author.isWatching ? `1px solid ${C.pink}55` : 'none' }}>
            {author.isWatching ? 'Убрать из наблюдения' : '▶ Взять под наблюдение'}
          </button>
          <button onClick={cloneTopFormat} className="btn-prim mono" style={{ padding: '13px 18px', borderRadius: 10, cursor: 'pointer', fontSize: 12, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', border: `1px solid ${C.lime}55`, background: 'transparent', color: C.lime }}>
            ⎘ Клонировать топ-формат
          </button>
        </div>
        {author.isWatching && <div className="mono" style={{ marginTop: 10, fontSize: 11, color: C.pink, display: 'flex', alignItems: 'center', gap: 7, justifyContent: 'center' }}><span className="live-dot" style={{ width: 6, height: 6, borderRadius: 6, background: C.pink }} />Парсер активен · обновление каждые {author.refreshInterval ?? 24} ч</div>}
      </div>
    </div>
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
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, backdropFilter: 'blur(2px)' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 420, maxWidth: '92vw', background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: 22 }}>
        <div className="mono" style={{ fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: C.muted, marginBottom: 14 }}>Добавить блогера</div>
        <div style={{ position: 'relative', marginBottom: 14 }}>
          <span style={{ position: 'absolute', left: 13, top: 12, color: C.faint, fontSize: 14 }}>@</span>
          <input autoFocus value={username} onChange={(e) => setUsername(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} placeholder="instagram username" className="mono" style={{ background: C.card, border: `1px solid ${C.border}`, color: C.text, borderRadius: 10, padding: '11px 14px 11px 28px', width: '100%', fontSize: 13, outline: 'none' }} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} className="mono" style={{ flex: 1, padding: '11px 0', borderRadius: 9, background: 'transparent', border: `1px solid ${C.border}`, color: C.muted, fontSize: 11.5, cursor: 'pointer', textTransform: 'uppercase' }}>Отмена</button>
          <button onClick={submit} disabled={busy} className="btn-prim mono" style={{ flex: 1, padding: '11px 0', borderRadius: 9, background: C.lime, border: 'none', color: '#0a0a0a', fontSize: 11.5, fontWeight: 700, cursor: busy ? 'wait' : 'pointer', textTransform: 'uppercase', opacity: busy ? 0.6 : 1 }}>{busy ? 'Парсим…' : 'Добавить'}</button>
        </div>
        <div className="mono" style={{ fontSize: 10, color: C.faint, marginTop: 12, lineHeight: 1.5 }}>Первичный парс собирает последние рилсы и считает медиану. Списываются кредиты за скрейп.</div>
      </div>
    </div>
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
    <div key={b.id} className="card-b" onClick={() => setSelected(b.id)} style={{ background: C.card, border: `1px solid ${b.isWatching ? C.pink + '44' : C.border}`, borderRadius: 14, padding: 16, cursor: 'pointer', position: 'relative' }}>
      {b.isWatching && <div className="mono" style={{ position: 'absolute', top: 12, right: 12, display: 'flex', alignItems: 'center', gap: 6, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: C.pink }}><span className="live-dot" style={{ width: 6, height: 6, borderRadius: 6, background: C.pink, display: 'inline-block' }} />Парсинг</div>}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
        <Avatar src={igProxy(b.avatarUrl)} name={b.username} seed={i} size={48} />
        <div style={{ minWidth: 0 }}>
          <div className="mono" style={{ fontSize: 14, fontWeight: 600, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>@{b.username}</div>
          <div style={{ fontSize: 12, color: C.muted, display: 'flex', gap: 7, alignItems: 'center', marginTop: 2 }}>
            <span className="mono" style={{ fontSize: 9, padding: '2px 6px', borderRadius: 5, border: `1px solid ${C.border}`, color: C.faint }}>IG</span>{b.niche || 'без ниши'}
          </div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, paddingTop: 14, borderTop: `1px solid ${C.borderSoft}` }}>
        <Stat label="Подписч." value={fmt(b.followers)} />
        <Stat label="Медиана" value={fmt(b.medianViews)} color={C.blue} />
        <Stat label="Вовлеч." value={b.engagementAvg.toFixed(1) + '%'} color={erColor(b.engagementAvg)} />
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
        <button onClick={(e) => { e.stopPropagation(); setSelected(b.id); }} className="spy-add mono" style={{ flex: 1, padding: '9px 0', borderRadius: 9, cursor: 'pointer', fontSize: 11, letterSpacing: '.04em', textTransform: 'uppercase', background: 'transparent', border: `1px solid ${C.border}`, color: C.muted }}>Анализ</button>
        <button onClick={(e) => { e.stopPropagation(); toggleSpy(b.id); }} className="spy-add mono" style={{ flex: 1, padding: '9px 0', borderRadius: 9, cursor: 'pointer', fontSize: 11, letterSpacing: '.04em', textTransform: 'uppercase', background: b.isWatching ? C.pink + '14' : 'transparent', border: `1px solid ${b.isWatching ? C.pink + '55' : C.border}`, color: b.isWatching ? C.pink : C.muted }}>{b.isWatching ? '✓ Шпион' : '+ Шпион'}</button>
      </div>
    </div>
  );

  return (
    <div style={{ color: C.text, fontFamily: 'Georgia, serif' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap');
        .ps-bloggers .mono{font-family:'JetBrains Mono',monospace;}
        .ps-scroll::-webkit-scrollbar{width:8px;} .ps-scroll::-webkit-scrollbar-thumb{background:#2a2a2a;border-radius:8px;}
        .card-b{transition:background .15s,border-color .15s;} .card-b:hover{background:${C.cardHover};border-color:#2c2c2c;}
        .chip{transition:all .15s;} .chip:hover{border-color:#3a3a3a;color:${C.text};}
        .fld:hover{background:#141414;}
        .btn-prim{transition:filter .15s,transform .1s;} .btn-prim:hover{filter:brightness(1.08);} .btn-prim:active{transform:translateY(1px);}
        .spy-add{transition:all .15s;} .spy-add:hover{background:${C.pink}1a;border-color:${C.pink};color:${C.pink};}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.25}} .live-dot{animation:pulse 1.6s ease-in-out infinite;}
        @media(prefers-reduced-motion: reduce){.live-dot{animation:none;}}
        @media(max-width:920px){.ps-side{display:none !important;} .ps-grid{grid-template-columns:1fr !important;} .ps-main{grid-template-columns:1fr !important;}}
      `}</style>

      <div className="ps-bloggers">
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap', marginBottom: 26 }}>
          <div>
            <div className="mono" style={{ fontSize: 10, letterSpacing: '.22em', color: C.faint, textTransform: 'uppercase', marginBottom: 8 }}>Persona Studio · Разведка</div>
            <h1 style={{ margin: 0, fontSize: 42, fontWeight: 400, letterSpacing: '-.01em', lineHeight: 1 }}>Блогеры</h1>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && runSearch()} placeholder="Ниша, тема или @username" className="mono" style={{ background: C.card, border: `1px solid ${C.border}`, color: C.text, borderRadius: 10, padding: '11px 14px 11px 36px', width: 300, fontSize: 13, outline: 'none' }} />
              <span style={{ position: 'absolute', left: 13, top: 11, color: C.faint, fontSize: 14 }}>⌕</span>
            </div>
            <button onClick={runSearch} disabled={searching} className="btn-prim mono" style={{ background: C.blue, color: '#0a0a0a', border: 'none', borderRadius: 10, padding: '11px 20px', fontSize: 12, fontWeight: 700, letterSpacing: '.04em', cursor: searching ? 'wait' : 'pointer', textTransform: 'uppercase', opacity: searching ? 0.6 : 1 }}>{searching ? 'Ищем…' : 'Поиск'}</button>
            <button onClick={() => setShowAdd(true)} className="btn-prim mono" style={{ background: C.lime, color: '#0a0a0a', border: 'none', borderRadius: 10, padding: '11px 18px', fontSize: 12, fontWeight: 700, letterSpacing: '.04em', cursor: 'pointer', textTransform: 'uppercase' }}>+ Добавить блогера</button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 22 }}>
          {SORTS.map((s) => <button key={s.id} onClick={() => setSort(s.id)} className="chip mono" style={{ background: sort === s.id ? '#171717' : 'transparent', border: `1px solid ${sort === s.id ? '#333' : C.border}`, color: sort === s.id ? C.text : C.muted, borderRadius: 9, padding: '8px 13px', fontSize: 11.5, cursor: 'pointer' }}>{s.label}</button>)}
          <div style={{ width: 1, height: 22, background: C.border, margin: '0 4px' }} />
          {[{ v: 0, l: 'Все' }, { v: 1e6, l: '1M+' }, { v: 25e6, l: '25M+' }, { v: 50e6, l: '50M+' }].map((o) => <button key={o.v} onClick={() => setSizeMin(o.v)} className="chip mono" style={{ background: sizeMin === o.v ? '#171717' : 'transparent', border: `1px solid ${sizeMin === o.v ? '#333' : C.border}`, color: sizeMin === o.v ? C.text : C.muted, borderRadius: 9, padding: '8px 13px', fontSize: 11.5, cursor: 'pointer' }}>{o.l}</button>)}
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 18 }}>
          <span className="mono" style={{ fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: C.faint }}>{feed ? 'Лента поиска' : 'Найдено'}</span>
          {feed ? (
            <>
              <span style={{ font: '400 34px/1 Georgia, serif', color: C.text }}>{searching ? '—' : feed.length}</span>
              <span className="mono" style={{ fontSize: 11.5, color: C.muted }}>медиа · {topBloggers.length} блогеров</span>
              <button onClick={clearSearch} className="mono" style={{ background: 'transparent', border: 'none', color: C.pink, fontSize: 11.5, cursor: 'pointer' }}>✕ Сбросить</button>
            </>
          ) : (
            <>
              <span style={{ font: '400 34px/1 Georgia, serif', color: C.text }}>{loading ? '—' : list.length}</span>
              {folder && <button onClick={() => setFolder(null)} className="mono" style={{ background: 'transparent', border: 'none', color: C.pink, fontSize: 11.5, cursor: 'pointer' }}>✕ {activeFolderName}</button>}
            </>
          )}
        </div>

        <div className="ps-main" style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 22, alignItems: 'start' }}>
          {feed ? (
            <div style={{ display: 'grid', gap: 26 }}>
              {/* Топ блогеров ниши — главный результат поиска */}
              <div>
                <div className="mono" style={{ fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: C.faint, marginBottom: 12 }}>Топ блогеров ниши · {searching ? '…' : topBloggers.length}</div>
                {searching ? (
                  <div className="ps-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: 12 }}>
                    {Array.from({ length: 4 }).map((_, i) => <div key={i} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, height: 168 }} />)}
                  </div>
                ) : topBloggers.length ? (
                  <div className="ps-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: 12 }}>
                    {topBloggers.map((b, i) => renderBloggerCard(b, i))}
                  </div>
                ) : (
                  <div style={{ padding: '40px 0', textAlign: 'center', color: C.muted }}>
                    {searchNote === 'scraper' ? (
                      <>
                        <div style={{ fontSize: 15 }}>Поиск временно недоступен</div>
                        <div className="mono" style={{ fontSize: 12, color: C.faint, marginTop: 6 }}>Парсер исчерпал месячный лимит или недоступен. Попробуйте позже</div>
                      </>
                    ) : (
                      <>
                        <div style={{ fontSize: 15 }}>Ничего не нашли</div>
                        <div className="mono" style={{ fontSize: 12, color: C.faint, marginTop: 6 }}>Попробуй другой запрос</div>
                      </>
                    )}
                  </div>
                )}
              </div>
              {/* Медиа — обложки рилсов (доказательная база ниши) */}
              {(searching || feed.length > 0) && (
                <div>
                  <div className="mono" style={{ fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: C.faint, marginBottom: 12 }}>Медиа · {searching ? '…' : feed.length} обложек</div>
                  {searching ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px,1fr))', gap: 10 }}>
                      {Array.from({ length: 8 }).map((_, i) => <div key={i} style={{ aspectRatio: '4 / 5', borderRadius: 12, background: '#161616' }} />)}
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px,1fr))', gap: 10 }}>
                      {feed.map((r) => <ReelCover key={r.id} reel={r} />)}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="ps-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: 12 }}>
              {loading && Array.from({ length: 6 }).map((_, i) => (
                <div key={i} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, height: 168 }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#1a1a1a' }} />
                    <div style={{ flex: 1 }}><div style={{ height: 12, width: '60%', background: '#1a1a1a', borderRadius: 4, marginBottom: 8 }} /><div style={{ height: 10, width: '40%', background: '#161616', borderRadius: 4 }} /></div>
                  </div>
                </div>
              ))}
              {!loading && list.map((b, i) => renderBloggerCard(b, i))}
              {!loading && list.length === 0 && <div style={{ gridColumn: '1 / -1', padding: '60px 0', textAlign: 'center', color: C.muted }}><div style={{ fontSize: 16, marginBottom: 6 }}>Никого не нашли</div><div className="mono" style={{ fontSize: 12, color: C.faint }}>Введите нишу и нажмите «Поиск», либо добавьте блогера через «+ Добавить блогера»</div></div>}
            </div>
          )}

          <aside className="ps-side" style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, position: 'sticky', top: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <span className="mono" style={{ fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: C.muted }}>Папки</span>
              <span className="mono" style={{ fontSize: 11, color: C.faint }}>{folders.length + 1}</span>
            </div>
            <button onClick={addFolder} className="btn-prim mono" style={{ width: '100%', background: 'transparent', border: `1px dashed ${C.lime}55`, color: C.lime, borderRadius: 9, padding: '9px 0', fontSize: 11, letterSpacing: '.05em', textTransform: 'uppercase', cursor: 'pointer', marginBottom: 12 }}>+ Добавить папку</button>

            {/* Шпион = watchlist */}
            <button onClick={() => setFolder(folder === 'spy' ? null : 'spy')} className="fld" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 10px', background: folder === 'spy' ? '#161616' : 'transparent', border: 'none', borderRadius: 9, cursor: 'pointer', textAlign: 'left', marginBottom: 2, borderLeft: `2px solid ${folder === 'spy' ? C.pink : 'transparent'}` }}>
              <span className="live-dot" style={{ width: 7, height: 7, borderRadius: 7, background: C.pink, flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 13.5, color: C.text, fontFamily: 'Georgia' }}>Шпион</span>
              <span className="mono" style={{ fontSize: 11, color: C.pink, fontWeight: 600 }}>{spyCount}</span>
            </button>

            {folders.map((f) => {
              const active = folder === f.id;
              return (
                <button key={f.id} onClick={() => setFolder(active ? null : f.id)} className="fld" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 10px', background: active ? '#161616' : 'transparent', border: 'none', borderRadius: 9, cursor: 'pointer', textAlign: 'left', marginBottom: 2, borderLeft: `2px solid ${active ? C.muted : 'transparent'}` }}>
                  <span style={{ width: 7, height: 7, borderRadius: 2, background: C.muted, opacity: 0.6, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 13.5, color: active ? C.text : C.muted, fontFamily: 'Georgia' }}>{f.name}</span>
                  <span className="mono" style={{ fontSize: 11, color: C.faint, fontWeight: 600 }}>{f._count.items}</span>
                </button>
              );
            })}

            <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.borderSoft}` }}>
              <div className="mono" style={{ fontSize: 9.5, letterSpacing: '.1em', textTransform: 'uppercase', color: C.faint, marginBottom: 8 }}>Папка «Шпион»</div>
              <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: C.muted, fontFamily: 'Georgia' }}>Блогеры здесь под наблюдением: парсер забирает Reels, считает виральность по медиане и шлёт алёрты на всплески.</p>
            </div>
          </aside>
        </div>
      </div>

      {detail && <Analysis author={detail} seed={detailSeed} onClose={() => setSelected(null)} onToggleSpy={toggleSpy} onToast={showToast} />}
      {showAdd && <AddModal onClose={() => setShowAdd(false)} onAdded={loadAuthors} onToast={showToast} />}

      {toast && (
        <div className="mono" style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: C.panel, border: `1px solid ${C.border}`, color: C.text, borderRadius: 10, padding: '12px 18px', fontSize: 12, zIndex: 80, boxShadow: '0 8px 30px rgba(0,0,0,.5)' }}>{toast}</div>
      )}
    </div>
  );
}
