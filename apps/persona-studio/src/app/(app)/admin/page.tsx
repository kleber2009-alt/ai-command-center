import { redirect } from 'next/navigation';
import { getCurrentAdmin } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { AdminUsersPanel } from '@/components/admin-users';
import { formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin — Persona Studio' };

export default async function AdminPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/dashboard');

  const [users, totals, recentTx] = await Promise.all([
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
        <div className="flex items-baseline gap-3 mb-4">
          <span className="sec-num">/00</span>
          <span className="sec-title">Admin · Persona Studio</span>
          <span className="flex-1 border-b border-border translate-y-[-3px]" />
          <span className="mono text-[10px] tracking-widest uppercase text-pink">
            /{admin.email}
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-[2px] bg-border border border-border">
          <Stat k="Users" v={totals._count._all} accent="text" />
          <Stat k="Tokens outstanding" v={totals._sum.tokenBalance ?? 0} accent="lime" sub="balance × all users" />
          <Stat k="Artefacts" v={`${avatarCount} + ${coverCount} + ${videoCount}`} accent="cyan" sub="avatars · covers · videos" small />
          <Stat k="In progress" v={processingCount} accent={processingCount > 0 ? 'pink' : 'text'} sub="active batches" />
        </div>
      </header>

      <section>
        <div className="flex items-baseline gap-3 mb-3">
          <span className="sec-num">/01</span>
          <span className="sec-title">Users — grant tokens</span>
          <span className="flex-1 border-b border-border translate-y-[-3px]" />
        </div>
        <AdminUsersPanel
          initialUsers={users.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() }))}
          currentUserId={admin.id}
        />
      </section>

      <section>
        <div className="flex items-baseline gap-3 mb-3">
          <span className="sec-num">/02</span>
          <span className="sec-title">Recent token transactions</span>
          <span className="flex-1 border-b border-border translate-y-[-3px]" />
        </div>
        {recentTx.length === 0 ? (
          <p className="mono text-[11px] tracking-widest uppercase text-text-mute">/EMPTY</p>
        ) : (
          <div className="border border-border">
            {recentTx.map((t) => (
              <div
                key={t.id}
                className="grid grid-cols-[70px_1fr_160px_1fr_auto] gap-4 items-center px-5 py-3 border-b border-border last:border-b-0 bg-surface"
              >
                <span className={`mono text-[14px] font-bold ${t.amount > 0 ? 'text-lime' : 'text-pink'}`}>
                  {t.amount > 0 ? '+' : ''}{t.amount}
                </span>
                <span className="mono text-[10px] tracking-widest uppercase text-text-dim">{t.type}</span>
                <span className="font-serif italic text-[13px] text-text-dim truncate">{t.user.email}</span>
                <span className="mono text-[10px] tracking-wider text-text-mute truncate">{t.reason}</span>
                <span className="mono text-[10px] tracking-widest text-text-mute">{formatDate(t.createdAt)}</span>
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
    <div className="bg-bg p-5">
      <div className="mono text-[10px] tracking-widest uppercase text-text-mute mb-2">{k}</div>
      <div className={`font-serif leading-none ${small ? 'text-[26px]' : 'text-[40px]'} ${colorClass}`}>
        {v}
      </div>
      {sub && <div className="mono text-[10px] tracking-wider text-text-mute mt-2">{sub}</div>}
    </div>
  );
}
