'use client';

import { Icon3D } from '@/components/ui/icon3d';
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
      <div className="rounded-[24px] border border-dashed border-white/15 bg-white/[0.03] p-10 flex flex-col items-center text-center fade-in">
        <Icon3D name="radars" size={44} tile />
        <div className="sec-num my-3">Пусто</div>
        <div className="text-[19px] font-semibold tracking-[-0.02em] text-text mb-2">
          Парсер ещё не запускался.
        </div>
        <p className="text-[14px] text-text-dim max-w-[42ch]">
          Сохрани настройки и нажми «Запустить парсер» — Аня соберёт топ-постов и оценит их под твою нишу.
        </p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-[24px] border border-dashed border-white/15 bg-white/[0.03] p-10 flex flex-col items-center text-center fade-in">
        <Icon3D name="radars" size={44} tile />
        <div className="sec-num my-3">Пусто</div>
        <div className="text-[19px] font-semibold tracking-[-0.02em] text-text mb-2">
          Ни одного поста по текущим порогам.
        </div>
        <p className="text-[14px] text-text-dim">
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
          <div className="flex items-center gap-3">
            <span className="sec-num">/02</span>
            <span className="sec-title">Reels · топ {reels.length}</span>
            <span className="flex-1 h-px bg-border-soft" />
          </div>
          <div className="grid grid-cols-1 gap-3 stagger">
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
          <div className="flex items-center gap-3">
            <span className="sec-num">/03</span>
            <span className="sec-title">Карусели · топ {carousels.length}</span>
            <span className="flex-1 h-px bg-border-soft" />
          </div>
          <div className="grid grid-cols-1 gap-3 stagger">
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
