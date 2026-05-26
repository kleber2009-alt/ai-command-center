'use client';

import { ParserReelCard } from './parser-reel-card';
import type { ParserItemSerialized, ParserRunSerialized } from './types';

type Props = {
  items: ParserItemSerialized[];
  run: ParserRunSerialized | null;
  onItemUpdated: (it: ParserItemSerialized) => void;
  onItemRemoved: (id: string) => void;
};

export function ParserResults({ items, run, onItemUpdated, onItemRemoved }: Props) {
  if (!run) {
    return (
      <div className="border border-border-2 border-dashed p-10 text-center bg-surface">
        <div className="sec-num mb-3">/EMPTY</div>
        <div className="font-serif italic text-[20px] text-text-dim mb-3">
          Парсер ещё не запускался.
        </div>
        <p className="font-serif text-[14px] text-text-mute max-w-[42ch] mx-auto">
          Сохрани настройки и нажми «Запустить парсер» — Аня соберёт топ-постов и оценит их под твою нишу.
        </p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="border border-border-2 border-dashed p-10 text-center bg-surface">
        <div className="sec-num mb-3">/EMPTY</div>
        <div className="font-serif italic text-[20px] text-text-dim mb-2">
          Ни одного поста по текущим порогам.
        </div>
        <p className="font-serif text-[13px] text-text-mute">
          Apify посмотрел <span className="text-text">{run.postsScanned}</span> постов. Понизь пороги или добавь больше источников.
        </p>
      </div>
    );
  }

  const reels = items.filter((i) => i.kind === 'reel');
  const carousels = items.filter((i) => i.kind === 'carousel');

  return (
    <div className="grid gap-8">
      {reels.length > 0 && (
        <section className="grid gap-4">
          <div className="flex items-baseline gap-3">
            <span className="sec-num">/02</span>
            <span className="sec-title">Reels · топ {reels.length}</span>
            <span className="flex-1 border-b border-border translate-y-[-3px]" />
          </div>
          <div className="grid grid-cols-1 gap-2">
            {reels.map((it) => (
              <ParserReelCard
                key={it.id}
                item={it}
                onUpdated={onItemUpdated}
                onRemoved={onItemRemoved}
              />
            ))}
          </div>
        </section>
      )}

      {carousels.length > 0 && (
        <section className="grid gap-4">
          <div className="flex items-baseline gap-3">
            <span className="sec-num">/03</span>
            <span className="sec-title">Carousels · топ {carousels.length}</span>
            <span className="flex-1 border-b border-border translate-y-[-3px]" />
          </div>
          <div className="grid grid-cols-1 gap-2">
            {carousels.map((it) => (
              <ParserReelCard
                key={it.id}
                item={it}
                onUpdated={onItemUpdated}
                onRemoved={onItemRemoved}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
