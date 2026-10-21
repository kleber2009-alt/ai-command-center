import { redirect } from 'next/navigation';
import { getCurrentAdmin } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { AdminUsersPanel } from '@/components/admin-users';
import { AdminSidebarPanel } from '@/components/admin-sidebar-panel';
import { getSidebarOverviewWithState } from '@/lib/sidebar-overrides';
import { formatDate } from '@/lib/utils';
import { PageHero } from '@/components/shell/page-hero';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin — Persona Studio' };

export default async function AdminPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/dashboard');

  const [users, totals, recentTx, sidebarItems] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        email: true,
        name: true,
        tokenBalance: true,
        plan: true,
        role: true,
        createdAt: true,
        _count: {
          select: {
            avatarGenerations: true,
            covers: true,
            videoGenerations: true,
          },
        },
      },
    }),
    prisma.user.aggregate({ _count: { _all: true }, _sum: { tokenBalance: true } }),
    prisma.tokenTransaction.findMany({
      orderBy: { createdAt: 'desc' },
      take: 15,
      include: { user: { select: { email: true } } },
    }),
    getSidebarOverviewWithState(),
  ]);

  const [avatarCount, coverCount, videoCount, processingCount] = await Promise.all([
    prisma.avatar.count({ where: { status: 'done' } }),
    prisma.cover.count({ where: { status: 'completed' } }),
    prisma.videoGeneration.count({ where: { status: 'completed' } }),
    prisma.avatarGeneration.count({ where: { status: { in: ['pending', 'processing'] } } }),
  ]);

  return (
    <div className="grid gap-8">
      <header>
        <PageHero
          eyebrow="/00 · ADMIN"
          title="Admin · Persona Studio"
          icon="gear"
          meta={<span className="eyebrow !text-pink">{admin.email}</span>}
        />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 stagger">
          <Stat k="Users" v={totals._count._all} accent="text" />
          <Stat k="Tokens outstanding" v={totals._sum.tokenBalance ?? 0} accent="lime" sub="balance × all users" />
          <Stat k="Artefacts" v={`${avatarCount} + ${coverCount} + ${videoCount}`} accent="cyan" sub="avatars · covers · videos" small />
          <Stat k="In progress" v={processingCount} accent={processingCount > 0 ? 'pink' : 'text'} sub="active batches" />
        </div>
      </header>

      <section>
        <div className="flex items-center gap-3 mb-4">
          <span className="sec-num">/01</span>
          <span className="sec-title">Users — grant tokens</span>
          <span className="flex-1 h-px bg-border-soft" />
        </div>
        <AdminUsersPanel
          initialUsers={users.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() }))}
          currentUserId={admin.id}
        />
      </section>

      <section>
        <div className="flex items-center gap-3 mb-4">
          <span className="sec-num">/02</span>
          <span className="sec-title">Sidebar — управление пунктами меню</span>
          <span className="flex-1 h-px bg-border-soft" />
        </div>
        <AdminSidebarPanel initialItems={sidebarItems} />
      </section>

      <section>
        <div className="flex items-center gap-3 mb-4">
          <span className="sec-num">/03</span>
          <span className="sec-title">Recent token transactions</span>
          <span className="flex-1 h-px bg-border-soft" />
        </div>
        {recentTx.length === 0 ? (
          <p className="rounded-[24px] border border-dashed border-white/15 bg-white/[0.03] p-6 text-center text-[13px] text-text-mute">/EMPTY</p>
        ) : (
          <div className="panel overflow-x-auto">
            {recentTx.map((t) => (
              <div
                key={t.id}
                className="grid min-w-[720px] grid-cols-[70px_1fr_160px_1fr_auto] gap-4 items-center px-5 py-3 border-b border-border-soft last:border-b-0 transition-colors hover:bg-white/[0.03]"
              >
                <span className={`text-[14px] font-bold tabular-nums ${t.amount > 0 ? 'text-lime' : 'text-pink'}`}>
                  {t.amount > 0 ? '+' : ''}{t.amount}
                </span>
                <span className="justify-self-start rounded-full bg-white/[0.06] px-2.5 py-0.5 text-[11px] font-medium text-text-dim">{t.type}</span>
                <span className="text-[13px] text-text truncate">{t.user.email}</span>
                <span className="text-[12.5px] text-text-mute truncate">{t.reason}</span>
                <span className="text-[12px] tabular-nums text-text-mute">{formatDate(t.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({
  k,
  v,
  sub,
  accent,
  small,
}: {
  k: string;
  v: number | string;
  sub?: string;
  accent?: 'lime' | 'cyan' | 'pink' | 'text';
  small?: boolean;
}) {
  const colorClass =
    accent === 'lime' ? 'text-lime' :
    accent === 'cyan' ? 'text-cyan' :
    accent === 'pink' ? 'text-pink' :
    'text-text';
  return (
    <div className="panel p-5">
      <div className="label mb-2.5">{k}</div>
      <div className={`font-extrabold tabular-nums tracking-[-0.02em] leading-none ${small ? 'text-[26px]' : 'text-[40px]'} ${colorClass}`}>
        {v}
      </div>
      {sub && <div className="text-[12px] text-text-mute mt-2">{sub}</div>}
    </div>
  );
}
