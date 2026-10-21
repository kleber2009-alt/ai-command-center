'use client';

// Создание карусели из темы/текста — без парсера. Тот же POST
// /api/carousels/draft (caption-ветка): Claude режет тему на N слайдов под
// выбранный стиль (для скилл-стилей — по правилам скилла karusel), дальше
// редактор /carousels/new?draftId=….

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Loader2, Sparkles } from 'lucide-react';
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
    <form onSubmit={submit} className="panel grid gap-4 p-5 sm:p-6">
      <textarea
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        rows={4}
        maxLength={3000}
        placeholder="Тема, тезисы, сценарий рилса или текст поста. Например: «5 промптов, которые заменят монтажёра»"
        className="input"
      />
      <StyleSelector value={style} onChange={setStyle} />
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2.5 text-[13px] text-text-dim">
          слайдов
          <input
            type="number"
            min={3}
            max={20}
            value={slides}
            onChange={(e) => setSlides(Math.max(3, Math.min(20, Number(e.target.value) || 8)))}
            className="input !w-20 !rounded-full !px-3.5 !py-2 text-center tabular-nums"
          />
        </label>
        <button
          type="submit"
          disabled={busy || !topic.trim()}
          className="btn-primary"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
          {busy ? 'Claude пишет слайды…' : 'Сделать карусель'}
          {!busy && <ArrowRight size={15} />}
        </button>
        {error && <span className="text-[13px] text-danger">{error}</span>}
      </div>
    </form>
  );
}
