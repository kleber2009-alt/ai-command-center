import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { RadarsClient } from '@/components/research/radars-client';
import { PageHero } from '@/components/shell/page-hero';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Радары — Persona Studio' };

export default async function RadarsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');

  const radars = await prisma.researchRadar.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <div className="grid gap-8">
      <PageHero
        eyebrow="NICHE RADAR · BACKGROUND HUNT"
        title={
          <>
            Сохранённые ниши, которые <span className="italic text-gold">сами себя пополняют.</span>
          </>
        }
        description="Каждый радар — сохранённый поисковый запрос. Cron перезапускает его раз в сутки и копит свежие выбросы — открываешь и видишь «что новое залетело» с прошлого визита."
      />
      <RadarsClient
        initialRadars={radars.map((r) => ({
          id: r.id,
          niche: r.niche,
          intervalHrs: r.intervalHrs,
          enabled: r.enabled,
          lastRunAt: r.lastRunAt?.toISOString() ?? null,
          lastResultCount: r.lastResultIds.length,
          createdAt: r.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
