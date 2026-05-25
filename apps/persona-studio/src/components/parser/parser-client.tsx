'use client';

import { useState } from 'react';
import { ParserSetup } from './parser-setup';
import { ParserResults } from './parser-results';
import type {
  ParserConfigSerialized,
  ParserItemSerialized,
  ParserRunSerialized,
} from './types';

type Props = {
  initialConfig: ParserConfigSerialized | null;
  initialRun: ParserRunSerialized | null;
  initialItems: ParserItemSerialized[];
};

export function ParserClient({ initialConfig, initialRun, initialItems }: Props) {
  const [config, setConfig] = useState<ParserConfigSerialized | null>(initialConfig);
  const [run, setRun] = useState<ParserRunSerialized | null>(initialRun);
  const [items, setItems] = useState<ParserItemSerialized[]>(initialItems);
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
      setItems(json.items || []);
      setRun({
        id: json.runId,
        userId: config?.userId || '',
        status: 'completed',
        postsScanned: json.postsScanned || 0,
        reelsFound: json.reels || 0,
        carouselsFound: json.carousels || 0,
        claudeSummary: json.summary || null,
        errorMsg: json.errors?.length ? json.errors.join(' | ') : null,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      });
      if ((json.items || []).length === 0) {
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
        <div className="border border-border p-4 sm:p-5 bg-surface flex flex-wrap items-start gap-4 justify-between">
          <div className="grid gap-1 min-w-0 flex-1">
            <span className="mono text-[10px] tracking-widest uppercase text-text-mute">ниша</span>
            <p className="font-serif text-[14px] sm:text-[15px] text-text">
              {config?.nicheDescription || 'не задана'}
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 mono text-[10px] tracking-wider uppercase text-text-dim">
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
              Изменить
            </button>
            <button
              type="button"
              onClick={runParser}
              className="btn-primary"
              disabled={running || !hasTargets}
              title={!hasTargets ? 'Добавь хотя бы один аккаунт или хэштег' : undefined}
            >
              {running ? 'Сканирую…' : 'Запустить парсер →'}
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
        <div className="border border-pink/40 bg-pink/5 p-4 mono text-[12px] text-pink">
          {error}
        </div>
      )}

      {/* Loading bar */}
      {running && (
        <div className="border border-border bg-surface p-6 text-center">
          <div className="mono text-[10px] tracking-widest uppercase text-text-mute mb-2">/scan</div>
          <div className="font-serif italic text-[18px] text-text-dim">
            Apify скрейпит, Claude оценивает… 60–90 секунд.
          </div>
        </div>
      )}

      {/* Summary от Claude */}
      {run?.claudeSummary && !running && (
        <div className="border-l-2 border-lime pl-4 py-3">
          <div className="mono text-[10px] tracking-widest uppercase text-lime mb-2">наблюдение</div>
          <p className="font-serif italic text-[15px] sm:text-[16px] text-text">
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
    </div>
  );
}
