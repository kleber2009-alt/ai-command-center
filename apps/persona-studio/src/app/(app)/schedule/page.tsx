import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PageHero } from '@/components/shell/page-hero';
import { ScheduleClient } from '@/components/schedule/schedule-client';
import { postmypostConfigured } from '@/lib/publish/postmypost';
import { getBotUsername } from '@/lib/publish/telegram-channel';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Schedule — Persona Studio' };

export default async function SchedulePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');

  const [posts, accounts] = await Promise.all([
    prisma.scheduledPost.findMany({
      where: { userId: user.id },
      orderBy: { scheduledAt: 'desc' },
      take: 200,
      include: {
        targets: {
          include: { socialAccount: { select: { platform: true, displayName: true } } },
        },
      },
    }),
    prisma.socialAccount.findMany({
      where: { userId: user.id, status: { not: 'revoked' } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        platform: true,
        displayName: true,
        externalId: true,
        status: true,
        tokenExpiresAt: true,
      },
    }),
  ]);

  const igReady = postmypostConfigured();
  const tgReady = Boolean(env.TELEGRAM_BOT_TOKEN);
  const tgBotUsername = tgReady ? await getBotUsername() : null;

  const upcoming = posts.filter((p) => p.status === 'scheduled' || p.status === 'publishing').length;

  return (
    <div className="grid gap-8">
      <PageHero
        eyebrow="AUTOMATION · SCHEDULE"
        title={
          <>
            Plan &amp; autopost — <span className="italic text-gold">ваш контент выходит сам.</span>
          </>
        }
        description="Поставьте готовое видео в очередь на нужное время — Persona Studio опубликует его в подключённые каналы (Instagram Reels, Telegram) без вашего участия."
        actions={[{ label: 'Запланировать пост', href: '/schedule/new' }]}
        meta={
          <>
            <div className="mono text-[9px] tracking-[0.28em] uppercase text-text-muted">В очереди</div>
            <div className="font-serif text-[28px] text-gold leading-none">{upcoming}</div>
          </>
        }
      />

      <ScheduleClient
        initialPosts={posts.map((p) => ({
          id: p.id,
          status: p.status,
          caption: p.caption,
          mediaUrl: p.mediaUrl,
          scheduledAt: p.scheduledAt.toISOString(),
          publishedAt: p.publishedAt?.toISOString() ?? null,
          errorMsg: p.errorMsg,
          targets: p.targets.map((t) => ({
            id: t.id,
            platform: t.platform,
            status: t.status,
            permalink: t.permalink,
            errorMsg: t.errorMsg,
            channel: t.socialAccount?.displayName ?? t.platform,
          })),
        }))}
        initialAccounts={accounts.map((a) => ({
          id: a.id,
          platform: a.platform,
          displayName: a.displayName,
          externalId: a.externalId,
          status: a.status,
          tokenExpiresAt: a.tokenExpiresAt?.toISOString() ?? null,
        }))}
        igReady={igReady}
        tgReady={tgReady}
        tgBotUsername={tgBotUsername}
      />
    </div>
  );
}
