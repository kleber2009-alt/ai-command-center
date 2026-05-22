import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { formatDate } from '@/lib/utils';
import { RetryCoverButton } from './retry-button';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Covers — Persona Studio' };

export default async function CoversPage({ searchParams }: { searchParams: Promise<{ focus?: string }> }) {
  const user = (await getCurrentUser())!;
  const { focus } = await searchParams;

  const covers = await prisma.cover.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return (
    <div className="grid gap-8">
      <header>
        <div className="flex items-baseline gap-3 mb-4">
          <span className="sec-num">/00</span>
          <span className="sec-title">My covers</span>
          <span className="flex-1 border-b border-border translate-y-[-3px]" />
          <Link href="/covers/new" className="mono text-[10px] tracking-widest uppercase text-lime">
            new cover →
          </Link>
        </div>
        <h1 className="font-serif text-[44px] leading-tight">Все обложки карусели.</h1>
      </header>

      {covers.length === 0 ? (
        <div className="border border-border-2 border-dashed p-12 text-center bg-surface">
          <div className="sec-num mb-3">/EMPTY</div>
          <div className="font-serif italic text-[22px] mb-4">Ни одной обложки. Сделаем первую?</div>
          <Link href="/covers/new" className="btn-primary">Создать обложку →</Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-[2px] bg-border border border-border">
          {covers.map((c) => (
            <article
              key={c.id}
              id={c.id}
              className={`bg-surface p-4 aspect-[4/5] flex flex-col justify-between relative overflow-hidden ${
                focus === c.id ? 'outline outline-2 outline-lime outline-offset-[-2px]' : ''
              }`}
              style={
                c.imageUrl
                  ? { backgroundImage: `linear-gradient(180deg, rgba(8,8,8,0.0) 30%, rgba(8,8,8,0.85) 100%), url(${c.imageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                  : { background: 'linear-gradient(170deg, #2a0a20 0%, #14050f 100%)' }
              }
            >
              <div className="flex items-baseline justify-between">
                <span className="mono text-[9px] tracking-widest uppercase text-pink font-bold">/{c.status}</span>
                <span className="mono text-[9px] tracking-widest uppercase text-text-mute">{c.aspect}</span>
              </div>
              <div>
                <div className="font-serif text-[18px] uppercase leading-tight tracking-tight">{c.title}</div>
                {c.subtitle && <div className="font-serif italic text-[13px] text-pink mt-1">{c.subtitle}</div>}
                {c.cta && <div className="mono text-[9px] tracking-widest uppercase text-pink font-bold mt-3">{c.cta}</div>}
                <div className="mono text-[9px] tracking-widest text-text-mute mt-3">{formatDate(c.createdAt)}</div>
                {c.status === 'failed' && (
                  <div className="mt-3 grid gap-2">
                    {c.errorMsg && (
                      <div className="mono text-[9px] leading-snug text-pink/80 break-words">{c.errorMsg}</div>
                    )}
                    <RetryCoverButton id={c.id} />
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
