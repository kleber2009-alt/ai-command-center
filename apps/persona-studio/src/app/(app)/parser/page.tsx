import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ParserClient } from '@/components/parser/parser-client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Parser — Persona Studio' };

export default async function ParserPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');

  const config = await prisma.parserConfig.findUnique({
    where: { userId: user.id },
  });

  const lastRun = await prisma.parserRun.findFirst({
    where: { userId: user.id, status: 'completed' },
    orderBy: { startedAt: 'desc' },
  });

  const items = lastRun
    ? await prisma.parserItem.findMany({
        where: { runId: lastRun.id, status: { not: 'dismissed' } },
        orderBy: [{ fitScore: 'desc' }, { velocityScore: 'desc' }],
      })
    : [];

  return (
    <div className="grid gap-8">
      <header>
        <div className="flex items-baseline gap-3 mb-4">
          <span className="sec-num">/00</span>
          <span className="sec-title">Parser · Viral Discover</span>
          <span className="flex-1 border-b border-border translate-y-[-3px]" />
        </div>
        <h1 className="font-serif text-[28px] sm:text-[36px] md:text-[44px] leading-tight max-w-[26ch]">
          Залётные посты конкурентов — <span className="italic text-warm">сразу в работу.</span>
        </h1>
        <p className="font-serif text-[14px] sm:text-[16px] text-text-dim mt-3 max-w-[64ch]">
          Аня каждое утро смотрит, что взлетает у твоих конкурентов в Instagram, и оценивает каждый
          пост 1–10 — насколько он сработает в твоём блоге. Один клик — и пост уходит в съёмку видео,
          а затем в монтаж.
        </p>
      </header>

      <ParserClient
        initialConfig={
          config
            ? {
                ...config,
                createdAt: config.createdAt.toISOString(),
                updatedAt: config.updatedAt.toISOString(),
              }
            : null
        }
        initialRun={
          lastRun
            ? {
                ...lastRun,
                startedAt: lastRun.startedAt.toISOString(),
                completedAt: lastRun.completedAt?.toISOString() ?? null,
              }
            : null
        }
        initialItems={items.map((it) => ({
          ...it,
          createdAt: it.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
