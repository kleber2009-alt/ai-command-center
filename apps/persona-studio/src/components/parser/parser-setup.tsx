'use client';

import { useState } from 'react';
import { ArrowRight, ChevronDown } from 'lucide-react';
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
  const [minPlays, setMinPlays] = useState(initial?.minPlays ?? 100000);
  const [minLikes, setMinLikes] = useState(initial?.minLikes ?? 1000);
  const [minComments, setMinComments] = useState(initial?.minComments ?? 1000);
  const [minShares, setMinShares] = useState(initial?.minShares ?? 1000);
  const [minCarouselLikes, setMinCarouselLikes] = useState(initial?.minCarouselLikes ?? 1000);
  const [minCarouselComments, setMinCarouselComments] = useState(initial?.minCarouselComments ?? 1000);
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
        minShares: Number(minShares),
        minCarouselLikes: Number(minCarouselLikes),
        minCarouselComments: Number(minCarouselComments),
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
      className="panel p-5 sm:p-7 grid gap-5 reveal"
    >
      <div className="flex items-center gap-3">
        <span className="sec-num">/01</span>
        <span className="sec-title">Настройка парсера</span>
        <span className="flex-1 h-px bg-border-soft" />
      </div>

      {/* Ниша */}
      <label className="grid gap-2">
        <span className="label">
          Ниша · 1–2 предложения
        </span>
        <textarea
          rows={2}
          value={niche}
          onChange={(e) => setNiche(e.target.value)}
          placeholder="Например: коучинг продаж B2B, конфронтационный стиль, аудитория — РОПы и собственники."
          className="input !min-h-0"
        />
        <span className="text-[12px] text-text-mute">
          Claude использует ниху как эталон при оценке fit-to-niche 1–10.
        </span>
      </label>

      {/* Источники */}
      <div className="grid sm:grid-cols-2 gap-5">
        <label className="grid gap-2">
          <span className="label">
            Аккаунты конкурентов
          </span>
          <textarea
            rows={3}
            value={competitorsRaw}
            onChange={(e) => setCompetitorsRaw(e.target.value)}
            placeholder="@expert_one, @expert_two, @expert_three"
            className="input !min-h-0"
          />
          <span className="text-[12px] text-text-mute">
            До 50. Через запятую, пробел или новую строку.
          </span>
        </label>

        <label className="grid gap-2">
          <span className="label">
            Хэштеги ниши
          </span>
          <textarea
            rows={3}
            value={hashtagsRaw}
            onChange={(e) => setHashtagsRaw(e.target.value)}
            placeholder="#salescoaching, #b2bsales"
            className="input !min-h-0"
          />
          <span className="text-[12px] text-text-mute">
            До 20. Будут парситься топ-посты по тегу.
          </span>
        </label>
      </div>

      {/* Тонкие настройки */}
      <details className="grid gap-4">
        <summary className="inline-flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-full border border-border-soft bg-white/[0.04] px-3.5 py-1.5 text-[13px] text-text-dim transition-colors hover:bg-white/[0.07] [&::-webkit-details-marker]:hidden">
          Тонкие настройки
          <ChevronDown className="h-3.5 w-3.5" />
        </summary>

        <div className="grid sm:grid-cols-3 gap-4 mt-3">
          <NumberField label="Глубина (дней)" value={days} onChange={setDays} min={1} max={30} />
          <NumberField label="Топ рилсов" value={reelsCount} onChange={setReelsCount} min={1} max={20} />
          <NumberField label="Топ каруселей" value={carouselsCount} onChange={setCarouselsCount} min={1} max={20} />
        </div>

        <div className="label !text-text-dim mt-2">Reels</div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <NumberField label="Мин. просмотров" value={minPlays} onChange={setMinPlays} min={0} step={10000} />
          <NumberField label="Мин. лайков" value={minLikes} onChange={setMinLikes} min={0} />
          <NumberField label="Мин. комментариев" value={minComments} onChange={setMinComments} min={0} step={100} />
          <NumberField label="Мин. репостов" value={minShares} onChange={setMinShares} min={0} step={100} />
        </div>
        <p className="text-[12px] leading-relaxed text-text-mute">
          Reels дефолт: 100k просмотров / 1k лайков / 1k комментариев / 1k репостов. Apify не у всех постов отдаёт счётчик репостов — посты без этого поля проходят фильтр.
        </p>

        <div className="label !text-text-dim mt-2">Carousels</div>
        <div className="grid sm:grid-cols-2 gap-4">
          <NumberField label="Мин. лайков (карусели)" value={minCarouselLikes} onChange={setMinCarouselLikes} min={0} step={100} />
          <NumberField label="Мин. комментариев (карусели)" value={minCarouselComments} onChange={setMinCarouselComments} min={0} step={10} />
        </div>
        <p className="text-[12px] leading-relaxed text-text-mute">
          Carousels дефолт: 1k лайков / 1k комментариев — тот же бар что у рилсов. У каруселей нет plays и shares, поэтому фильтр идёт только по этим двум метрикам.
        </p>
      </details>

      {error && (
        <div className="rounded-2xl border border-pink/40 bg-pink/[0.06] px-4 py-2.5 text-[13px] text-pink">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-border-soft">
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'Сохраняю…' : initial ? 'Сохранить' : 'Сохранить и перейти к запуску'}
          {!saving && !initial && <ArrowRight className="h-4 w-4" />}
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
  step,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <label className="grid gap-2">
      <span className="label">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        min={min}
        max={max}
        step={step}
        className="input tabular-nums"
      />
    </label>
  );
}
