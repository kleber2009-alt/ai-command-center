'use client';

import { useState } from 'react';
import { ArrowRight, Pencil, RefreshCw } from 'lucide-react';
import { Icon3D } from '@/components/ui/icon3d';
import { ParserSetup } from './parser-setup';
import { ParserResults } from './parser-results';
import { ParserHistory } from './parser-history';
import type {
  ParserConfigSerialized,
  ParserItemSerialized,
  ParserRunSerialized,
} from './types';

type Props = {
  initialConfig: ParserConfigSerialized | null;
  initialRun: ParserRunSerialized | null;
  initialItems: ParserItemSerialized[];
  initialHistory: ParserRunSerialized[];
};

export function ParserClient({ initialConfig, initialRun, initialItems, initialHistory }: Props) {
  const [config, setConfig] = useState<ParserConfigSerialized | null>(initialConfig);
  const [run, setRun] = useState<ParserRunSerialized | null>(initialRun);
  const [items, setItems] = useState<ParserItemSerialized[]>(initialItems);
  const [history, setHistory] = useState<ParserRunSerialized[]>(initialHistory);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setupOpen, setSetupOpen] = useState(!initialConfig);

  const hasConfig = Boolean(config);
  const hasTargets =
    config && (config.competitors.length > 0 || config.hashtags.length > 0);

  async function runParser() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch('/api/parser/run', { method: 'POST' });
      // Если роут пробил deadline и отдал пустое тело / HTML — res.json() ругается
      // «Unexpected end of JSON input». Парсим текст вручную и даём осмысленный errror.
      const raw = await res.text();
      let json: Record<string, unknown> = {};
      if (raw) {
        try { json = JSON.parse(raw); } catch { /* не JSON */ }
      }
      if (!res.ok) {
        const msg = (json.message as string) || (json.error as string) || raw.slice(0, 200) || `HTTP ${res.status}`;
        setError(msg);
        return;
      }
      if (!raw) {
        setError('Сервер вернул пустой ответ — вероятно, истёк таймаут парсинга. Попробуй ещё раз или уменьши число источников.');
        return;
      }
      // /api/parser/run возвращает items + summary в run-объекте
      const items = (json.items as ParserItemSerialized[] | undefined) || [];
      const errs = (json.errors as string[] | undefined) || [];
      // Предыдущая выдача уходит в «Историю поиска», новая встаёт наверх.
      const prevRun = run;
      if (prevRun?.id) {
        setHistory((h) => [prevRun, ...h.filter((r) => r.id !== prevRun.id)]);
      }
      setItems(items);
      setRun({
        id: (json.runId as string) || '',
        userId: config?.userId || '',
        status: 'completed',
        postsScanned: (json.postsScanned as number) || 0,
        reelsFound: (json.reels as number) || 0,
        carouselsFound: (json.carousels as number) || 0,
        claudeSummary: (json.summary as string) || null,
        errorMsg: errs.length ? errs.join(' | ') : null,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      });
      if (items.length === 0) {
        setError(
          'Парсер отработал, но не нашёл ни одного подходящего поста. Понизь пороги или добавь источников.',
        );
      }
    } catch (e) {
      setError((e as Error).message || 'network error');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="grid gap-8">
      {/* Сводка по конфигу — компактная, всегда видна */}
      {hasConfig && !setupOpen && (
        <div className="panel p-5 sm:p-6 flex flex-wrap items-start gap-4 justify-between reveal">
          <div className="grid gap-1 min-w-0 flex-1">
            <span className="label">ниша</span>
            <p className="text-[15px] font-medium text-text">
              {config?.nicheDescription || 'не задана'}
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2.5 text-[12px] text-text-dim [&>span]:rounded-full [&>span]:bg-white/[0.05] [&>span]:px-2.5 [&>span]:py-1 tabular-nums">
              <span>акк: <span className="text-text">{config?.competitors.length || 0}</span></span>
              <span>тег: <span className="text-text">{config?.hashtags.length || 0}</span></span>
              <span>дней: <span className="text-text">{config?.postedWithinDays}</span></span>
              <span>топ-R: <span className="text-text">{config?.reelsCount}</span></span>
              <span>топ-C: <span className="text-text">{config?.carouselsCount}</span></span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSetupOpen(true)}
              className="btn-ghost"
              disabled={running}
            >
              <Pencil className="h-4 w-4" />
              Изменить
            </button>
            <button
              type="button"
              onClick={runParser}
              className="btn-primary"
              disabled={running || !hasTargets}
              title={!hasTargets ? 'Добавь хотя бы один аккаунт или хэштег' : undefined}
            >
              {running && <RefreshCw className="h-4 w-4 animate-spin" />}
              {running ? 'Сканирую…' : 'Запустить парсер'}
              {!running && <ArrowRight className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}

      {/* Форма настройки */}
      {setupOpen && (
        <ParserSetup
          initial={config}
          onCancel={hasConfig ? () => setSetupOpen(false) : undefined}
          onSaved={(c) => {
            setConfig(c);
            setSetupOpen(false);
          }}
        />
      )}

      {/* Ошибка / статус */}
      {error && (
        <div className="rounded-2xl border border-pink/40 bg-pink/[0.06] px-4 py-3 text-[13px] text-pink fade-in">
          {error}
        </div>
      )}

      {/* Loading bar */}
      {running && (
        <div className="panel p-8 flex flex-col items-center gap-3 text-center fade-in">
          <Icon3D name="processing" size={44} tile sway />
          <span className="sec-num">/scan</span>
          <div className="text-[17px] font-semibold tracking-[-0.02em] text-text">
            Apify скрейпит, Claude оценивает… 60–90 секунд.
          </div>
        </div>
      )}

      {/* Summary от Claude */}
      {run?.claudeSummary && !running && (
        <div className="panel !border-lime/30 !bg-lime/[0.05] p-5 sm:p-6 reveal">
          <div className="mb-2 flex items-center gap-2.5">
            <Icon3D name="brain" size={20} tile="lime" />
            <span className="label !text-lime">наблюдение</span>
          </div>
          <p className="text-[15px] sm:text-[16px] leading-relaxed text-text">
            {run.claudeSummary}
          </p>
        </div>
      )}

      {/* Список */}
      {!running && (
        <ParserResults
          items={items}
          run={run}
          onItemUpdated={(updated) =>
            setItems((cur) => cur.map((i) => (i.id === updated.id ? updated : i)))
          }
          onItemRemoved={(id) => setItems((cur) => cur.filter((i) => i.id !== id))}
        />
      )}

      {/* История поиска — прошлые прогоны */}
      {!running && <ParserHistory runs={history} />}
    </div>
  );
}
