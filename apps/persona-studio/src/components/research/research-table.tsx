'use client';

// Табличный вид выдачи (ТЗ §5 «переключатель Карточки / Таблица»).
// Компактное представление с теми же метриками что и карточка, но в
// сортируемых колонках. Используется как альтернатива grid'у.

import Link from 'next/link';
import type { ResearchReelView } from './types';

const fmt = (n: number) => {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
};

function relDate(iso: string | null): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  const d = Math.floor(ms / 86_400_000);
  if (d < 1) return 'сегодня';
  if (d < 7) return `${d}д`;
  const w = Math.floor(d / 7);
  if (w < 4) return `${w}нед`;
  const m = Math.floor(d / 30);
  if (m < 12) return `${m}мес`;
  return `${Math.floor(d / 365)}г`;
}

function viralityClass(v: number | null): string {
  if (v == null) return 'text-text-mute';
  if (v >= 10) return 'text-gold';
  if (v >= 3) return 'text-lime';
  return 'text-text';
}

export function ResearchTable({ reels }: { reels: ResearchReelView[] }) {
  return (
    <div className="border border-border bg-surface overflow-x-auto">
      <table className="w-full text-left">
        <thead className="bg-bg border-b border-border-soft">
          <tr className="mono text-[9px] tracking-widest uppercase text-text-mute">
            <Th>#</Th>
            <Th>🔥×</Th>
            <Th>Автор</Th>
            <Th align="right">Просм.</Th>
            <Th align="right">Лайки</Th>
            <Th align="right">Комм.</Th>
            <Th align="right">Реп.</Th>
            <Th align="right">ER%</Th>
            <Th align="right">VS</Th>
            <Th align="right">Дата</Th>
            <Th>Описание</Th>
            <Th></Th>
          </tr>
        </thead>
        <tbody>
          {reels.map((r, i) => (
            <tr key={r.id} className="border-b border-border-soft hover:bg-bg">
              <Td className="mono text-[10px] text-text-mute">{i + 1}</Td>
              <Td className={`mono text-[12px] tracking-wider ${viralityClass(r.virality)}`}>
                {r.virality != null ? `${r.virality.toFixed(1)}×` : '—'}
              </Td>
              <Td>
                <Link
                  href={`/research/author/${r.author.username}`}
                  className="mono text-[11px] tracking-wider text-text hover:text-lime"
                >
                  @{r.author.username}
                </Link>
              </Td>
              <Td align="right" className="mono text-[11px] text-text">{fmt(r.views)}</Td>
              <Td align="right" className="mono text-[11px] text-text-dim">{fmt(r.likes)}</Td>
              <Td align="right" className="mono text-[11px] text-text-dim">{fmt(r.comments)}</Td>
              <Td align="right" className="mono text-[11px] text-text-dim">
                {r.shares > 0 ? fmt(r.shares) : '—'}
              </Td>
              <Td align="right" className="mono text-[11px] text-cyan">
                {r.engagementRate != null ? r.engagementRate.toFixed(1) : '—'}
              </Td>
              <Td align="right" className="mono text-[11px] text-text-dim">
                {r.viralScore != null ? r.viralScore.toFixed(0) : '—'}
              </Td>
              <Td align="right" className="mono text-[10px] text-text-mute">{relDate(r.postedAt)}</Td>
              <Td className="font-serif text-[12.5px] text-text-dim max-w-[40ch] truncate">
                {r.caption || '—'}
              </Td>
              <Td>
                <Link
                  href={`/research/${r.id}`}
                  className="mono text-[9px] tracking-widest uppercase text-text-mute hover:text-gold whitespace-nowrap"
                >
                  Анализ →
                </Link>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th
      className={`px-2 py-2 ${align === 'right' ? 'text-right' : 'text-left'} whitespace-nowrap`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = 'left',
  className = '',
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
  className?: string;
}) {
  return (
    <td
      className={`px-2 py-2 ${align === 'right' ? 'text-right' : 'text-left'} ${className}`}
    >
      {children}
    </td>
  );
}
