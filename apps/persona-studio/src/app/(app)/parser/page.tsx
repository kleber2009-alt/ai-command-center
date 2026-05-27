import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ParserClient } from '@/components/parser/parser-client';
import { PageHero } from '@/components/shell/page-hero';

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
      <PageHero
        eyebrow="TREND INTELLIGENCE · VIRAL DISCOVER"
        title={
          <>
            Viral posts of competitors — <span className="italic text-gold">ready to work.</span>
          </>
        }
        description="Каждое утро AI смотрит, что взлетает у твоих конкурентов в Instagram, и оценивает каждый пост 1–10. Один клик — пост уходит в съёмку видео, затем в монтаж."
        meta={
          <>
            <div className="mono text-[9px] tracking-[0.28em] uppercase text-text-muted">In feed</div>
            <div className="font-serif text-[28px] text-gold leading-none">{items.length}</div>
          </>
        }
      />

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
