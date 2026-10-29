'use client';

// REEL branch wizard: Источник → Сценарий → Аватар и голос → Видео → Монтаж →
// Публикация. Each step is a button press; prices are shown before spending.
// Stage moves on the server (GET /api/pipelines/:id derives it from the linked
// video / montage / post), the wizard polls while something renders.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Check,
  ExternalLink,
  Eye,
  Film,
  Heart,
  Instagram,
  Link2,
  Loader2,
  MessageCircle,
  RefreshCw,
  Repeat2,
  Scissors,
  Send,
  SkipForward,
  Timer,
  Trash2,
  Wand2,
} from 'lucide-react';
import { errorText, exceptionText, jobErrorText } from '@/lib/error-text';
import { PageHero } from '@/components/shell/page-hero';
import { Icon3D, type Icon3DName } from '@/components/ui/icon3d';
import { StyleGallery } from '@/components/montage/style-gallery';
import { findKadrikStyle, kadrikCostFactor } from '@/lib/montage/kadrik-styles';
import { MONTAGE_NONE, STAGE_LABEL, type PipelineCosts, type PipelineView } from '@/lib/pipeline/types';
import { CoverImg } from './cover-img';
import { AvatarVoicePicker, type PickedAvatar, type PickedVoice } from './avatar-voice-picker';

export type PublishAccount = { id: string; platform: string; displayName: string };

const STEPS: { key: Step; label: string; icon: Icon3DName }[] = [
  { key: 'source', label: 'Источник', icon: 'media' },
  { key: 'script', label: 'Сценарий', icon: 'magic' },
  { key: 'avatar', label: 'Аватар и голос', icon: 'avatar' },
  { key: 'video', label: 'Видео', icon: 'video' },
  { key: 'montage', label: 'Монтаж', icon: 'montage' },
  { key: 'publish', label: 'Публикация', icon: 'schedule' },
];
type Step = 'source' | 'script' | 'avatar' | 'video' | 'montage' | 'publish';

const GATE_UI = {
  pass: { label: 'оригинально', cls: 'text-lime border-lime/40 bg-lime/10' },
  warn: { label: 'похоже на исходник', cls: 'text-amber border-amber/40 bg-amber/10' },
  block: { label: 'слишком похоже — перепишите', cls: 'text-pink border-pink/50 bg-pink/10' },
} as const;

const RUNNING = new Set(['pending', 'processing']);

/** Furthest step the branch has reached (the user may go back to any earlier one). */
function reachedStep(p: PipelineView): number {
  if (p.post || p.stage === 'ready' || p.stage === 'scheduled' || p.stage === 'published') return 5;
  if (p.montage || p.video?.status === 'completed') return 4;
  if (p.video) return 3;
  if (p.script) return 2;
  return 0;
}

/** Step to open: where the action is now. */
function currentStep(p: PipelineView): Step {
  if (p.stage === 'error') {
    if (p.post?.status === 'failed') return 'publish';
    if (p.montage?.status === 'failed') return 'montage';
    return 'video';
  }
  const i = reachedStep(p);
  // script written but nothing picked yet → let the user read it first
  if (i === 2 && !(p.heygenAvatarId && p.voiceId)) return 'script';
  return STEPS[i].key;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.0', '')} млн`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace('.0', '')} тыс`;
  return String(n);
}

function defaultWhen(): string {
  const d = new Date(Date.now() + 60 * 60_000);
  d.setSeconds(0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function PlatformIcon({ platform }: { platform: string }) {
  if (platform === 'instagram') return <Instagram size={13} />;
  if (platform === 'telegram') return <Send size={13} />;
  return <Link2 size={13} />;
}

function Cost({ n }: { n: number }) {
  return <span className="tabular-nums opacity-85"> · {n} кр</span>;
}

function SectionTitle({ n, icon, title, right }: { n: number; icon: Icon3DName; title: string; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="flex items-center gap-3 text-[18px] font-semibold tracking-[-0.02em] text-text">
        <Icon3D name={icon} size={20} tile />
        <span className="sec-num">{String(n).padStart(2, '0')}</span>
        {title}
      </h2>
      {right}
    </div>
  );
}

export function ReelPipeline({
  initial,
  costs,
  accounts,
}: {
  initial: PipelineView;
  costs: PipelineCosts;
  accounts: PublishAccount[];
}) {
  const router = useRouter();
  const [p, setP] = useState<PipelineView>(initial);
  const [step, setStep] = useState<Step>(() => currentStep(initial));
  const [script, setScript] = useState(initial.script ?? '');
  const [sourceText, setSourceText] = useState(initial.sourceText ?? '');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [sourceFrom, setSourceFrom] = useState<string | null>(null);

  const [avatar, setAvatar] = useState<PickedAvatar | null>(
    initial.heygenAvatarId
      ? { id: initial.heygenAvatarId, name: initial.heygenAvatarName ?? 'Аватар', image: initial.heygenAvatarImage, defaultVoiceId: null }
      : null,
  );
  const [voice, setVoice] = useState<PickedVoice | null>(
    initial.voiceId ? { id: initial.voiceId, name: initial.voiceName ?? 'Голос' } : null,
  );
  const [aspect, setAspect] = useState<'9:16' | '1:1' | '16:9'>('9:16');

  const [style, setStyle] = useState(initial.montageStyle && initial.montageStyle !== MONTAGE_NONE ? initial.montageStyle : '');
  const [wish, setWish] = useState('');
  const [ctaWord, setCtaWord] = useState('');

  const [caption, setCaption] = useState('');
  const [accountIds, setAccountIds] = useState<string[]>(accounts.map((a) => a.id));
  const [when, setWhen] = useState(defaultWhen());

  const refreshBalance = useCallback(async () => {
    try {
      const r = await fetch('/api/billing/balance');
      const d = await r.json();
      if (r.ok) setBalance(d.balance ?? null);
    } catch {
      /* not critical */
    }
  }, []);
  useEffect(() => {
    void refreshBalance();
  }, [refreshBalance]);

  const pRef = useRef(p);
  const apply = useCallback((next: PipelineView, opts: { follow?: boolean } = {}) => {
    const prev = pRef.current;
    pRef.current = next;
    setP(next);
    // follow the branch forward when a render finishes or something fails
    if (opts.follow || reachedStep(next) > reachedStep(prev) || (next.stage === 'error' && prev.stage !== 'error')) {
      setStep(currentStep(next));
    }
  }, []);

  // Poll while the video / montage renders or the post is going out.
  const rendering = (p.video && RUNNING.has(p.video.status)) || (p.montage && RUNNING.has(p.montage.status));
  const posting = p.post && (p.post.status === 'scheduled' || p.post.status === 'publishing');
  const pollMs = p.montage && RUNNING.has(p.montage.status) ? 15_000 : rendering ? 6_000 : posting ? 20_000 : 0;
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!pollMs) return;
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`/api/pipelines/${p.id}`);
        const d = await r.json();
        if (r.ok && d.pipeline) {
          apply(d.pipeline);
          if (d.pipeline.stage === 'error' || d.pipeline.stage === 'ready') void refreshBalance();
        }
      } catch {
        /* transient — keep polling */
      }
    }, pollMs);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [pollMs, p.id, apply, refreshBalance]);

  async function call(label: string, url: string, init: { method?: string; body?: unknown; follow?: boolean } = {}) {
    setBusy(label);
    setError(null);
    try {
      const r = await fetch(url, {
        method: init.method ?? 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(errorText(d, r.status));
        return null;
      }
      if (d.pipeline) apply(d.pipeline, { follow: init.follow ?? true });
      void refreshBalance();
      return d;
    } catch (e) {
      setError(exceptionText(e));
      return null;
    } finally {
      setBusy(null);
    }
  }

  const canAfford = (n: number) => balance == null || balance >= n;

  // ── actions ──
  async function uniquify() {
    if (!p.source && sourceText.trim() !== (p.sourceText ?? '').trim()) {
      await call('save-source', `/api/pipelines/${p.id}`, { method: 'PATCH', body: { sourceText }, follow: false });
    }
    const d = await call('script', `/api/pipelines/${p.id}/script`, { body: {} });
    if (d?.script) {
      setScript(d.script);
      setSourceFrom(d.sourceFrom ?? null);
      setStep('script');
    }
  }
  async function saveScript() {
    await call('save', `/api/pipelines/${p.id}`, { method: 'PATCH', body: { script }, follow: false });
  }
  async function persistPick(a: PickedAvatar | null, v: PickedVoice | null) {
    // remember the choice so a reload keeps it; no tokens involved
    await fetch(`/api/pipelines/${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        heygenAvatarId: a?.id ?? null,
        heygenAvatarName: a?.name ?? null,
        heygenAvatarImage: a?.image ?? null,
        voiceId: v?.id ?? null,
        voiceName: v?.name ?? null,
      }),
    }).catch(() => {});
  }
  async function startVideo() {
    if (!avatar || !voice) return;
    const d = await call('video', `/api/pipelines/${p.id}/video`, {
      body: { heygenAvatarId: avatar.id, voiceId: voice.id, script: script.trim() || undefined, aspect },
    });
    if (d) setStep('video');
  }
  async function startMontage() {
    if (!style) return;
    await call('montage', `/api/pipelines/${p.id}/montage`, { body: { style, wish: wish || undefined, ctaWord: ctaWord || undefined } });
  }
  async function skipMontage() {
    const d = await call('skip', `/api/pipelines/${p.id}/montage`, { body: { style: MONTAGE_NONE } });
    if (d) setStep('publish');
  }
  async function publish(now: boolean) {
    const body = now
      ? { accountIds, caption: caption || undefined, now: true }
      : { accountIds, caption: caption || undefined, scheduledAt: new Date(when).toISOString() };
    await call(now ? 'now' : 'schedule', `/api/pipelines/${p.id}/schedule`, { body });
  }
  async function remove() {
    if (!window.confirm('Удалить ветку? Готовые видео и монтажи останутся в библиотеке.')) return;
    const d = await call('delete', `/api/pipelines/${p.id}`, { method: 'DELETE' });
    if (d) router.push('/pipeline');
  }

  const reached = reachedStep(p);
  const s = p.source;
  const gate = p.gate;
  const videoRunning = !!p.video && RUNNING.has(p.video.status);
  const montageRunning = !!p.montage && RUNNING.has(p.montage.status);
  const scriptDirty = script.trim() !== (p.script ?? '').trim();
  const pickedStyle = style ? findKadrikStyle(style) : null;
  const montageCost = costs.montage * (pickedStyle ? kadrikCostFactor(pickedStyle) : 1);
  const finalUrl =
    p.montage?.status === 'completed' && p.montage.resultUrl && p.montageStyle !== MONTAGE_NONE
      ? p.montage.resultUrl
      : p.video?.status === 'completed'
        ? p.video.videoUrl
        : null;
  const postLocked = !!p.post && ['scheduled', 'publishing', 'published', 'partial'].includes(p.post.status);

  const stepIdx = STEPS.findIndex((x) => x.key === step);

  const stageBadge = useMemo(() => {
    const cls =
      p.stage === 'error' ? 'status-failed' : p.stage === 'published' || p.stage === 'ready' ? 'status-ready' : p.stage === 'scheduled' ? 'status-scheduled' : rendering ? 'status-processing' : 'status-queued';
    return <span className={`status-badge ${cls}`}>{STAGE_LABEL[p.stage]}</span>;
  }, [p.stage, rendering]);

  return (
    <div className="grid max-w-5xl gap-5">
      <div className="flex items-center justify-between gap-2">
        <Link href="/pipeline" className="btn-ghost !px-4 !py-2 text-[13px]">
          <ArrowLeft size={14} /> Мои ветки
        </Link>
        <button
          type="button"
          onClick={remove}
          disabled={busy === 'delete' || videoRunning || montageRunning}
          title={videoRunning || montageRunning ? 'Дождитесь окончания рендера' : ''}
          className="btn-ghost !px-4 !py-2 text-[13px] hover:!border-danger/60 hover:!text-danger"
        >
          {busy === 'delete' ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Удалить ветку
        </button>
      </div>

      <PageHero
        eyebrow={`ветка · рилс${s?.owner ? ` · @${s.owner}` : ''}`}
        title={p.title || 'Новый рилс'}
        icon="video"
        extra={
          <div className="flex flex-wrap items-center gap-3">
            {stageBadge}
            {balance != null && (
              <span className="flex items-center gap-1.5 text-[13px] text-text-dim">
                <Icon3D name="coin" size={16} /> баланс <b className="tabular-nums text-gold">{balance}</b> кр
              </span>
            )}
          </div>
        }
      />

      {/* Stepper */}
      <nav aria-label="Шаги ветки" className="panel !rounded-2xl p-2">
        <ol className="grid grid-cols-3 gap-1 sm:grid-cols-6">
          {STEPS.map((st, i) => {
            const done = i < reached || (i === 5 && p.stage === 'published');
            const active = st.key === step;
            const open = i <= reached;
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
        <div role="alert" className="panel flex flex-wrap items-center gap-2 !rounded-2xl border-danger/40 p-4 text-[13px] text-danger">
          <AlertTriangle size={15} /> <span className="flex-1">{error}</span>
          {/Недостаточно токенов/.test(error) && (
            <Link href="/billing" className="btn-primary !px-3.5 !py-1.5 text-[13px]">
              Пополнить
            </Link>
          )}
        </div>
      )}
      {p.stage === 'error' && p.errorMsg && !error && (
        <div role="alert" className="panel flex items-center gap-2 !rounded-2xl border-danger/40 p-4 text-[13px] text-danger">
          <AlertTriangle size={15} /> {p.errorMsg}
        </div>
      )}

      {/* 1 · Источник */}
      {step === 'source' && (
        <section className="panel reveal grid gap-5 p-6">
          <SectionTitle n={1} icon="media" title="Источник" />
          {s ? (
            <div className="grid gap-5 md:grid-cols-[220px_1fr]">
              <div className="relative aspect-[9/16] overflow-hidden rounded-2xl border border-border-soft bg-black">
                <span className="absolute inset-0 grid place-items-center text-text-mute">
                  <Film size={28} />
                </span>
                {/* Instagram CDN links expire — a dead one just reveals the icon */}
                {s.thumbnailUrl && <CoverImg src={s.thumbnailUrl} className="relative h-full w-full object-cover" />}
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="btn-ghost absolute bottom-3 left-3 !px-3 !py-1.5 text-[12px]">
                  <ExternalLink size={13} /> Открыть в Instagram
                </a>
              </div>
              <div className="grid content-start gap-4">
                <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {[
                    { icon: Eye, label: 'просмотры', v: fmt(s.plays) },
                    { icon: Heart, label: 'лайки', v: fmt(s.likes) },
                    { icon: MessageCircle, label: 'комменты', v: fmt(s.comments) },
                    { icon: Repeat2, label: 'репосты', v: fmt(s.shares) },
                    { icon: Timer, label: 'длина', v: s.durationSec ? `${Math.round(s.durationSec)} с` : '—' },
                  ].map((m) => (
                    <div key={m.label} className="card-editorial grid gap-1 !rounded-2xl p-3">
                      <dt className="flex items-center gap-1.5 text-[11px] text-text-mute">
                        <m.icon size={12} /> {m.label}
                      </dt>
                      <dd className="text-[18px] font-semibold tabular-nums tracking-[-0.02em] text-text">{m.v}</dd>
                    </div>
                  ))}
                </dl>
                {s.caption && (
                  <div className="grid gap-1.5">
                    <span className="text-[12px] text-text-mute">Подпись</span>
                    <p className="max-h-48 overflow-y-auto whitespace-pre-wrap text-[13px] leading-[1.6] text-text-dim">{s.caption}</p>
                  </div>
                )}
                <p className="text-[12px] text-text-mute">
                  {s.videoUrl ? 'Речь из рилса распознаем и перепишем новыми словами — идея и факты останутся вашими.' : 'Видео рилса недоступно — сценарий напишем по подписи.'}
                </p>
              </div>
            </div>
          ) : (
            <label className="grid gap-2">
              <span className="text-[13px] text-text-dim">Текст исходника (что говорилось в рилсе)</span>
              <textarea value={sourceText} onChange={(e) => setSourceText(e.target.value)} rows={6} className="input" placeholder="Вставьте текст или расшифровку ролика" />
            </label>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={uniquify}
              disabled={!!busy || !canAfford(costs.script) || (!s && sourceText.trim().length < 10)}
              title={!canAfford(costs.script) ? 'Недостаточно токенов' : ''}
              className="btn-primary"
            >
              {busy === 'script' ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}
              {p.script ? 'Уникализировать заново' : 'Уникализировать'}
              <Cost n={costs.script} />
            </button>
            {busy === 'script' && <span className="text-[13px] text-text-mute">Распознаём речь и пишем сценарий — до минуты…</span>}
            {p.script && busy !== 'script' && (
              <button type="button" onClick={() => setStep('script')} className="btn-ghost ml-auto">
                К сценарию <ArrowRight size={14} />
              </button>
            )}
          </div>
        </section>
      )}

      {/* 2 · Сценарий */}
      {step === 'script' && (
        <section className="panel reveal grid gap-4 p-6">
          <SectionTitle
            n={2}
            icon="magic"
            title="Сценарий"
            right={
              gate && (
                <span className={`rounded-full border px-2.5 py-1 text-[12px] font-medium ${GATE_UI[gate].cls}`}>
                  {GATE_UI[gate].label}
                  {p.similarity != null ? ` · ${Math.round(p.similarity * 100)}%` : ''}
                </span>
              )
            }
          />
          <textarea
            value={script}
            onChange={(e) => setScript(e.target.value)}
            rows={10}
            maxLength={1500}
            disabled={videoRunning}
            aria-label="Текст сценария"
            className="input disabled:opacity-70"
          />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-text-mute">
            <span className="tabular-nums">{script.length}/1500 символов</span>
            <span className="tabular-nums">≈ {Math.max(1, Math.round(script.trim().split(/\s+/).filter(Boolean).length / 2.4))} с речи</span>
            {sourceFrom && <span>{sourceFrom === 'transcript' ? 'по расшифровке рилса' : sourceFrom === 'caption' ? 'по подписи рилса' : ''}</span>}
          </div>
          {gate === 'block' && (
            <p className="text-[13px] text-pink">Текст слишком близок к исходнику — перегенерируйте или перепишите своими словами.</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={saveScript} disabled={!!busy || !scriptDirty || videoRunning} className="btn-ghost">
              {busy === 'save' ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Сохранить правку
            </button>
            <button type="button" onClick={uniquify} disabled={!!busy || videoRunning || !canAfford(costs.script)} className="btn-ghost">
              {busy === 'script' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Перегенерировать
              <Cost n={costs.script} />
            </button>
            <button
              type="button"
              onClick={async () => {
                if (scriptDirty) await saveScript();
                setStep('avatar');
              }}
              disabled={!!busy || script.trim().length < 5 || gate === 'block'}
              className="btn-primary ml-auto"
            >
              Дальше: аватар и голос <ArrowRight size={15} />
            </button>
          </div>
        </section>
      )}

      {/* 3 · Аватар и голос */}
      {step === 'avatar' && (
        <section className="panel reveal grid gap-5 p-6">
          <SectionTitle n={3} icon="avatar" title="Аватар и голос" />
          <AvatarVoicePicker
            avatar={avatar}
            voice={voice}
            onAvatar={(a) => {
              setAvatar(a);
              void persistPick(a, voice);
            }}
            onVoice={(v) => {
              setVoice(v);
              void persistPick(avatar, v);
            }}
          />
          <div className="flex flex-wrap items-center gap-3 border-t border-border-soft pt-4">
            <label className="flex items-center gap-2 text-[13px] text-text-dim">
              Кадр
              <select value={aspect} onChange={(e) => setAspect(e.target.value as typeof aspect)} className="input !w-auto !py-1.5 text-[13px]">
                <option value="9:16">9:16 — Reels</option>
                <option value="1:1">1:1</option>
                <option value="16:9">16:9</option>
              </select>
            </label>
            <span className="text-[12px] text-text-mute">
              {avatar && voice ? `${avatar.name} · ${voice.name}` : 'Выберите аватар и голос'}
            </span>
            <button
              type="button"
              onClick={startVideo}
              disabled={!!busy || !avatar || !voice || videoRunning || gate === 'block' || script.trim().length < 5 || !canAfford(costs.video)}
              title={!canAfford(costs.video) ? 'Недостаточно токенов' : gate === 'block' ? 'Сценарий слишком похож на исходник' : ''}
              className="btn-primary ml-auto"
            >
              {busy === 'video' ? <Loader2 size={15} className="animate-spin" /> : <Film size={15} />}
              {p.video ? 'Снять заново' : 'Снять видео'}
              <Cost n={costs.video} />
            </button>
          </div>
        </section>
      )}

      {/* 4 · Видео */}
      {step === 'video' && (
        <section className="panel reveal grid gap-4 p-6">
          <SectionTitle n={4} icon="video" title="Видео" right={p.video && <span className={`status-badge status-${p.video.status}`}>{videoStatusLabel(p.video.status)}</span>} />
          {!p.video && <p className="text-[14px] text-text-dim">Видео ещё не запущено — выберите аватар и голос на шаге 3.</p>}
          {p.video && RUNNING.has(p.video.status) && (
            <div className="grid gap-2">
              <div className="flex items-center gap-2 text-[14px] text-text-dim">
                <Loader2 size={15} className="animate-spin text-gold" /> HeyGen рендерит видео — обычно 3–10 минут. Страница обновится сама.
              </div>
              <Elapsed since={p.video.createdAt} />
            </div>
          )}
          {p.video?.status === 'failed' && (
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-2 text-[14px] text-danger">
                <AlertTriangle size={15} /> {jobErrorText(p.video.errorMsg)}
              </span>
              <button type="button" onClick={startVideo} disabled={!!busy || !avatar || !voice || !canAfford(costs.video)} className="btn-primary ml-auto">
                {busy === 'video' ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Повторить
                <Cost n={costs.video} />
              </button>
              <button type="button" onClick={() => setStep('avatar')} className="btn-ghost">
                Сменить аватар или голос
              </button>
            </div>
          )}
          {p.video?.status === 'completed' && p.video.videoUrl && (
            <>
              <video src={p.video.videoUrl} controls playsInline className="aspect-[9/16] w-full max-w-xs rounded-[20px] border border-border-soft bg-black object-contain" />
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => setStep('avatar')} className="btn-ghost">
                  <RefreshCw size={14} /> Переснять
                </button>
                <button type="button" onClick={() => setStep('montage')} className="btn-primary ml-auto">
                  Дальше: монтаж <ArrowRight size={15} />
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {/* 5 · Монтаж */}
      {step === 'montage' && (
        <section className="panel reveal grid gap-5 p-6">
          <SectionTitle
            n={5}
            icon="montage"
            title="Монтаж"
            right={p.montage && <span className={`status-badge status-${p.montage.status}`}>{videoStatusLabel(p.montage.status)}</span>}
          />
          {p.montage && montageRunning ? (
            <div className="grid gap-2">
              <div className="flex items-center gap-2 text-[14px] text-text-dim">
                <Loader2 size={15} className="animate-spin text-gold" /> Монтаж в стиле «{findKadrikStyle(p.montage.style)?.name ?? p.montage.style}» — 20–90 минут.
                Можно закрыть страницу, ветка продолжит сама.
              </div>
              {p.montage.progress && <span className="text-[13px] text-text-mute">{p.montage.progress}</span>}
              <Elapsed since={p.montage.createdAt} />
            </div>
          ) : p.montage?.status === 'completed' && p.montage.resultUrl && p.montageStyle !== MONTAGE_NONE ? (
            <>
              <video src={p.montage.resultUrl} controls playsInline className="aspect-[9/16] w-full max-w-xs rounded-[20px] border border-border-soft bg-black object-contain" />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => apply({ ...p, montage: null }, {})}
                  className="btn-ghost"
                  title="Выбрать другой стиль и смонтировать заново"
                >
                  <Scissors size={14} /> Другой стиль
                </button>
                <button type="button" onClick={() => setStep('publish')} className="btn-primary ml-auto">
                  Дальше: публикация <ArrowRight size={15} />
                </button>
              </div>
            </>
          ) : p.video?.status !== 'completed' ? (
            <p className="text-[14px] text-text-dim">Монтаж станет доступен, когда видео будет готово.</p>
          ) : (
            <>
              {p.montage?.status === 'failed' && (
                <p className="flex items-center gap-2 text-[13px] text-danger">
                  <AlertTriangle size={14} /> {jobErrorText(p.montage.errorMsg, 'Монтаж не удался, токены возвращены.')}
                </p>
              )}
              <StyleGallery value={style} onChange={setStyle} only={(x) => x.inp === 'video' && x.format === '9:16'} />
              <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
                <label className="grid gap-1.5">
                  <span className="text-[12px] text-text-mute">Пожелание к монтажу (необязательно)</span>
                  <textarea value={wish} onChange={(e) => setWish(e.target.value)} rows={2} maxLength={1500} className="input" placeholder="Например: больше зумов на цифрах" />
                </label>
                <label className="grid content-start gap-1.5">
                  <span className="text-[12px] text-text-mute">Кодовое слово CTA</span>
                  <input value={ctaWord} onChange={(e) => setCtaWord(e.target.value)} maxLength={24} className="input" placeholder="ГАЙД" />
                </label>
              </div>
              <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-2 rounded-2xl border border-border-soft bg-[#0f0f12]/90 p-3 backdrop-blur">
                <span className="text-[13px] text-text-dim">{pickedStyle ? `Стиль: ${pickedStyle.name}` : 'Выберите стиль выше'}</span>
                <button type="button" onClick={skipMontage} disabled={!!busy} className="btn-ghost ml-auto">
                  {busy === 'skip' ? <Loader2 size={14} className="animate-spin" /> : <SkipForward size={14} />} Без монтажа
                </button>
                <button
                  type="button"
                  onClick={startMontage}
                  disabled={!!busy || !pickedStyle || !canAfford(montageCost)}
                  title={!canAfford(montageCost) ? 'Недостаточно токенов' : ''}
                  className="btn-primary"
                >
                  {busy === 'montage' ? <Loader2 size={15} className="animate-spin" /> : <Scissors size={15} />} Смонтировать
                  <Cost n={montageCost} />
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {/* 6 · Публикация */}
      {step === 'publish' && (
        <section className="panel reveal grid gap-5 p-6">
          <SectionTitle n={6} icon="schedule" title="Публикация" right={p.post && <span className={`status-badge status-${p.post.status}`}>{postStatusLabel(p.post.status)}</span>} />
          {!finalUrl ? (
            <p className="text-[14px] text-text-dim">Сначала нужно готовое видео.</p>
          ) : (
            <div className="grid gap-5 md:grid-cols-[240px_1fr]">
              <div className="grid content-start gap-2">
                <video src={finalUrl} controls playsInline className="aspect-[9/16] w-full rounded-[20px] border border-border-soft bg-black object-contain" />
                <a href={finalUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost justify-self-start !px-3 !py-1.5 text-[12px]">
                  <ExternalLink size={13} /> Скачать
                </a>
                <span className="text-[12px] text-text-mute">{p.montageStyle === MONTAGE_NONE || !p.montage ? 'без монтажа' : `монтаж: ${findKadrikStyle(p.montage.style)?.name ?? p.montage.style}`}</span>
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
                        <span className={`status-badge status-${t.status === 'pending' ? 'queued' : t.status}`}>{postStatusLabel(t.status)}</span>
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
              ) : accounts.length === 0 ? (
                <div className="grid content-start gap-3">
                  <p className="text-[14px] text-text-dim">Нет подключённых каналов. Подключите Instagram или Telegram-канал.</p>
                  <Link href="/schedule" className="btn-primary justify-self-start">
                    Подключить канал
                  </Link>
                </div>
              ) : (
                <div className="grid content-start gap-4">
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
                            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] transition-colors ${
                              on ? 'border-gold bg-blue/15 text-text' : 'border-border-soft text-text-dim hover:text-text'
                            }`}
                          >
                            <PlatformIcon platform={a.platform} /> {a.displayName}
                            {on && <Check size={13} />}
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
                  <label className="grid gap-1.5">
                    <span className="text-[13px] text-text-dim">Подпись к посту</span>
                    <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={4} maxLength={2200} className="input" placeholder="Текст под рилсом, хэштеги" />
                  </label>
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
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* step footer navigation */}
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

function videoStatusLabel(s: string): string {
  return s === 'completed' ? 'готово' : s === 'failed' ? 'ошибка' : s === 'processing' ? 'в работе' : 'в очереди';
}

function postStatusLabel(s: string): string {
  return (
    {
      scheduled: 'запланировано',
      publishing: 'публикуется',
      published: 'опубликовано',
      partial: 'частично',
      failed: 'ошибка',
      canceled: 'отменено',
      pending: 'ждёт',
    } as Record<string, string>
  )[s] ?? s;
}

function Elapsed({ since }: { since: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const sec = Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000));
  const m = Math.floor(sec / 60);
  return <span className="text-[12px] tabular-nums text-text-mute">прошло {m} мин {String(sec % 60).padStart(2, '0')} с</span>;
}
