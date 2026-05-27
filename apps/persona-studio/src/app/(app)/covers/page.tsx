import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { formatDate } from '@/lib/utils';
import { EmptyState } from '@/components/empty-state';
import { RetryCoverButton } from './retry-button';
import { PageHero } from '@/components/shell/page-hero';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Covers — Persona Studio' };

export default async function CoversPage({ searchParams }: { searchParams: Promise<{ focus?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');
  const { focus } = await searchParams;

  const covers = await prisma.cover.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return (
    <div className="grid gap-8">
      <PageHero
        eyebrow="LIBRARY · COVERS"
        title={
          <>
            All carousel covers. <span className="italic text-gold">Editorial-ready.</span>
          </>
        }
        description="Выбираешь аватара, пишешь идею — Claude собирает заголовок, подзаголовок и CTA, Gemini рендерит обложку за 10 секунд."
        actions={[{ label: 'New cover', href: '/covers/new' }]}
        meta={
          <>
            <div className="mono text-[9px] tracking-[0.28em] uppercase text-text-muted">Total</div>
            <div className="font-serif text-[28px] text-gold leading-none">{covers.length}</div>
          </>
        }
      />

      {covers.length === 0 ? (
        <EmptyState
          title="Ни одной обложки. Сделаем первую?"
          description="Выбираешь аватара, пишешь идею — Claude генерирует заголовок, подзаголовок и CTA, картинку рендерит Gemini за 10 секунд."
          cta={{ href: '/covers/new', label: 'Создать обложку' }}
        />
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
              <div className="flex items-baseline justify-between gap-2 pr-9">
                <span className="mono text-[9px] tracking-widest uppercase text-pink font-bold truncate">/{c.status}</span>
                <span className="mono text-[9px] tracking-widest uppercase text-text-mute shrink-0">{c.aspect}</span>
              </div>
              {c.status === 'completed' && c.imageUrl && (
                <a
                  href={`/api/covers/${c.id}/download`}
                  download
                  className="absolute top-3 right-3 z-[5] mono text-[11px] tracking-widest uppercase bg-[rgba(8,8,8,0.7)] hover:bg-lime hover:text-bg text-text-dim w-7 h-7 flex items-center justify-center leading-none"
                  title="Скачать обложку"
                  aria-label="Скачать обложку"
                >
                  ↓
                </a>
              )}
              <div>
                <div className="font-serif text-[16px] sm:text-[18px] uppercase leading-tight tracking-tight break-words">{c.title}</div>
                {c.subtitle && <div className="font-serif italic text-[12px] sm:text-[13px] text-pink mt-1 break-words">{c.subtitle}</div>}
                {c.cta && <div className="mono text-[9px] tracking-widest uppercase text-pink font-bold mt-3 break-words">{c.cta}</div>}
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
