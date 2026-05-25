'use client';

import { useState } from 'react';
import type { ParserConfigSerialized } from './types';

type Props = {
  initial: ParserConfigSerialized | null;
  onSaved: (cfg: ParserConfigSerialized) => void;
  onCancel?: () => void;
};

export function ParserSetup({ initial, onSaved, onCancel }: Props) {
  const [niche, setNiche] = useState(initial?.nicheDescription || '');
  const [competitorsRaw, setCompetitorsRaw] = useState(
    initial?.competitors.join(', ') || '',
  );
  const [hashtagsRaw, setHashtagsRaw] = useState(initial?.hashtags.join(', ') || '');
  const [days, setDays] = useState(initial?.postedWithinDays ?? 7);
  const [reelsCount, setReelsCount] = useState(initial?.reelsCount ?? 5);
  const [carouselsCount, setCarouselsCount] = useState(initial?.carouselsCount ?? 5);
  const [minPlays, setMinPlays] = useState(initial?.minPlays ?? 0);
  const [minLikes, setMinLikes] = useState(initial?.minLikes ?? 0);
  const [minComments, setMinComments] = useState(initial?.minComments ?? 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parseList = (raw: string) =>
    raw
      .split(/[,\n\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body = {
        nicheDescription: niche.trim() || null,
        competitors: parseList(competitorsRaw),
        hashtags: parseList(hashtagsRaw),
        postedWithinDays: Number(days),
        reelsCount: Number(reelsCount),
        carouselsCount: Number(carouselsCount),
        minPlays: Number(minPlays),
        minLikes: Number(minLikes),
        minComments: Number(minComments),
      };
      const res = await fetch('/api/parser/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.message || json.error || `HTTP ${res.status}`);
        return;
      }
      onSaved(json.config);
    } catch (err) {
      setError((err as Error).message || 'network error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={save}
      className="border border-border p-5 sm:p-6 bg-surface grid gap-5"
    >
      <div className="flex items-baseline gap-3">
        <span className="sec-num">/01</span>
        <span className="sec-title">Настройка парсера</span>
        <span className="flex-1 border-b border-border translate-y-[-3px]" />
      </div>

      {/* Ниша */}
      <label className="grid gap-2">
        <span className="mono text-[10px] tracking-widest uppercase text-text-mute">
          Ниша · 1–2 предложения
        </span>
        <textarea
          rows={2}
          value={niche}
          onChange={(e) => setNiche(e.target.value)}
          placeholder="Например: коучинг продаж B2B, конфронтационный стиль, аудитория — РОПы и собственники."
          className="bg-bg border border-border px-3 py-2.5 font-serif text-[14px] leading-relaxed focus:outline-none focus:border-lime/60"
        />
        <span className="mono text-[9px] tracking-wider text-text-mute">
          Claude использует ниху как эталон при оценке fit-to-niche 1–10.
        </span>
      </label>

      {/* Источники */}
      <div className="grid sm:grid-cols-2 gap-5">
        <label className="grid gap-2">
          <span className="mono text-[10px] tracking-widest uppercase text-text-mute">
            Аккаунты конкурентов
          </span>
          <textarea
            rows={3}
            value={competitorsRaw}
            onChange={(e) => setCompetitorsRaw(e.target.value)}
            placeholder="@expert_one, @expert_two, @expert_three"
            className="bg-bg border border-border px-3 py-2.5 mono text-[12px] leading-relaxed focus:outline-none focus:border-lime/60"
          />
          <span className="mono text-[9px] tracking-wider text-text-mute">
            До 50. Через запятую, пробел или новую строку.
          </span>
        </label>

        <label className="grid gap-2">
          <span className="mono text-[10px] tracking-widest uppercase text-text-mute">
            Хэштеги ниши
          </span>
          <textarea
            rows={3}
            value={hashtagsRaw}
            onChange={(e) => setHashtagsRaw(e.target.value)}
            placeholder="#salescoaching, #b2bsales"
            className="bg-bg border border-border px-3 py-2.5 mono text-[12px] leading-relaxed focus:outline-none focus:border-lime/60"
          />
          <span className="mono text-[9px] tracking-wider text-text-mute">
            До 20. Будут парситься топ-посты по тегу.
          </span>
        </label>
      </div>

      {/* Тонкие настройки */}
      <details className="grid gap-4">
        <summary className="mono text-[10px] tracking-widest uppercase text-text-dim cursor-pointer">
          Тонкие настройки ▾
        </summary>

        <div className="grid sm:grid-cols-3 gap-4 mt-3">
          <NumberField label="Глубина (дней)" value={days} onChange={setDays} min={1} max={30} />
          <NumberField label="Топ рилсов" value={reelsCount} onChange={setReelsCount} min={1} max={20} />
          <NumberField label="Топ каруселей" value={carouselsCount} onChange={setCarouselsCount} min={1} max={20} />
        </div>

        <div className="grid sm:grid-cols-3 gap-4">
          <NumberField label="Мин. просмотров" value={minPlays} onChange={setMinPlays} min={0} />
          <NumberField label="Мин. лайков" value={minLikes} onChange={setMinLikes} min={0} />
          <NumberField label="Мин. комментариев" value={minComments} onChange={setMinComments} min={0} />
        </div>
      </details>

      {error && (
        <div className="border border-pink/40 bg-pink/5 p-3 mono text-[11px] text-pink">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border">
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'Сохраняю…' : initial ? 'Сохранить' : 'Сохранить и перейти к запуску →'}
        </button>
        {onCancel && (
          <button type="button" className="btn-ghost" onClick={onCancel} disabled={saving}>
            Отмена
          </button>
        )}
      </div>
    </form>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <label className="grid gap-2">
      <span className="mono text-[10px] tracking-widest uppercase text-text-mute">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        min={min}
        max={max}
        className="bg-bg border border-border px-3 py-2 mono text-[13px] focus:outline-none focus:border-lime/60"
      />
    </label>
  );
}
