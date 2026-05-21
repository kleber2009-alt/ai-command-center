import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const user = (await getCurrentUser())!;

  const [generations, avatarsCount, coversCount, recentAvatars, recentCovers] = await Promise.all([
    prisma.avatarGeneration.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    prisma.avatar.count({ where: { userId: user.id, status: 'done' } }),
    prisma.cover.count({ where: { userId: user.id, status: 'completed' } }),
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

  return (
    <div className="grid gap-8">
      <section>
        <div className="flex items-baseline gap-3 mb-4">
          <span className="sec-num">/00</span>
          <span className="sec-title">Dashboard</span>
          <span className="flex-1 border-b border-border translate-y-[-3px]" />
          <span className="mono text-[10px] tracking-widest uppercase text-text-mute">{user.email}</span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-[2px] bg-border border border-border">
          <Stat k="Token balance" v={user.tokenBalance} accent="lime" sub={`plan: ${user.plan}`} />
          <Stat k="Avatars ready" v={avatarsCount} sub="готовых портретов" />
          <Stat k="Covers" v={coversCount} sub="обложек карусели" />
          <Stat k="Generations" v={generations.length} sub="всего батчей" />
        </div>

        <div className="mt-8 grid md:grid-cols-2 gap-[2px] bg-border border border-border">
          <Link
            href="/generate"
            className="bg-surface hover:bg-surface-2 transition-colors p-6 flex items-end justify-between min-h-[140px]"
          >
            <div>
              <div className="sec-num mb-2">/A · upload</div>
              <div className="font-serif italic text-[26px] leading-tight">
                Загрузить новое фото →
              </div>
            </div>
            <span className="mono text-[10px] tracking-widest text-lime">10 tokens / batch</span>
          </Link>
          <Link
            href="/avatars"
            className="bg-surface hover:bg-surface-2 transition-colors p-6 flex items-end justify-between min-h-[140px]"
          >
            <div>
              <div className="sec-num mb-2">/B · pick</div>
              <div className="font-serif italic text-[26px] leading-tight">
                Выбрать аватара для обложки →
              </div>
            </div>
            <span className="mono text-[10px] tracking-widest text-cyan">{avatarsCount} ready</span>
          </Link>
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
              <div key={g.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-4 items-center px-5 py-3 border-b border-border last:border-b-0 bg-surface">
                <span className="font-serif italic text-[16px]">batch {g.id.slice(0, 6)}</span>
                <span className="mono text-[10px] tracking-widest uppercase text-text-dim">{g.status}</span>
                <span className="mono text-[10px] tracking-widest text-text-mute">-{g.tokensCost}t</span>
                <span className="mono text-[10px] tracking-widest text-text-mute">{formatDate(g.createdAt)}</span>
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
