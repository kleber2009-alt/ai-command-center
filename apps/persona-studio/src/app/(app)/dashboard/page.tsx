import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { formatDate } from '@/lib/utils';
import { COSTS } from '@/lib/tokens';

export const dynamic = 'force-dynamic';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');

  const params = await searchParams;
  const welcomeSkipped = params.welcome === 'skipped';

  const firstGenerationExists = (await prisma.avatarGeneration.count({
    where: { userId: user.id },
  })) > 0;

  // First-touch: brand-new user, no generations yet, hasn't explicitly skipped onboarding →
  // route them straight to /generate with an onboarding overlay. They can opt-out via
  // ?welcome=skipped (link on /generate?onboarding=1), and after the first generation
  // they'll naturally land on dashboard.
  if (!firstGenerationExists && !welcomeSkipped) {
    redirect('/generate?onboarding=1');
  }

  const [generations, avatarsCount, coversCount, videosCount, recentAvatars, recentCovers] = await Promise.all([
    prisma.avatarGeneration.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    prisma.avatar.count({ where: { userId: user.id, status: 'done' } }),
    prisma.cover.count({ where: { userId: user.id, status: 'completed' } }),
    prisma.videoGeneration.count({ where: { userId: user.id, status: 'completed' } }),
    prisma.avatar.findMany({
      where: { userId: user.id, status: 'done' },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    prisma.cover.findMany({
      where: { userId: user.id, status: 'completed' },
      orderBy: { createdAt: 'desc' },
      take: 4,
    }),
  ]);

  const isNewUser = generations.length === 0;
  const lowBalance = user.tokenBalance < COSTS.avatarGeneration;

  return (
    <div className="grid gap-8">
      <section>
        <div className="flex items-baseline gap-3 mb-4">
          <span className="sec-num">/00</span>
          <span className="sec-title">Dashboard</span>
          <span className="flex-1 border-b border-border translate-y-[-3px]" />
          <span className="mono text-[10px] tracking-widest uppercase text-text-mute">{user.email}</span>
        </div>

        {isNewUser && (
          <div className="border border-lime/40 bg-[#0a1305] p-6 mb-6">
            <div className="mono text-[10px] tracking-widest uppercase text-lime mb-2">/ welcome</div>
            <h2 className="font-serif text-[28px] leading-tight mb-2">
              Привет 👋 Тебе зачислено <span className="text-lime">{user.tokenBalance} токенов</span> в подарок.
            </h2>
            <p className="font-serif italic text-[15px] text-text-dim max-w-[60ch]">
              Этого хватит на один батч из 10 AI-аватаров. Загрузи селфи — через ~60 секунд получишь 10 портретов в разных стилях, готовых к публикации.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/generate" className="btn-primary">Загрузить фото →</Link>
              <Link href="/voice" className="btn-ghost">Сначала обучить голос →</Link>
            </div>
          </div>
        )}

        {lowBalance && !isNewUser && (
          <div className="border border-pink/40 bg-[#1a0510] p-5 mb-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="mono text-[10px] tracking-widest uppercase text-pink mb-1">/ low-balance</div>
              <p className="font-serif italic text-[15px]">
                Осталось <span className="text-pink">{user.tokenBalance} токенов</span>. На следующий батч нужно {COSTS.avatarGeneration}.
              </p>
            </div>
            <Link href="/billing" className="btn-primary">Пополнить →</Link>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-[2px] bg-border border border-border">
          <Stat k="Token balance" v={user.tokenBalance} accent={lowBalance ? 'pink' : 'lime'} sub={`plan: ${user.plan}`} />
          <Stat k="Avatars ready" v={avatarsCount} sub="готовых портретов" />
          <Stat k="Covers" v={coversCount} sub="обложек" />
          <Stat k="Videos" v={videosCount} accent="cyan" sub="говорящих видео" />
        </div>

        <div className="mt-8 grid md:grid-cols-2 lg:grid-cols-4 gap-[2px] bg-border border border-border">
          <ActionCard
            href="/generate"
            num="/A · upload"
            title="Загрузить фото"
            sub={`-${COSTS.avatarGeneration} токенов / батч`}
            tone="lime"
          />
          <ActionCard
            href={avatarsCount > 0 ? '/videos/new' : '/avatars'}
            num="/B · talk"
            title={avatarsCount > 0 ? 'Создать видео' : 'Сначала выбрать аватара'}
            sub={`-${COSTS.heygenVideo} / video`}
            tone="cyan"
            disabled={avatarsCount === 0}
          />
          <ActionCard
            href={avatarsCount > 0 ? '/covers/new' : '/avatars'}
            num="/C · publish"
            title={avatarsCount > 0 ? 'Сделать обложку' : 'Сначала выбрать аватара'}
            sub={`-${COSTS.coverGeneration} / cover`}
            tone="pink"
            disabled={avatarsCount === 0}
          />
          <ActionCard
            href="/voice"
            num="/D · voice"
            title="Обучить свой голос"
            sub="через Persona Train"
            tone="warm"
          />
        </div>
      </section>

      <section>
        <div className="flex items-baseline gap-3 mb-3">
          <span className="sec-num">/01</span>
          <span className="sec-title">Последние генерации</span>
          <span className="flex-1 border-b border-border translate-y-[-3px]" />
        </div>
        {generations.length === 0 ? (
          <p className="mono text-[11px] tracking-widest uppercase text-text-mute">
            /EMPTY — ещё ни одной генерации. <Link href="/generate" className="text-lime">Загрузить фото →</Link>
          </p>
        ) : (
          <div className="border border-border">
            {generations.map((g) => (
              <div
                key={g.id}
                className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_auto_auto_auto] gap-x-3 gap-y-1 sm:gap-4 items-baseline sm:items-center px-4 sm:px-5 py-3 border-b border-border last:border-b-0 bg-surface"
              >
                <span className="font-serif italic text-[15px] sm:text-[16px] min-w-0 truncate">batch {g.id.slice(0, 6)}</span>
                <span className="mono text-[10px] tracking-widest uppercase text-text-dim whitespace-nowrap">{g.status}</span>
                <span className="mono text-[9px] sm:text-[10px] tracking-widest text-text-mute">-{g.tokensCost}t</span>
                <span className="mono text-[9px] sm:text-[10px] tracking-widest text-text-mute whitespace-nowrap justify-self-end col-span-2 sm:col-auto">{formatDate(g.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {recentAvatars.length > 0 && (
        <section>
          <div className="flex items-baseline gap-3 mb-3">
            <span className="sec-num">/02</span>
            <span className="sec-title">Последние аватары</span>
            <span className="flex-1 border-b border-border translate-y-[-3px]" />
            <Link href="/avatars" className="mono text-[10px] tracking-widest uppercase text-lime">
              all →
            </Link>
          </div>
          <div className="grid grid-cols-5 gap-[2px] bg-border border border-border">
            {recentAvatars.map((a) => (
              <Link
                key={a.id}
                href={`/avatars#${a.id}`}
                className="bg-surface aspect-[4/5] relative flex flex-col justify-between p-3"
                style={a.imageUrl ? { backgroundImage: `url(${a.imageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
              >
                <span className="mono text-[9px] tracking-widest uppercase text-text-faint">{a.style}</span>
                <span className="font-serif italic text-[14px]">{a.styleLabel}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {recentCovers.length > 0 && (
        <section>
          <div className="flex items-baseline gap-3 mb-3">
            <span className="sec-num">/03</span>
            <span className="sec-title">Обложки карусели</span>
            <span className="flex-1 border-b border-border translate-y-[-3px]" />
            <Link href="/covers" className="mono text-[10px] tracking-widest uppercase text-lime">
              all →
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-[2px] bg-border border border-border">
            {recentCovers.map((c) => (
              <div key={c.id} className="bg-surface p-4 aspect-[4/5] flex flex-col justify-between">
                <span className="mono text-[9px] tracking-widest uppercase text-pink">{c.style}</span>
                <div>
                  <div className="font-serif italic text-[18px] leading-tight">{c.title}</div>
                  {c.subtitle && <div className="mono text-[10px] tracking-widest text-text-dim mt-2">{c.subtitle}</div>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({ k, v, sub, accent }: { k: string; v: number | string; sub?: string; accent?: 'lime' | 'cyan' | 'pink' }) {
  return (
    <div className="bg-bg p-5">
      <div className="mono text-[10px] tracking-widest uppercase text-text-mute mb-2">{k}</div>
      <div className={`font-serif text-[40px] leading-none ${accent === 'lime' ? 'text-lime' : accent === 'cyan' ? 'text-cyan' : accent === 'pink' ? 'text-pink' : 'text-text'}`}>
        {v}
      </div>
      {sub && <div className="mono text-[10px] tracking-wider text-text-mute mt-2">{sub}</div>}
    </div>
  );
}

function ActionCard({
  href,
  num,
  title,
  sub,
  tone,
  disabled,
}: {
  href: string;
  num: string;
  title: string;
  sub: string;
  tone: 'lime' | 'cyan' | 'pink' | 'warm';
  disabled?: boolean;
}) {
  const subColor =
    tone === 'lime' ? 'text-lime' : tone === 'cyan' ? 'text-cyan' : tone === 'pink' ? 'text-pink' : 'text-warm';
  return (
    <Link
      href={href}
      className={`bg-surface ${disabled ? 'opacity-60' : 'hover:bg-surface-2'} transition-colors p-5 flex flex-col justify-between min-h-[150px]`}
    >
      <div className="sec-num mb-2">{num}</div>
      <div>
        <div className="font-serif italic text-[20px] leading-tight">{title} →</div>
        <span className={`mono text-[10px] tracking-widest mt-2 inline-block ${subColor}`}>{sub}</span>
      </div>
    </Link>
  );
}
