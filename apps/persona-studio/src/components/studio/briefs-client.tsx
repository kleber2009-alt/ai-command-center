'use client';

// Воркспейс — список брифов + создание с нуля (Мастер-ТЗ §4, Модуль B).
// «Клонировать формат» из Research создаёт бриф отдельно и ведёт сюда же.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Sparkles, Film } from 'lucide-react';
import { PageHero } from '@/components/shell/page-hero';
import { Icon3D } from '@/components/ui/icon3d';
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
    <div className="grid gap-6">
      <PageHero
        eyebrow="бриф → сценарий → видео → монтаж"
        title="Воркспейс"
        icon="workspace"
        extra={
          <button type="button" onClick={() => setCreating((v) => !v)} className="btn-primary">
            <Plus size={16} /> Новый бриф
          </button>
        }
      />

      {creating && (
        <div className="panel reveal grid gap-4 border-gold/40 p-6">
          <label className="grid gap-1.5">
            <span className="label">Тема / угол</span>
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="О чём видео — своими словами"
              className="input"
            />
          </label>
          {personas.length > 0 && (
            <label className="grid gap-1.5">
              <span className="label">Персона</span>
              <select value={personaId} onChange={(e) => setPersonaId(e.target.value)} className="input">
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
          {error && <p className="text-[13px] text-danger">{error}</p>}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={create} disabled={busy} className="btn-primary">
              {busy ? 'Создание…' : 'Создать и открыть'}
            </button>
            <button type="button" onClick={() => setCreating(false)} className="btn-ghost">
              Отмена
            </button>
          </div>
        </div>
      )}

      {initialBriefs.length === 0 ? (
        <div className="panel reveal grid justify-items-center gap-3 p-10 text-center">
          <Icon3D name="workspace" size={40} tile sway />
          <p className="text-[17px] font-semibold tracking-[-0.02em] text-text">Пока нет брифов</p>
          <p className="max-w-[52ch] text-[14px] leading-relaxed text-text-dim">
            Создайте бриф с нуля или нажмите «Клонировать формат» на находке в Research.
          </p>
        </div>
      ) : (
        <div className="stagger grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {initialBriefs.map((b) => {
            const last = b.generations[0];
            return (
              <button
                type="button"
                key={b.id}
                onClick={() => router.push(`/briefs/${b.id}`)}
                className="card-editorial grid gap-4 p-5 text-left"
              >
                <div className="flex items-start gap-3.5">
                  <div
                    className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-2xl border border-border-soft bg-white/[0.04]"
                    style={
                      b.source?.thumbnailUrl
                        ? { backgroundImage: `url(${b.source.thumbnailUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                        : undefined
                    }
                  >
                    {!b.source?.thumbnailUrl && <Sparkles size={18} className="text-gold" />}
                  </div>
                  <div className="grid min-w-0 gap-1.5">
                    <h2 className="line-clamp-2 text-[16px] font-semibold leading-snug tracking-[-0.02em] text-text">
                      {b.topic || 'Без темы'}
                    </h2>
                    <p className="text-[12px] text-text-mute">
                      {b.source?.authorUsername ? `@${b.source.authorUsername}` : 'с нуля'} · {b.lang.toUpperCase()}
                    </p>
                  </div>
                </div>
                <div className="mt-1 flex items-center gap-2 border-t border-border-soft pt-3">
                  {last ? (
                    <span className="flex items-center gap-1.5 rounded-full bg-white/[0.06] px-2.5 py-1 text-[12px] text-text-dim">
                      <Film size={12} /> {STAGE_LABEL[last.stage] ?? last.stage}
                    </span>
                  ) : (
                    <span className="rounded-full border border-border-soft px-2.5 py-1 text-[12px] text-text-mute">черновик</span>
                  )}
                  {last?.finalUrl && (
                    <span className="ml-auto rounded-full bg-lime px-2.5 py-0.5 text-[11px] font-semibold text-bg">
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
