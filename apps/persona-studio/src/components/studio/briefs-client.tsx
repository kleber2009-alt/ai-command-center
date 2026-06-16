'use client';

// Воркспейс — список брифов + создание с нуля (Мастер-ТЗ §4, Модуль B).
// «Клонировать формат» из Research создаёт бриф отдельно и ведёт сюда же.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Sparkles, Film } from 'lucide-react';
import type { BriefView } from '@/lib/studio/types';

type PersonaOpt = { id: string; name: string; isDefault: boolean };

const STAGE_LABEL: Record<string, string> = {
  script: 'сценарий',
  voice: 'голос',
  video: 'видео',
  edit: 'монтаж',
  done: 'готово',
  error: 'ошибка',
};

export function BriefsClient({
  initialBriefs,
  personas,
}: {
  initialBriefs: BriefView[];
  personas: PersonaOpt[];
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [topic, setTopic] = useState('');
  const [personaId, setPersonaId] = useState<string>(personas.find((p) => p.isDefault)?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/briefs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topic.trim() || null, personaId: personaId || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'create_failed');
      router.push(`/briefs/${data.brief.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-5">
      <header className="flex items-end justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="font-serif text-2xl text-text">Воркспейс</h1>
          <p className="mono text-[11px] tracking-widest uppercase text-text-mute">
            бриф → сценарий → видео → монтаж
          </p>
        </div>
        <button
          onClick={() => setCreating((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-2 border border-gold/60 mono text-[10px] tracking-widest uppercase text-gold hover:bg-gold/10"
        >
          <Plus size={13} /> Новый бриф
        </button>
      </header>

      {creating && (
        <div className="border border-gold/40 bg-surface p-4 grid gap-3">
          <label className="grid gap-1.5">
            <span className="mono text-[9px] tracking-widest uppercase text-text-mute">Тема / угол</span>
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="О чём видео — своими словами"
              className="w-full bg-bg border border-border px-3 py-2 font-serif text-[14px] text-text placeholder:text-text-mute focus:border-gold outline-none"
            />
          </label>
          {personas.length > 0 && (
            <label className="grid gap-1.5">
              <span className="mono text-[9px] tracking-widest uppercase text-text-mute">Персона</span>
              <select
                value={personaId}
                onChange={(e) => setPersonaId(e.target.value)}
                className="bg-bg border border-border px-3 py-2 font-serif text-[13px] text-text focus:border-gold outline-none"
              >
                <option value="">— без персоны —</option>
                {personas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.isDefault ? ' (по умолчанию)' : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
          {error && <p className="mono text-[11px] text-pink">{error}</p>}
          <div className="flex items-center gap-3">
            <button
              onClick={create}
              disabled={busy}
              className="px-5 py-2 border border-gold bg-gold/10 mono text-[10px] tracking-widest uppercase text-gold hover:bg-gold/20 disabled:opacity-50"
            >
              {busy ? 'Создание…' : 'Создать и открыть'}
            </button>
            <button
              onClick={() => setCreating(false)}
              className="mono text-[10px] tracking-widest uppercase text-text-mute hover:text-text underline"
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      {initialBriefs.length === 0 ? (
        <div className="border border-border-soft bg-surface p-10 text-center grid gap-2">
          <p className="mono text-[11px] tracking-widest uppercase text-text-mute">Пока нет брифов</p>
          <p className="font-serif text-[13px] text-text-dim">
            Создайте бриф с нуля или нажмите «Клонировать формат» на находке в Research.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {initialBriefs.map((b) => {
            const last = b.generations[0];
            return (
              <button
                key={b.id}
                onClick={() => router.push(`/briefs/${b.id}`)}
                className="text-left border border-border bg-surface p-4 grid gap-3 hover:border-gold/50"
              >
                <div className="flex items-start gap-3">
                  <div
                    className="w-12 h-12 shrink-0 border border-border-soft bg-bg grid place-items-center"
                    style={
                      b.source?.thumbnailUrl
                        ? { backgroundImage: `url(${b.source.thumbnailUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                        : undefined
                    }
                  >
                    {!b.source?.thumbnailUrl && <Sparkles size={16} className="text-text-mute" />}
                  </div>
                  <div className="min-w-0 grid gap-1">
                    <h2 className="font-serif text-[14px] text-text line-clamp-2">
                      {b.topic || 'Без темы'}
                    </h2>
                    <p className="mono text-[9px] tracking-widest uppercase text-text-mute">
                      {b.source?.authorUsername ? `@${b.source.authorUsername}` : 'с нуля'} · {b.lang.toUpperCase()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-1 border-t border-border-soft mt-1">
                  {last ? (
                    <span className="flex items-center gap-1 mono text-[9px] tracking-widest uppercase text-text-dim">
                      <Film size={11} /> {STAGE_LABEL[last.stage] ?? last.stage}
                    </span>
                  ) : (
                    <span className="mono text-[9px] tracking-widest uppercase text-text-mute">черновик</span>
                  )}
                  {last?.finalUrl && (
                    <span className="mono text-[8px] tracking-widest uppercase text-gold border border-gold/50 px-1 py-0.5 ml-auto">
                      final
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
