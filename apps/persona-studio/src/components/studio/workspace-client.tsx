'use client';

// Воркспейс генерации одного брифа (Мастер-ТЗ §4, Модуль B). Ведёт пользователя
// по стадиям: сценарий (Claude + §2 similarity-gate) → видео (HeyGen/OmniHuman)
// → монтаж (Submagic, опц.) → финал. Стадии video/edit продвигаются поллингом
// GET /api/generations/:id (advanceGeneration на сервере).

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Wand2,
  Film,
  Scissors,
  AlertTriangle,
  RefreshCw,
  Loader2,
  CalendarPlus,
  ArrowLeft,
  Check,
  ChevronRight,
  ExternalLink,
  Trash2,
} from 'lucide-react';
import { errorText, jobErrorText } from '@/lib/error-text';
import { PageHero } from '@/components/shell/page-hero';
import { Icon3D } from '@/components/ui/icon3d';
import type { BriefView, GenerationView, SimilarityGate } from '@/lib/studio/types';

type PersonaReady = { hasAvatar: boolean; hasVoice: boolean; name: string | null };

const GATE_UI: Record<SimilarityGate, { label: string; cls: string }> = {
  pass: { label: 'оригинально', cls: 'text-lime border-lime/40 bg-lime/10' },
  warn: { label: 'похоже на источник', cls: 'text-amber border-amber/40 bg-amber/10' },
  block: { label: 'слишком похоже — переформулируй', cls: 'text-pink border-pink/50 bg-pink/10' },
};

export function WorkspaceClient({
  initialBrief,
  personaReady,
}: {
  initialBrief: BriefView;
  personaReady: PersonaReady;
}) {
  const brief = initialBrief;
  const [gen, setGen] = useState<GenerationView | null>(initialBrief.generations[0] ?? null);
  const [script, setScript] = useState(initialBrief.generations[0]?.script ?? '');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [upsell, setUpsell] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [costs, setCosts] = useState<{ script: number; video: number; montage: number } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Баланс + единый прайс (Модуль H, §10) — смета перед запуском генерации.
  const refreshBalance = useCallback(async () => {
    try {
      const res = await fetch('/api/billing/balance');
      const d = await res.json();
      if (res.ok) {
        setBalance(d.balance ?? null);
        if (d.costs) setCosts(d.costs);
      }
    } catch {
      /* не критично */
    }
  }, []);
  useEffect(() => {
    void refreshBalance();
  }, [refreshBalance]);

  const stopPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // Поллинг, пока активная генерация в работе.
  useEffect(() => {
    const processing = gen?.status === 'processing';
    if (!processing || !gen) {
      stopPoll();
      return;
    }
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/generations/${gen.id}`);
        const data = await res.json();
        if (res.ok && data.generation) {
          setGen(data.generation);
          if (data.generation.script && !script) setScript(data.generation.script);
        }
      } catch {
        /* транзиентная ошибка сети — продолжаем поллинг */
      }
    }, 5000);
    return stopPoll;
  }, [gen, script, stopPoll]);

  async function call(url: string, body?: unknown, label?: string) {
    setBusy(label ?? url);
    setError(null);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      if (res.status === 402) {
        setUpsell(true);
        setError('Недостаточно токенов');
        return null;
      }
      if (!res.ok) throw new Error(errorText(data, res.status));
      if (data.generation) {
        setGen(data.generation);
        if (data.generation.script) setScript(data.generation.script);
      }
      void refreshBalance();
      return data;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(null);
    }
  }

  const genScript = () => call(`/api/briefs/${brief.id}/generate`, undefined, 'script');
  const produce = () => gen && call(`/api/generations/${gen.id}/produce`, undefined, 'produce');
  // Упавшая генерация: со сценарием — вернуть на стадию сценария, без него —
  // сгенерировать сценарий заново.
  const retry = () =>
    gen?.script ? call(`/api/generations/${gen.id}/retry`, undefined, 'retry') : genScript();

  async function deleteBrief() {
    if (!window.confirm('Удалить бриф вместе со сценарием? Готовые видео останутся в библиотеке.')) return;
    setBusy('delete');
    setError(null);
    try {
      const res = await fetch(`/api/briefs/${brief.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(errorText(data, res.status));
      window.location.href = '/briefs';
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }
  const montage = () => gen && call(`/api/generations/${gen.id}/montage`, {}, 'montage');
  const finalize = () => gen && call(`/api/generations/${gen.id}/finalize`, undefined, 'finalize');

  async function saveScript() {
    if (!gen) return;
    setBusy('save');
    setError(null);
    try {
      const res = await fetch(`/api/generations/${gen.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(errorText(data, res.status));
      setGen(data.generation);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const personaOk = personaReady.hasAvatar && personaReady.hasVoice;
  const gate = gen?.gate as SimilarityGate | null;
  const videoReady = gen?.stage === 'video' && gen.status === 'completed' && gen.videoUrl;

  // Хватает ли баланса на стадию (если баланс ещё не загружен — не блокируем).
  const canAfford = (cost: number | undefined) =>
    balance == null || cost == null || balance >= cost;

  // Handoff в контент-план (Модуль C): монтаж → edit, иначе сырое видео.
  const scheduleHref = gen?.videoEditId
    ? `/schedule/new?source=edit&id=${gen.videoEditId}`
    : gen?.videoGenerationId
      ? `/schedule/new?source=video&id=${gen.videoGenerationId}`
      : null;

  return (
    <div className="grid max-w-3xl gap-5">
      <div className="flex items-center justify-between gap-2">
        <Link href="/briefs" className="btn-ghost !px-4 !py-2 text-[13px]">
          <ArrowLeft size={14} /> воркспейс
        </Link>
        <button
          type="button"
          onClick={deleteBrief}
          disabled={busy === 'delete' || gen?.status === 'processing'}
          title={gen?.status === 'processing' ? 'Дождитесь окончания генерации' : ''}
          className="btn-ghost !px-4 !py-2 text-[13px] hover:!border-danger/60 hover:!text-danger"
        >
          {busy === 'delete' ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          Удалить бриф
        </button>
      </div>
      <PageHero
        eyebrow={`${brief.source?.authorUsername ? `вдохновение @${brief.source.authorUsername} · ` : ''}${brief.format || 'формат —'} · ${brief.lang.toUpperCase()}${brief.lengthSec ? ` · ~${brief.lengthSec}с` : ''}`}
        title={brief.topic || 'Бриф'}
        extra={<Stepper stage={gen?.stage ?? 'script'} status={gen?.status ?? 'pending'} />}
      />

      {/* Баланс + смета (Модуль H, §10) */}
      {balance != null && costs && (
        <div className="panel flex flex-wrap items-center gap-x-4 gap-y-2 !rounded-2xl px-4 py-3">
          <Icon3D name="coin" size={20} />
          <span className="text-[14px] text-text-dim">
            Баланс <span className="font-extrabold tabular-nums tracking-[-0.02em] text-gold">{balance}</span> кр.
          </span>
          <span className="text-[12px] text-text-mute">
            сценарий {costs.script} · видео {costs.video} · монтаж {costs.montage}
          </span>
          <Link href="/billing" className="btn-ghost ml-auto !px-3.5 !py-1.5 text-[13px]">
            пополнить
          </Link>
        </div>
      )}

      {upsell && (
        <div className="panel flex flex-wrap items-center gap-3 !rounded-2xl border-pink/50 p-4">
          <AlertTriangle size={16} className="text-pink" />
          <span className="flex-1 text-[14px] text-pink">Недостаточно токенов для этой стадии.</span>
          <Link href="/billing" className="btn-primary">
            Пополнить баланс
          </Link>
        </div>
      )}

      {error && !upsell && (
        <div className="panel flex items-center gap-2 !rounded-2xl border-danger/40 p-4 text-[13px] text-danger">
          <AlertTriangle size={15} /> {error}
        </div>
      )}

      {/* Стадия 1 — сценарий */}
      <section className="panel reveal grid gap-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-3 text-[18px] font-semibold tracking-[-0.02em] text-text">
            <Icon3D name="magic" size={20} tile /> Сценарий
          </h2>
          {gen?.gate && (
            <span className={`rounded-full border px-2.5 py-1 text-[12px] font-medium ${GATE_UI[gate ?? 'pass'].cls}`}>
              {GATE_UI[gate ?? 'pass'].label}
              {gen.similarity != null ? ` · ${gen.similarity}` : ''}
            </span>
          )}
        </div>

        {!gen ? (
          <button
            type="button"
            onClick={genScript}
            disabled={busy === 'script' || !canAfford(costs?.script)}
            title={!canAfford(costs?.script) ? 'Недостаточно токенов' : ''}
            className="btn-primary justify-self-start"
          >
            {busy === 'script' ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}
            Сгенерировать сценарий{costs ? ` · ${costs.script} кр` : ''}
          </button>
        ) : (
          <>
            <textarea
              value={script}
              onChange={(e) => setScript(e.target.value)}
              rows={8}
              disabled={gen.stage !== 'script'}
              className="input disabled:opacity-70"
            />
            {gen.stage === 'script' && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={saveScript}
                  disabled={busy === 'save' || script === gen.script}
                  className="btn-ghost"
                >
                  Сохранить правку
                </button>
                <button type="button" onClick={genScript} disabled={busy === 'script'} className="btn-ghost">
                  <RefreshCw size={14} /> Перегенерировать
                </button>
                <button
                  type="button"
                  onClick={produce}
                  disabled={busy === 'produce' || gate === 'block' || !personaOk || !canAfford(costs?.video)}
                  title={
                    gate === 'block'
                      ? 'Слишком похоже на источник — переформулируйте'
                      : !personaOk
                        ? 'Нужна персона с аватаром и голосом'
                        : !canAfford(costs?.video)
                          ? 'Недостаточно токенов'
                          : ''
                  }
                  className="btn-primary ml-auto"
                >
                  <Film size={15} /> Снять видео{costs ? ` · ${costs.video} кр` : ''}
                </button>
              </div>
            )}
          </>
        )}

        {gen?.stage === 'script' && !personaOk && (
          <p className="text-[13px] text-text-mute">
            Для видео нужна персона с аватаром и голосом.{' '}
            <Link href="/personas" className="text-gold underline-offset-2 hover:underline">
              Настроить персону
            </Link>
            {personaReady.name ? ` (${personaReady.name}: ${personaReady.hasAvatar ? '' : 'нет аватара'} ${personaReady.hasVoice ? '' : 'нет голоса'})` : ''}
          </p>
        )}
      </section>

      {/* Стадия 2/3 — видео + монтаж */}
      {gen && gen.stage !== 'script' && (
        <section className="panel reveal grid gap-4 p-6">
          <h2 className="flex items-center gap-3 text-[18px] font-semibold tracking-[-0.02em] text-text">
            <Icon3D name="video" size={20} tile /> Видео {gen.stage === 'edit' && '· монтаж'}
          </h2>

          {gen.status === 'processing' && (
            <div className="flex items-center gap-2 text-[14px] text-text-dim">
              <Loader2 size={15} className="animate-spin text-gold" />
              {gen.stage === 'edit' ? 'Монтаж в Submagic…' : 'Рендер видео…'} (обновляется автоматически)
            </div>
          )}

          {gen.stage === 'error' && (
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-2 text-[14px] text-danger">
                <AlertTriangle size={15} /> {jobErrorText(gen.errorMsg)}
              </span>
              <button
                type="button"
                onClick={retry}
                disabled={busy === 'retry' || busy === 'script'}
                className="btn-primary ml-auto"
              >
                {busy === 'retry' || busy === 'script' ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                {gen.script ? 'Попробовать снова' : 'Сгенерировать сценарий заново'}
              </button>
            </div>
          )}

          {(videoReady || gen.finalUrl) && (
            <video
              src={gen.finalUrl || gen.videoUrl || undefined}
              controls
              playsInline
              className="aspect-[9/16] w-full max-w-xs rounded-[20px] border border-border-soft bg-black object-contain"
            />
          )}

          {videoReady && gen.stage === 'video' && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={montage}
                disabled={busy === 'montage' || !canAfford(costs?.montage)}
                title={!canAfford(costs?.montage) ? 'Недостаточно токенов' : ''}
                className="btn-primary"
              >
                <Scissors size={15} /> Смонтировать{costs ? ` · ${costs.montage} кр` : ''}
              </button>
              <button type="button" onClick={finalize} disabled={busy === 'finalize'} className="btn-ghost">
                Использовать как финал
              </button>
            </div>
          )}
        </section>
      )}

      {/* Финал */}
      {gen?.stage === 'done' && gen.finalUrl && (
        <section className="panel reveal grid gap-3 border-lime/40 p-6">
          <h2 className="flex items-center gap-3 text-[18px] font-semibold tracking-[-0.02em] text-text">
            <Icon3D name="done" size={20} tile /> Готово
          </h2>
          <p className="text-[13px] text-text-mute">
            Ассет прошёл §2-gate · потрачено {gen.costCredits} кр.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {scheduleHref && (
              <Link href={scheduleHref} className="btn-lime">
                <CalendarPlus size={15} /> Запланировать публикацию
              </Link>
            )}
            <a href={gen.finalUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost">
              <ExternalLink size={14} /> Скачать / открыть
            </a>
          </div>
        </section>
      )}
    </div>
  );
}

const STEPS: Array<{ key: string; label: string }> = [
  { key: 'script', label: 'Сценарий' },
  { key: 'video', label: 'Видео' },
  { key: 'edit', label: 'Монтаж' },
  { key: 'done', label: 'Готово' },
];

function Stepper({ stage, status }: { stage: string; status: string }) {
  const order = ['script', 'video', 'edit', 'done'];
  const activeIdx = stage === 'error' ? -1 : order.indexOf(stage);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {STEPS.map((s, i) => {
        const done = activeIdx > i || stage === 'done';
        const active = activeIdx === i;
        return (
          <div key={s.key} className="flex items-center gap-1.5">
            <span
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] ${
                active
                  ? 'border-transparent bg-blue text-white'
                  : done
                    ? 'border-lime/40 bg-lime/10 text-lime'
                    : 'border-border-soft bg-white/[0.04] text-text-mute'
              }`}
            >
              {done && !active && <Check size={13} />}
              {s.label}
              {active && status === 'processing' ? '…' : ''}
            </span>
            {i < STEPS.length - 1 && <ChevronRight size={14} className="text-text-mute" />}
          </div>
        );
      })}
    </div>
  );
}
