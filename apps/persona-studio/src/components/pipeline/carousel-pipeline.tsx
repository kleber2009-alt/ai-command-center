'use client';

// CAROUSEL branch wizard (skill ilia-carousel-style — remix, not redraw):
// Источник → Ремикс → Стиль → Рендер → Публикация.
// The original slides stay pixel-for-pixel; the cover/hook, slide order and
// the CTA code word change. Data: GET/PATCH /api/pipelines/:id/carousel,
// POST …/carousel/remix, POST …/carousel/render; publishing goes through the
// branch's POST /api/pipelines/:id/schedule (links scheduledPostId).

import { useCallback, useEffect, useMemo, useState, type DragEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Check,
  Download,
  ExternalLink,
  GripVertical,
  Heart,
  Instagram,
  Loader2,
  MessageCircle,
  Plus,
  RefreshCw,
  Repeat2,
  Save,
  Send,
  Trash2,
  Wand2,
  X,
} from 'lucide-react';
import { PageHero } from '@/components/shell/page-hero';
import { Icon3D, type Icon3DName } from '@/components/ui/icon3d';
import { igProxy } from '@/components/research/types';
import { errorText, exceptionText, jobErrorText } from '@/lib/error-text';
import { STAGE_LABEL, type PipelineView } from '@/lib/pipeline/types';
import { CAROUSEL_STYLES } from '@/lib/carousel/styles';
import {
  IG_CAROUSEL_MAX,
  ORIGINAL_LOOK,
  normalizeCodeWord,
  swapCtaWord,
  type RemixHook,
  type RemixSlide,
  type TextPos,
  type Veil,
} from '@/lib/carousel/remix';
import type { CarouselView } from '@/lib/carousel/remix-server';

type Step = 'source' | 'remix' | 'style' | 'render' | 'publish';
const STEPS: { key: Step; label: string; icon: Icon3DName }[] = [
  { key: 'source', label: 'Источник', icon: 'media' },
  { key: 'remix', label: 'Ремикс', icon: 'magic' },
  { key: 'style', label: 'Стиль', icon: 'covers' },
  { key: 'render', label: 'Рендер', icon: 'carousel' },
  { key: 'publish', label: 'Публикация', icon: 'schedule' },
];

type Account = { id: string; platform: string; displayName: string; status: string };

const POS_LABEL: Record<TextPos, string> = { top: 'сверху', center: 'по центру', bottom: 'снизу' };
const VEIL_LABEL: Record<Veil, string> = { blur: 'размытие', dark: 'затемнение', solid: 'тёмный фон' };
const KIND_LABEL = { winner: 'победитель', strongBody: 'сильная начинка, слабый хук', regular: 'обычный пост' } as const;

const fmt = (n: number) => (n >= 10_000 ? `${Math.round(n / 1000)}K` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n));

function defaultWhen(): string {
  const d = new Date(Date.now() + 60 * 60_000);
  d.setMinutes(0, 0, 0);
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function PlatformIcon({ platform }: { platform: string }) {
  return platform === 'instagram' ? <Instagram size={13} /> : <Send size={13} />;
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: Array<[T, string]>; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1 rounded-full border border-border-soft bg-white/[0.04] p-1">
      {options.map(([v, l]) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={`rounded-full px-3 py-1 text-[12.5px] transition-colors ${value === v ? 'bg-blue font-semibold text-white' : 'text-text-dim hover:text-text'}`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

function Thumb({ src, className = '' }: { src: string | undefined; className?: string }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={igProxy(src)} alt="" referrerPolicy="no-referrer" loading="lazy" className={`aspect-[4/5] w-full rounded-xl object-cover ${className}`} />
  ) : (
    <div className={`aspect-[4/5] w-full rounded-xl bg-white/[0.05] ${className}`} />
  );
}

function initialStep(p: PipelineView, v: CarouselView | null): Step {
  if (p.post || p.stage === 'scheduled' || p.stage === 'published') return 'publish';
  if (!v?.draft) return 'source';
  if (v.draft.imageUrls.length > 0) return p.stage === 'ready' ? 'publish' : 'render';
  return 'remix';
}

export function CarouselPipeline({ pipeline }: { pipeline: PipelineView }) {
  const router = useRouter();
  const [p, setP] = useState<PipelineView>(pipeline);
  const [view, setView] = useState<CarouselView | null>(null);
  const [step, setStep] = useState<Step>('source');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [remixCost, setRemixCost] = useState<number | null>(null);

  // editable remix state (saved with PATCH)
  const [slides, setSlides] = useState<RemixSlide[]>([]);
  const [hooks, setHooks] = useState<RemixHook[]>([]);
  const [hookChoice, setHookChoice] = useState<'A' | 'B'>('A');
  const [codeWord, setCodeWord] = useState('');
  const [caption, setCaption] = useState('');
  const [look, setLook] = useState<string>(ORIGINAL_LOOK);
  const [dirty, setDirty] = useState(false);
  const [dragFrom, setDragFrom] = useState<number | null>(null);

  // publish
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountIds, setAccountIds] = useState<string[]>([]);
  const [when, setWhen] = useState(defaultWhen());

  const apply = useCallback((v: CarouselView) => {
    setView(v);
    const d = v.draft;
    if (d?.remix) {
      setSlides(d.slides);
      setHooks(d.remix.hooks);
      setHookChoice(d.remix.hookChoice);
      setCodeWord(d.remix.codeWord);
      setCaption(d.remix.caption);
      setLook(d.remix.look || ORIGINAL_LOOK);
      setDirty(false);
    }
  }, []);

  const call = useCallback(async (key: string, url: string, init?: { method?: string; body?: unknown }) => {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(url, {
        method: init?.method ?? (init?.body !== undefined ? 'POST' : 'GET'),
        headers: init?.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
        body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
        cache: 'no-store',
      });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        setError(errorText(json as { error?: string; message?: string }, res.status));
        return null;
      }
      return json;
    } catch (e) {
      setError(exceptionText(e));
      return null;
    } finally {
      setBusy(null);
    }
  }, []);

  const refreshPipeline = useCallback(async () => {
    const res = await fetch(`/api/pipelines/${p.id}`, { cache: 'no-store' }).catch(() => null);
    if (res?.ok) {
      const j = (await res.json()) as { pipeline: PipelineView; costs?: { script?: number } };
      setP(j.pipeline);
      if (j.costs?.script != null) setRemixCost(j.costs.script);
    }
  }, [p.id]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [cv, acc] = await Promise.all([
        fetch(`/api/pipelines/${pipeline.id}/carousel`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : r.json().then((j) => Promise.reject(j)))),
        fetch('/api/schedule/accounts', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : { accounts: [] })).catch(() => ({ accounts: [] })),
      ]).catch((e) => {
        if (alive) setError(errorText(e as { error?: string }));
        return [null, { accounts: [] }] as const;
      });
      if (!alive) return;
      if (cv) {
        apply(cv as CarouselView);
        setStep(initialStep(pipeline, cv as CarouselView));
      }
      const usable = ((acc as { accounts: Account[] }).accounts ?? []).filter(
        (a) => a.status === 'active' && (a.platform === 'telegram' || a.platform === 'instagram'),
      );
      setAccounts(usable);
      setAccountIds(usable.map((a) => a.id));
      setLoading(false);
    })();
    refreshPipeline();
    return () => {
      alive = false;
    };
  }, [pipeline, apply, refreshPipeline]);

  // While a post is going out, follow its status.
  useEffect(() => {
    if (!p.post || !['scheduled', 'publishing'].includes(p.post.status)) return;
    const t = setInterval(refreshPipeline, 8000);
    return () => clearInterval(t);
  }, [p.post, refreshPipeline]);

  const src = view?.source ?? null;
  const draft = view?.draft ?? null;
  const meta = draft?.remix ?? null;
  const sourceImages = draft?.sourceImages ?? src?.slideImages ?? [];
  const rendered = draft?.imageUrls ?? [];
  const postLocked = !!p.post && ['scheduled', 'publishing', 'published', 'partial'].includes(p.post.status);
  const stepIdx = STEPS.findIndex((s) => s.key === step);
  // steps before `reached` count as done; with a draft every step up to Рендер is open
  const reached = !draft ? 0 : rendered.length ? 4 : 2;
  const igSelected = accounts.some((a) => a.platform === 'instagram' && accountIds.includes(a.id));

  const cover = slides.find((s) => s.role === 'cover');
  const cta = slides.find((s) => s.role === 'cta');
  const usedSrc = new Set(slides.map((s) => s.src));
  const removed = sourceImages.map((_, i) => i).filter((i) => !usedSrc.has(i));

  const stageBadge = useMemo(() => {
    const cls =
      p.stage === 'error' ? 'status-failed' : p.stage === 'published' || p.stage === 'ready' ? 'status-ready' : p.stage === 'scheduled' ? 'status-scheduled' : 'status-queued';
    const label = p.stage === 'script' ? 'Ремикс' : STAGE_LABEL[p.stage] ?? p.stage;
    return <span className={`status-badge ${cls}`}>{label}</span>;
  }, [p.stage]);

  // ── edits ──────────────────────────────────────────────────────────
  const edit = (fn: () => void) => {
    fn();
    setDirty(true);
  };
  const patchSlide = (role: 'cover' | 'cta', patch: Partial<RemixSlide>) =>
    edit(() => setSlides((cur) => cur.map((s) => (s.role === role ? { ...s, ...patch } : s))));
  const editHook = (id: 'A' | 'B', patch: Partial<RemixHook>) =>
    edit(() => {
      setHooks((cur) => cur.map((h) => (h.id === id ? { ...h, ...patch } : h)));
      if (id === hookChoice) {
        setSlides((cur) =>
          cur.map((s) =>
            s.role === 'cover' ? { ...s, ...(patch.title !== undefined ? { title: patch.title } : {}), ...(patch.sub !== undefined ? { body: patch.sub } : {}) } : s,
          ),
        );
      }
    });
  const chooseHook = (id: 'A' | 'B') =>
    edit(() => {
      setHookChoice(id);
      const h = hooks.find((x) => x.id === id);
      if (h) setSlides((cur) => cur.map((s) => (s.role === 'cover' ? { ...s, title: h.title, body: h.sub } : s)));
    });
  const changeWord = (raw: string) =>
    edit(() => {
      const next = normalizeCodeWord(raw);
      setSlides((cur) => cur.map((s) => (s.role === 'cta' && next ? { ...s, title: swapCtaWord(s.title, codeWord, next) } : s)));
      setCaption((c) => (next && codeWord ? c.split(`«${codeWord}»`).join(`«${next}»`) : c));
      setCodeWord(next || raw.toUpperCase());
    });
  const move = (from: number, to: number) =>
    edit(() =>
      setSlides((cur) => {
        if (to <= 0 || to >= cur.length - 1 || from <= 0 || from >= cur.length - 1) return cur;
        const next = [...cur];
        const [x] = next.splice(from, 1);
        next.splice(to, 0, x);
        return next;
      }),
    );
  const removeAt = (i: number) => edit(() => setSlides((cur) => cur.filter((_, k) => k !== i)));
  const restore = (srcIdx: number) =>
    edit(() => setSlides((cur) => [...cur.slice(0, -1), { role: 'keep', src: srcIdx, title: '', body: '' }, cur[cur.length - 1]]));

  const onDrop = (e: DragEvent, to: number) => {
    e.preventDefault();
    if (dragFrom != null && dragFrom !== to) move(dragFrom, to);
    setDragFrom(null);
  };

  // ── server actions ─────────────────────────────────────────────────
  async function makeRemix(regenerate = false) {
    if (regenerate && !window.confirm('Придумать ремикс заново? Твои правки хуков и порядка пропадут.')) return;
    const j = await call(regenerate ? 'regen' : 'remix', `/api/pipelines/${p.id}/carousel/remix`, { body: { regenerate } });
    if (j) {
      apply(j as unknown as CarouselView);
      setStep('remix');
      refreshPipeline();
    }
  }
  async function save(): Promise<boolean> {
    if (!dirty) return true;
    const j = await call('save', `/api/pipelines/${p.id}/carousel`, {
      method: 'PATCH',
      body: { slides, hooks, hookChoice, codeWord, caption, look },
    });
    if (j) {
      apply(j as unknown as CarouselView);
      refreshPipeline();
      return true;
    }
    return false;
  }
  async function render() {
    if (!(await save())) return;
    const j = await call('render', `/api/pipelines/${p.id}/carousel/render`, { body: {} });
    if (j) {
      apply(j as unknown as CarouselView);
      refreshPipeline();
    }
  }
  async function publish(now: boolean) {
    if (!(await save())) return;
    const body = now
      ? { accountIds, caption: caption || undefined, now: true }
      : { accountIds, caption: caption || undefined, scheduledAt: new Date(when).toISOString() };
    const j = await call(now ? 'now' : 'schedule', `/api/pipelines/${p.id}/schedule`, { body });
    if (j?.pipeline) setP(j.pipeline as PipelineView);
  }
  async function removeBranch() {
    if (!window.confirm('Удалить ветку? Оригинальный пост в «Моём блоге» останется.')) return;
    const j = await call('delete', `/api/pipelines/${p.id}`, { method: 'DELETE' });
    if (j) router.push('/pipeline');
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-10 text-[14px] text-text-dim">
        <Loader2 size={16} className="animate-spin" /> Загружаем ветку…
      </div>
    );
  }

  return (
    <div className="grid max-w-5xl gap-5">
      <div className="flex items-center justify-between gap-2">
        <Link href="/pipeline" className="btn-ghost !px-4 !py-2 text-[13px]">
          <ArrowLeft size={14} /> Мои ветки
        </Link>
        <button type="button" onClick={removeBranch} disabled={busy === 'delete'} className="btn-ghost !px-4 !py-2 text-[13px] hover:!border-danger/60 hover:!text-danger">
          {busy === 'delete' ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Удалить ветку
        </button>
      </div>

      <PageHero
        eyebrow={`ветка · карусель${src?.owner ? ` · @${src.owner}` : ''}`}
        title={p.title || 'Ремикс карусели'}
        icon="carousel"
        description="Не рисуем с нуля: слайды оригинала остаются пиксель в пиксель, меняем обложку и хук, порядок и кодовое слово."
        extra={<div className="flex flex-wrap items-center gap-3">{stageBadge}</div>}
      />

      <nav aria-label="Шаги ветки" className="panel !rounded-2xl p-2">
        <ol className="grid grid-cols-3 gap-1 sm:grid-cols-5">
          {STEPS.map((st, i) => {
            const done = i < reached || (i === 4 && p.stage === 'published');
            const active = st.key === step;
            const open = i <= reached || (i <= 3 && !!draft);
            return (
              <li key={st.key}>
                <button
                  type="button"
                  disabled={!open}
                  onClick={() => setStep(st.key)}
                  aria-current={active ? 'step' : undefined}
                  className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-[12px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                    active ? 'bg-blue text-white' : done ? 'text-lime hover:bg-white/[0.05]' : 'text-text-dim hover:bg-white/[0.05]'
                  }`}
                >
                  <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-semibold tabular-nums ${active ? 'bg-white/20' : done ? 'bg-lime/15' : 'bg-white/[0.06]'}`}>
                    {done && !active ? <Check size={11} strokeWidth={3} /> : i + 1}
                  </span>
                  <span className="truncate">{st.label}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {error && (
        <div role="alert" className="panel flex flex-wrap items-center gap-2 !rounded-2xl !border-danger/40 p-4 text-[13px] text-danger">
          <AlertTriangle size={15} /> <span className="flex-1">{error}</span>
          {/Недостаточно токенов/.test(error) && (
            <Link href="/billing" className="btn-primary !px-3.5 !py-1.5 text-[13px]">
              Пополнить
            </Link>
          )}
        </div>
      )}
      {p.stage === 'error' && p.errorMsg && !error && (
        <div role="alert" className="panel flex items-center gap-2 !rounded-2xl !border-danger/40 p-4 text-[13px] text-danger">
          <AlertTriangle size={15} /> {p.errorMsg}
        </div>
      )}

      {/* ── 1. Источник ─────────────────────────────────────────────── */}
      {step === 'source' && (
        <section className="panel grid gap-5 p-5 sm:p-6 reveal">
          <h2 className="flex items-center gap-3">
            <span className="sec-num">/01</span>
            <span className="sec-title">Исходная карусель</span>
          </h2>
          {!src ? (
            <p className="text-[14px] text-text-dim">У ветки нет исходного поста — создайте её из «Моего блога».</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 text-[13px]">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.05] px-3 py-1 tabular-nums text-text">
                  <MessageCircle size={13} className="text-text-mute" /> {fmt(src.comments)} комм.
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.05] px-3 py-1 tabular-nums text-text">
                  <Repeat2 size={13} className="text-text-mute" /> {fmt(src.shares)} репостов
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.05] px-3 py-1 tabular-nums text-text">
                  <Heart size={13} className="text-text-mute" /> {src.likes > 0 ? fmt(src.likes) : 'лайки скрыты'}
                </span>
                {src.rank && (
                  <span className="rounded-full bg-gold/15 px-3 py-1 font-semibold tabular-nums text-gold">×{src.rank.score.toFixed(1)} к медиане</span>
                )}
                {src.rank && (
                  <span className="rounded-full bg-white/[0.05] px-3 py-1 text-text-dim">
                    {KIND_LABEL[src.rank.winner ? 'winner' : src.rank.strongBody ? 'strongBody' : 'regular']}
                  </span>
                )}
                {src.ageDays != null && <span className="text-text-mute">вышел {Math.round(src.ageDays)} дн. назад</span>}
                <a href={src.url} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1 text-text-dim hover:text-gold">
                  оригинал <ExternalLink size={12} />
                </a>
              </div>
              {src.cooldown && (
                <p className="flex items-start gap-2 rounded-2xl border border-amber/35 bg-amber/[0.07] px-4 py-3 text-[13px] text-amber">
                  <CalendarClock size={15} className="mt-0.5 shrink-0" />
                  Рано перевыкладывать: оригиналу меньше 14 дней. Ремикс можно подготовить сейчас, а запланировать — через 2–3 недели после оригинала.
                </p>
              )}
              <div className="flex gap-2.5 overflow-x-auto pb-2">
                {src.slideImages.map((u, i) => (
                  <div key={u + i} className="w-[124px] shrink-0">
                    <Thumb src={u} />
                    <div className="mt-1 text-center text-[11px] tabular-nums text-text-mute">
                      {i === 0 ? 'обложка' : i === src.slideImages.length - 1 ? 'CTA' : `слайд ${i + 1}`}
                    </div>
                  </div>
                ))}
              </div>
              {src.caption && (
                <details className="rounded-2xl bg-white/[0.03] px-4 py-3 text-[13px] text-text-dim">
                  <summary className="cursor-pointer text-text">Подпись оригинала{src.oldCodeWord ? ` · кодовое слово «${src.oldCodeWord}»` : ''}</summary>
                  <p className="mt-2 whitespace-pre-line leading-relaxed">{src.caption}</p>
                </details>
              )}
              <div className="flex flex-wrap items-center gap-3">
                {draft ? (
                  <button type="button" onClick={() => setStep('remix')} className="btn-primary">
                    К ремиксу <ArrowRight size={15} />
                  </button>
                ) : (
                  <button type="button" onClick={() => makeRemix(false)} disabled={!!busy || src.slideImages.length < 2} className="btn-primary">
                    {busy === 'remix' ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}
                    {busy === 'remix' ? 'Придумываю хуки…' : 'Сделать ремикс'}
                  </button>
                )}
                {!draft && remixCost != null && remixCost > 0 && (
                  <span className="flex items-center gap-1.5 text-[13px] text-text-mute">
                    <Icon3D name="coin" size={15} /> {remixCost} кр — хуки A/B, кодовое слово и подпись
                  </span>
                )}
                {src.slideImages.length < 2 && <span className="text-[13px] text-danger">Нет слайдов — обновите блог из Instagram.</span>}
              </div>
            </>
          )}
        </section>
      )}

      {/* ── 2. Ремикс ───────────────────────────────────────────────── */}
      {step === 'remix' && draft && meta && (
        <section className="grid gap-5 reveal">
          <div className="panel grid gap-3 p-5 sm:p-6">
            <h2 className="flex items-center gap-3">
              <span className="sec-num">/02</span>
              <span className="sec-title">Хук обложки — A или B</span>
            </h2>
            <p className="text-[13px] leading-relaxed text-text-dim">
              {meta.rationale} <span className="text-text-mute">Проверяем: {meta.test}</span>
              {meta.provider === 'fallback' && <span className="text-amber"> Шаблонный вариант — ИИ не ответил, отредактируй вручную.</span>}
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              {hooks.map((h) => {
                const on = h.id === hookChoice;
                return (
                  <div key={h.id} className={`grid gap-2.5 rounded-2xl border p-4 transition-colors ${on ? 'border-gold bg-blue/[0.08]' : 'border-border-soft bg-white/[0.03]'}`}>
                    <button type="button" onClick={() => chooseHook(h.id)} className="flex items-center gap-2 text-left text-[13px] font-semibold text-text">
                      <span className={`grid h-6 w-6 place-items-center rounded-full text-[12px] ${on ? 'bg-gold text-white' : 'bg-white/[0.08] text-text-dim'}`}>{h.id}</span>
                      {on ? 'на обложке' : 'выбрать этот хук'}
                    </button>
                    <input className="input" value={h.title} maxLength={160} onChange={(e) => editHook(h.id, { title: e.target.value })} aria-label={`Хук ${h.id}`} />
                    <input className="input text-[13px]" value={h.sub} maxLength={200} onChange={(e) => editHook(h.id, { sub: e.target.value })} aria-label={`Подзаголовок ${h.id}`} />
                    {h.why && <p className="text-[12px] text-text-mute">{h.why}</p>}
                  </div>
                );
              })}
            </div>
            <p className="text-[12px] text-text-mute">*слово в звёздочках* — оранжевый курсивный акцент, как на твоих обложках.</p>
            {cover && (
              <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
                <Thumb src={sourceImages[cover.src]} />
                <div className="grid content-start gap-2.5">
                  <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-text-dim">
                    текст <Segmented value={cover.textPos ?? 'top'} options={(['top', 'center', 'bottom'] as TextPos[]).map((x) => [x, POS_LABEL[x]])} onChange={(v) => patchSlide('cover', { textPos: v })} />
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-text-dim">
                    под текстом <Segmented value={cover.veil ?? 'blur'} options={(['blur', 'dark', 'solid'] as Veil[]).map((x) => [x, VEIL_LABEL[x]])} onChange={(v) => patchSlide('cover', { veil: v })} />
                  </div>
                  <div className="grid gap-1.5">
                    <span className="text-[12.5px] text-text-dim">фон обложки</span>
                    <div className="flex gap-1.5 overflow-x-auto pb-1">
                      {sourceImages.map((u, i) => (
                        <button key={u + i} type="button" onClick={() => patchSlide('cover', { src: i })} aria-pressed={cover.src === i} className={`w-12 shrink-0 rounded-lg border-2 ${cover.src === i ? 'border-gold' : 'border-transparent opacity-70 hover:opacity-100'}`}>
                          <Thumb src={u} className="!rounded-md" />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="panel grid gap-3 p-5 sm:p-6">
            <h2 className="flex items-center gap-3">
              <span className="sec-num">/03</span>
              <span className="sec-title">CTA и кодовое слово</span>
            </h2>
            <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
              <label className="grid gap-1.5">
                <span className="label">кодовое слово</span>
                <input className="input font-semibold uppercase tracking-wide" value={codeWord} maxLength={20} onChange={(e) => changeWord(e.target.value)} />
                {meta.oldCodeWord && <span className="text-[12px] text-text-mute">было «{meta.oldCodeWord}»</span>}
              </label>
              {cta && (
                <div className="grid gap-2">
                  <label className="grid gap-1.5">
                    <span className="label">призыв</span>
                    <input className="input" value={cta.title} maxLength={160} onChange={(e) => patchSlide('cta', { title: e.target.value })} />
                  </label>
                  <label className="grid gap-1.5">
                    <span className="label">что получит</span>
                    <input className="input" value={cta.body} maxLength={240} onChange={(e) => patchSlide('cta', { body: e.target.value })} />
                  </label>
                  <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-text-dim">
                    текст <Segmented value={cta.textPos ?? 'center'} options={(['top', 'center', 'bottom'] as TextPos[]).map((x) => [x, POS_LABEL[x]])} onChange={(v) => patchSlide('cta', { textPos: v })} />
                    <Segmented value={cta.veil ?? 'blur'} options={(['blur', 'dark', 'solid'] as Veil[]).map((x) => [x, VEIL_LABEL[x]])} onChange={(v) => patchSlide('cta', { veil: v })} />
                  </div>
                </div>
              )}
            </div>
            <p className="text-[12px] text-amber/90">Новое слово подключи в автоматизации Директа (ChatPlace), иначе комментарии останутся без ответа.</p>
          </div>

          <div className="panel grid gap-3 p-5 sm:p-6">
            <h2 className="flex items-center gap-3">
              <span className="sec-num">/04</span>
              <span className="sec-title">Порядок слайдов</span>
            </h2>
            <p className="text-[12.5px] text-text-mute">Перетаскивай слайды или двигай стрелками. Обложка всегда первая, CTA — последний.</p>
            <ol className="grid grid-cols-3 gap-2.5 sm:grid-cols-5 lg:grid-cols-6">
              {slides.map((s, i) => {
                const movable = s.role === 'keep';
                return (
                  <li
                    key={`${s.role}-${s.src}-${i}`}
                    draggable={movable}
                    onDragStart={() => setDragFrom(i)}
                    onDragOver={(e) => movable && e.preventDefault()}
                    onDrop={(e) => movable && onDrop(e, i)}
                    className={`relative grid gap-1 rounded-2xl border p-1.5 ${dragFrom === i ? 'border-gold' : 'border-border-soft'} ${movable ? 'cursor-grab bg-white/[0.03]' : 'bg-blue/[0.06]'}`}
                  >
                    <Thumb src={sourceImages[s.src]} />
                    <div className="flex items-center justify-between gap-1 px-0.5 text-[11px] text-text-dim">
                      <span className="flex items-center gap-1 truncate tabular-nums">
                        {movable && <GripVertical size={11} className="text-text-mute" />}
                        {i + 1}. {s.role === 'cover' ? 'новая обложка' : s.role === 'cta' ? 'новый CTA' : `ориг. ${s.src + 1}`}
                      </span>
                    </div>
                    {movable && (
                      <div className="flex items-center justify-between gap-1">
                        <button type="button" onClick={() => move(i, i - 1)} disabled={i <= 1} className="btn-icon !h-7 !w-7" aria-label="Раньше">
                          <ArrowLeft size={12} />
                        </button>
                        <button type="button" onClick={() => removeAt(i)} className="btn-icon !h-7 !w-7 hover:!text-danger" aria-label="Убрать слайд">
                          <X size={12} />
                        </button>
                        <button type="button" onClick={() => move(i, i + 1)} disabled={i >= slides.length - 2} className="btn-icon !h-7 !w-7" aria-label="Позже">
                          <ArrowRight size={12} />
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
            {removed.length > 0 && (
              <div className="grid gap-1.5">
                <span className="text-[12.5px] text-text-dim">Убранные слайды оригинала</span>
                <div className="flex flex-wrap gap-2">
                  {removed.map((i) => (
                    <button key={i} type="button" onClick={() => restore(i)} className="group relative w-16" title="Вернуть в карусель">
                      <Thumb src={sourceImages[i]} className="opacity-60 group-hover:opacity-100" />
                      <span className="absolute inset-0 grid place-items-center">
                        <Plus size={18} className="rounded-full bg-black/60 p-0.5 text-white" />
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {slides.length > IG_CAROUSEL_MAX && (
              <p className="text-[12.5px] text-amber">В Instagram уйдёт не больше {IG_CAROUSEL_MAX} слайдов — убери {slides.length - IG_CAROUSEL_MAX}, если публикуешь туда.</p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={save} disabled={!dirty || !!busy} className="btn-ghost">
              {busy === 'save' ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Сохранить
            </button>
            <button type="button" onClick={() => makeRemix(true)} disabled={!!busy || postLocked} className="btn-ghost">
              {busy === 'regen' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Придумать заново
            </button>
            <button type="button" onClick={async () => (await save()) && setStep('style')} disabled={!!busy} className="btn-primary ml-auto">
              Дальше: стиль <ArrowRight size={15} />
            </button>
          </div>
        </section>
      )}

      {/* ── 3. Стиль ────────────────────────────────────────────────── */}
      {step === 'style' && draft && (
        <section className="panel grid gap-4 p-5 sm:p-6 reveal">
          <h2 className="flex items-center gap-3">
            <span className="sec-num">/05</span>
            <span className="sec-title">Стиль обложки и CTA</span>
          </h2>
          <p className="text-[13px] text-text-dim">Слайды-оригиналы не меняются ни в одном стиле. Стиль влияет только на новую обложку и CTA: «как в оригинале» кладёт текст на твою старую обложку, другой стиль рисует обложку и CTA с нуля.</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <button
              type="button"
              onClick={() => edit(() => setLook(ORIGINAL_LOOK))}
              aria-pressed={look === ORIGINAL_LOOK}
              className={`grid gap-2 rounded-2xl border p-2 text-left transition-colors ${look === ORIGINAL_LOOK ? 'border-gold bg-blue/[0.08]' : 'border-border-soft hover:bg-white/[0.04]'}`}
            >
              <Thumb src={sourceImages[cover?.src ?? 0]} />
              <span className="px-1 text-[13px] font-semibold text-text">Как в оригинале</span>
              <span className="px-1 text-[11.5px] text-text-mute">твоя обложка + Jost / Tinos, оранжевый акцент</span>
            </button>
            {CAROUSEL_STYLES.map((s) => {
              const on = look === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => edit(() => setLook(s.id))}
                  aria-pressed={on}
                  className={`grid content-start gap-2 rounded-2xl border p-2 text-left transition-colors ${on ? 'border-gold bg-blue/[0.08]' : 'border-border-soft hover:bg-white/[0.04]'}`}
                >
                  {s.group === 'skill' ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/skill-previews/${s.id.replace(/^skill-/, '')}.jpg`} alt="" loading="lazy" className="aspect-[4/5] w-full rounded-xl object-cover" />
                  ) : (
                    <div className="flex aspect-[4/5] w-full overflow-hidden rounded-xl">
                      {s.swatch.map((c) => (
                        <span key={c} className="flex-1" style={{ backgroundColor: c }} />
                      ))}
                    </div>
                  )}
                  <span className="px-1 text-[13px] font-semibold text-text">{s.label}</span>
                  <span className="px-1 text-[11.5px] text-text-mute">{s.tag}</span>
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setStep('remix')} className="btn-ghost">
              <ArrowLeft size={14} /> Ремикс
            </button>
            <button type="button" onClick={async () => (await save()) && setStep('render')} disabled={!!busy} className="btn-primary ml-auto">
              {busy === 'save' && <Loader2 size={14} className="animate-spin" />} Дальше: рендер <ArrowRight size={15} />
            </button>
          </div>
        </section>
      )}

      {/* ── 4. Рендер ───────────────────────────────────────────────── */}
      {step === 'render' && draft && (
        <section className="panel grid gap-4 p-5 sm:p-6 reveal">
          <h2 className="flex items-center gap-3">
            <span className="sec-num">/06</span>
            <span className="sec-title">Готовые слайды</span>
            <span className="ml-auto text-[12.5px] tabular-nums text-text-mute">{slides.length} слайдов · 1080×1350 JPEG</span>
          </h2>
          {draft.status === 'failed' && draft.errorMsg && <p className="text-[13px] text-danger">Прошлый рендер не удался: {jobErrorText(draft.errorMsg, 'попробуйте ещё раз.')}</p>}
          {rendered.length > 0 && !dirty ? (
            <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {rendered.map((u, i) => (
                <li key={u} className="grid gap-1.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt={`Слайд ${i + 1}`} loading="lazy" className="aspect-[4/5] w-full rounded-2xl border border-border-soft object-cover" />
                  <div className="flex items-center justify-between px-1 text-[12px] text-text-mute">
                    <span className="tabular-nums">
                      {i + 1}. {slides[i]?.role === 'cover' ? 'обложка' : slides[i]?.role === 'cta' ? 'CTA' : 'оригинал'}
                    </span>
                    <a href={u} target="_blank" rel="noopener noreferrer" download className="inline-flex items-center gap-1 hover:text-gold">
                      <Download size={12} /> скачать
                    </a>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <div className="flex flex-col items-center gap-3 rounded-2xl bg-white/[0.03] p-8 text-center">
              <Icon3D name="carousel" size={44} tile />
              <p className="max-w-[48ch] text-[14px] text-text-dim">
                {dirty ? 'Есть несохранённые правки — отрисуй заново.' : 'Отрисую новую обложку и CTA поверх оригиналов, остальные слайды останутся как были.'}
              </p>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setStep('style')} className="btn-ghost">
              <ArrowLeft size={14} /> Стиль
            </button>
            <button type="button" onClick={render} disabled={!!busy || postLocked} className={rendered.length && !dirty ? 'btn-ghost' : 'btn-primary'}>
              {busy === 'render' ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}
              {busy === 'render' ? 'Рисую слайды…' : rendered.length ? 'Отрисовать заново' : 'Отрисовать'}
            </button>
            {rendered.length > 0 && !dirty && (
              <button type="button" onClick={() => setStep('publish')} className="btn-primary ml-auto">
                Дальше: публикация <ArrowRight size={15} />
              </button>
            )}
          </div>
        </section>
      )}

      {/* ── 5. Публикация ───────────────────────────────────────────── */}
      {step === 'publish' && (
        <section className="panel grid gap-5 p-5 sm:p-6 reveal">
          <h2 className="flex items-center gap-3">
            <span className="sec-num">/07</span>
            <span className="sec-title">Публикация</span>
          </h2>
          {rendered.length === 0 ? (
            <p className="text-[14px] text-text-dim">Сначала отрисуй слайды на шаге «Рендер».</p>
          ) : (
            <div className="grid gap-5 md:grid-cols-[220px_1fr]">
              <div className="grid content-start gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={rendered[0]} alt="Обложка" className="aspect-[4/5] w-full rounded-[20px] border border-border-soft object-cover" />
                <span className="text-[12px] tabular-nums text-text-mute">{rendered.length} слайдов</span>
              </div>

              {postLocked && p.post ? (
                <div className="grid content-start gap-3">
                  <p className="text-[14px] text-text-dim">
                    {p.post.status === 'scheduled'
                      ? `Запланировано на ${new Date(p.post.scheduledAt).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })}.`
                      : p.post.status === 'publishing'
                        ? 'Публикуем…'
                        : 'Опубликовано.'}
                  </p>
                  <ul className="grid gap-1.5">
                    {p.post.targets.map((t, i) => (
                      <li key={i} className="flex items-center gap-2 text-[13px] text-text-dim">
                        <PlatformIcon platform={t.platform} /> {t.displayName ?? t.platform}
                        <span className={`status-badge status-${t.status === 'pending' ? 'queued' : t.status === 'published' ? 'ready' : t.status}`}>{t.status === 'published' ? 'опубликовано' : t.status === 'failed' ? 'ошибка' : 'в очереди'}</span>
                        {t.permalink && (
                          <a href={t.permalink} target="_blank" rel="noopener noreferrer" className="text-gold hover:underline">
                            открыть
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                  <Link href="/schedule" className="btn-ghost justify-self-start">
                    <CalendarClock size={14} /> Контент-план
                  </Link>
                </div>
              ) : (
                <div className="grid content-start gap-4">
                  <label className="grid gap-1.5">
                    <span className="text-[13px] text-text-dim">Подпись — кодовое слово в первой строке</span>
                    <textarea value={caption} onChange={(e) => edit(() => setCaption(e.target.value))} rows={8} maxLength={2200} className="input leading-relaxed" />
                    <span className="text-right text-[12px] tabular-nums text-text-mute">{caption.length} / 2200</span>
                  </label>
                  {accounts.length === 0 ? (
                    <div className="grid content-start gap-2">
                      <p className="text-[14px] text-text-dim">Нет подключённых каналов. Подключи Telegram-канал или Instagram (через PostMyPost).</p>
                      <Link href="/schedule" className="btn-primary justify-self-start">
                        Подключить канал
                      </Link>
                    </div>
                  ) : (
                    <>
                      <fieldset className="grid gap-2">
                        <legend className="mb-1 text-[13px] text-text-dim">Каналы</legend>
                        <div className="flex flex-wrap gap-2">
                          {accounts.map((a) => {
                            const on = accountIds.includes(a.id);
                            return (
                              <button
                                key={a.id}
                                type="button"
                                aria-pressed={on}
                                onClick={() => setAccountIds((ids) => (on ? ids.filter((x) => x !== a.id) : [...ids, a.id]))}
                                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] transition-colors ${on ? 'border-gold bg-blue/15 text-text' : 'border-border-soft text-text-dim hover:text-text'}`}
                              >
                                <PlatformIcon platform={a.platform} /> {a.displayName}
                                {on && <Check size={13} />}
                              </button>
                            );
                          })}
                        </div>
                        <p className="text-[12px] text-text-mute">Telegram — альбомом; Instagram — каруселью через PostMyPost (до {IG_CAROUSEL_MAX} слайдов).</p>
                        {igSelected && rendered.length > IG_CAROUSEL_MAX && (
                          <p className="text-[12.5px] text-amber">В карусели {rendered.length} слайдов — для Instagram убери лишние на шаге «Ремикс».</p>
                        )}
                        {src?.cooldown && <p className="text-[12.5px] text-amber">Оригиналу меньше 14 дней — лучше запланировать позже.</p>}
                      </fieldset>
                      <div className="flex flex-wrap items-end gap-2">
                        <label className="grid gap-1.5">
                          <span className="text-[12px] text-text-mute">Когда</span>
                          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="input !py-2 text-[13px]" />
                        </label>
                        <button type="button" onClick={() => publish(false)} disabled={!!busy || accountIds.length === 0 || !when} className="btn-ghost">
                          {busy === 'schedule' ? <Loader2 size={14} className="animate-spin" /> : <CalendarClock size={14} />} Запланировать
                        </button>
                        <button type="button" onClick={() => publish(true)} disabled={!!busy || accountIds.length === 0} className="btn-primary ml-auto">
                          {busy === 'now' ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Опубликовать сейчас
                        </button>
                      </div>
                      {p.post?.status === 'failed' && <p className="text-[13px] text-danger">Прошлая попытка не удалась: {jobErrorText(p.post.errorMsg, 'проверьте каналы.')}</p>}
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      <div className="flex items-center justify-between text-[13px] text-text-mute">
        <button type="button" onClick={() => setStep(STEPS[Math.max(0, stepIdx - 1)].key)} disabled={stepIdx === 0} className="btn-ghost !px-3.5 !py-1.5 text-[13px]">
          <ArrowLeft size={13} /> Назад
        </button>
        <span className="tabular-nums">
          шаг {stepIdx + 1} из {STEPS.length}
        </span>
      </div>
    </div>
  );
}
