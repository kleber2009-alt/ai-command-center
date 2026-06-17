'use client';

// Воркспейс генерации одного брифа (Мастер-ТЗ §4, Модуль B). Ведёт пользователя
// по стадиям: сценарий (Claude + §2 similarity-gate) → видео (HeyGen/OmniHuman)
// → монтаж (Submagic, опц.) → финал. Стадии video/edit продвигаются поллингом
// GET /api/generations/:id (advanceGeneration на сервере).

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Wand2, Film, Scissors, CheckCircle2, AlertTriangle, RefreshCw, Loader2, CalendarPlus } from 'lucide-react';
import type { BriefView, GenerationView, SimilarityGate } from '@/lib/studio/types';

type PersonaReady = { hasAvatar: boolean; hasVoice: boolean; name: string | null };

const GATE_UI: Record<SimilarityGate, { label: string; cls: string }> = {
  pass: { label: 'оригинально', cls: 'text-lime border-lime/50' },
  warn: { label: 'похоже на источник', cls: 'text-gold border-gold/50' },
  block: { label: 'слишком похоже — переформулируй', cls: 'text-pink border-pink/60' },
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
      if (!res.ok) throw new Error(data.error || 'failed');
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
      if (!res.ok) throw new Error(data.error || 'save_failed');
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
    <div className="grid gap-5 max-w-3xl">
      <header className="grid gap-1">
        <Link href="/briefs" className="mono text-[10px] tracking-widest uppercase text-text-mute hover:text-text">
          ← воркспейс
        </Link>
        <h1 className="font-serif text-2xl text-text">{brief.topic || 'Бриф'}</h1>
        <p className="mono text-[11px] tracking-widest uppercase text-text-mute">
          {brief.source?.authorUsername ? `вдохновение @${brief.source.authorUsername} · ` : ''}
          {brief.format || 'формат —'} · {brief.lang.toUpperCase()}
          {brief.lengthSec ? ` · ~${brief.lengthSec}с` : ''}
        </p>
      </header>

      {/* Пайплайн-степпер */}
      <Stepper stage={gen?.stage ?? 'script'} status={gen?.status ?? 'pending'} />

      {/* Баланс + смета (Модуль H, §10) */}
      {balance != null && costs && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border border-border-soft bg-surface px-3 py-2">
          <span className="mono text-[10px] tracking-widest uppercase text-text-dim">
            Баланс <span className="text-gold">{balance}</span> кр.
          </span>
          <span className="mono text-[9px] tracking-widest uppercase text-text-mute">
            сценарий {costs.script} · видео {costs.video} · монтаж {costs.montage}
          </span>
          <Link
            href="/billing"
            className="ml-auto mono text-[9px] tracking-widest uppercase text-text-mute hover:text-gold underline"
          >
            пополнить
          </Link>
        </div>
      )}

      {upsell && (
        <div className="border border-pink/50 bg-surface p-3 flex items-center gap-3">
          <span className="mono text-[11px] text-pink flex-1">
            Недостаточно токенов для этой стадии.
          </span>
          <Link
            href="/billing"
            className="px-3 py-1.5 border border-gold bg-gold/10 mono text-[10px] tracking-widest uppercase text-gold hover:bg-gold/20"
          >
            Пополнить баланс
          </Link>
        </div>
      )}

      {error && !upsell && (
        <div className="border border-pink/40 bg-surface p-3 mono text-[11px] text-pink">{error}</div>
      )}

      {/* Стадия 1 — сценарий */}
      <section className="border border-border bg-surface p-4 grid gap-3">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-serif text-[15px] text-text">
            <Wand2 size={15} className="text-gold" /> Сценарий
          </h2>
          {gen?.gate && (
            <span className={`mono text-[9px] tracking-widest uppercase border px-1.5 py-0.5 ${GATE_UI[gate ?? 'pass'].cls}`}>
              {GATE_UI[gate ?? 'pass'].label}
              {gen.similarity != null ? ` · ${gen.similarity}` : ''}
            </span>
          )}
        </div>

        {!gen ? (
          <button
            onClick={genScript}
            disabled={busy === 'script' || !canAfford(costs?.script)}
            title={!canAfford(costs?.script) ? 'Недостаточно токенов' : ''}
            className="justify-self-start flex items-center gap-2 px-5 py-2 border border-gold bg-gold/10 mono text-[10px] tracking-widest uppercase text-gold hover:bg-gold/20 disabled:opacity-50"
          >
            {busy === 'script' ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
            Сгенерировать сценарий{costs ? ` · ${costs.script} кр` : ''}
          </button>
        ) : (
          <>
            <textarea
              value={script}
              onChange={(e) => setScript(e.target.value)}
              rows={8}
              disabled={gen.stage !== 'script'}
              className="w-full bg-bg border border-border px-3 py-2 font-serif text-[13px] leading-relaxed text-text focus:border-gold outline-none resize-y disabled:opacity-70"
            />
            {gen.stage === 'script' && (
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={saveScript}
                  disabled={busy === 'save' || script === gen.script}
                  className="mono text-[10px] tracking-widest uppercase text-text-dim hover:text-text underline disabled:opacity-40"
                >
                  Сохранить правку
                </button>
                <button
                  onClick={genScript}
                  disabled={busy === 'script'}
                  className="flex items-center gap-1 mono text-[10px] tracking-widest uppercase text-text-mute hover:text-text"
                >
                  <RefreshCw size={11} /> Перегенерировать
                </button>
                <button
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
                  className="ml-auto flex items-center gap-2 px-5 py-2 border border-gold bg-gold/10 mono text-[10px] tracking-widest uppercase text-gold hover:bg-gold/20 disabled:opacity-40"
                >
                  <Film size={13} /> Снять видео{costs ? ` · ${costs.video} кр` : ''}
                </button>
              </div>
            )}
          </>
        )}

        {gen?.stage === 'script' && !personaOk && (
          <p className="mono text-[10px] text-text-mute">
            Для видео нужна персона с аватаром и голосом.{' '}
            <Link href="/personas" className="text-gold underline">
              Настроить персону
            </Link>
            {personaReady.name ? ` (${personaReady.name}: ${personaReady.hasAvatar ? '' : 'нет аватара'} ${personaReady.hasVoice ? '' : 'нет голоса'})` : ''}
          </p>
        )}
      </section>

      {/* Стадия 2/3 — видео + монтаж */}
      {gen && gen.stage !== 'script' && (
        <section className="border border-border bg-surface p-4 grid gap-3">
          <h2 className="flex items-center gap-2 font-serif text-[15px] text-text">
            <Film size={15} className="text-gold" /> Видео {gen.stage === 'edit' && '· монтаж'}
          </h2>

          {gen.status === 'processing' && (
            <div className="flex items-center gap-2 mono text-[11px] tracking-widest uppercase text-text-dim">
              <Loader2 size={14} className="animate-spin" />
              {gen.stage === 'edit' ? 'Монтаж в Submagic…' : 'Рендер видео…'} (обновляется автоматически)
            </div>
          )}

          {gen.stage === 'error' && (
            <div className="flex items-center gap-2 mono text-[11px] text-pink">
              <AlertTriangle size={14} /> {gen.errorMsg || 'Ошибка'}
            </div>
          )}

          {(videoReady || gen.finalUrl) && (
            <video
              src={gen.finalUrl || gen.videoUrl || undefined}
              controls
              playsInline
              className="w-full max-w-xs border border-border-soft bg-black aspect-[9/16] object-contain"
            />
          )}

          {videoReady && gen.stage === 'video' && (
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={montage}
                disabled={busy === 'montage' || !canAfford(costs?.montage)}
                title={!canAfford(costs?.montage) ? 'Недостаточно токенов' : ''}
                className="flex items-center gap-2 px-4 py-2 border border-gold bg-gold/10 mono text-[10px] tracking-widest uppercase text-gold hover:bg-gold/20 disabled:opacity-50"
              >
                <Scissors size={13} /> Смонтировать{costs ? ` · ${costs.montage} кр` : ''}
              </button>
              <button
                onClick={finalize}
                disabled={busy === 'finalize'}
                className="mono text-[10px] tracking-widest uppercase text-text-dim hover:text-text underline disabled:opacity-50"
              >
                Использовать как финал
              </button>
            </div>
          )}
        </section>
      )}

      {/* Финал */}
      {gen?.stage === 'done' && gen.finalUrl && (
        <section className="border border-lime/40 bg-surface p-4 grid gap-2">
          <h2 className="flex items-center gap-2 font-serif text-[15px] text-text">
            <CheckCircle2 size={15} className="text-lime" /> Готово
          </h2>
          <p className="mono text-[10px] tracking-widest uppercase text-text-mute">
            Ассет прошёл §2-gate · потрачено {gen.costCredits} кр.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            {scheduleHref && (
              <Link
                href={scheduleHref}
                className="flex items-center gap-2 px-4 py-2 border border-lime/60 bg-lime/10 mono text-[10px] tracking-widest uppercase text-lime hover:bg-lime/20"
              >
                <CalendarPlus size={13} /> Запланировать публикацию
              </Link>
            )}
            <a
              href={gen.finalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mono text-[10px] tracking-widest uppercase text-gold underline"
            >
              Скачать / открыть
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
    <div className="flex items-center gap-2">
      {STEPS.map((s, i) => {
        const done = activeIdx > i || stage === 'done';
        const active = activeIdx === i;
        return (
          <div key={s.key} className="flex items-center gap-2">
            <span
              className={`mono text-[9px] tracking-widest uppercase px-2 py-1 border ${
                active
                  ? 'border-gold text-gold'
                  : done
                    ? 'border-lime/40 text-lime'
                    : 'border-border-soft text-text-mute'
              }`}
            >
              {s.label}
              {active && status === 'processing' ? '…' : ''}
            </span>
            {i < STEPS.length - 1 && <span className="text-text-mute">·</span>}
          </div>
        );
      })}
    </div>
  );
}
