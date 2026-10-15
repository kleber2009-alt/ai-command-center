'use client';

// Создание карусели из темы/текста — без парсера. Тот же POST
// /api/carousels/draft (caption-ветка): Claude режет тему на N слайдов под
// выбранный стиль (для скилл-стилей — по правилам скилла karusel), дальше
// редактор /carousels/new?draftId=….

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { StyleSelector } from './style-selector';

export function NewCarouselForm({ defaultStyle = 'skill-palii' }: { defaultStyle?: string }) {
  const router = useRouter();
  const [topic, setTopic] = useState('');
  const [slides, setSlides] = useState(8);
  const [style, setStyle] = useState(defaultStyle);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!topic.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/carousels/draft', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ caption: topic.trim(), slidesCount: slides, style }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.draftId) {
        setError(json.message || json.error || `HTTP ${res.status}`);
        return;
      }
      router.push(`/carousels/new?draftId=${json.draftId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'network_error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3">
      <textarea
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        rows={4}
        maxLength={3000}
        placeholder="Тема, тезисы, сценарий рилса или текст поста. Например: «5 промптов, которые заменят монтажёра»"
        className="w-full border border-border bg-surface px-3 py-2.5 text-[14px] leading-relaxed focus:outline-none focus:border-text-dim"
      />
      <StyleSelector value={style} onChange={setStyle} />
      <div className="flex flex-wrap items-center gap-3">
        <label className="mono text-[10px] tracking-[0.18em] uppercase text-text-mute flex items-center gap-2">
          слайдов
          <input
            type="number"
            min={3}
            max={20}
            value={slides}
            onChange={(e) => setSlides(Math.max(3, Math.min(20, Number(e.target.value) || 8)))}
            className="w-16 border border-border bg-surface px-2 py-1 text-text"
          />
        </label>
        <button
          type="submit"
          disabled={busy || !topic.trim()}
          className="border border-lime text-lime px-4 py-2 mono text-[11px] tracking-[0.18em] uppercase disabled:opacity-40 hover:bg-lime/[0.08] transition"
        >
          {busy ? 'Claude пишет слайды…' : 'Сделать карусель →'}
        </button>
        {error && <span className="mono text-[11px] text-red-400">{error}</span>}
      </div>
    </form>
  );
}
