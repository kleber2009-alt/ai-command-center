import { Download } from 'lucide-react';
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
            All carousel covers. <span className="italic">Editorial-ready.</span>
          </>
        }
        description="Выбираешь аватара, пишешь идею — Claude собирает заголовок, подзаголовок и CTA, Gemini рендерит обложку за 10 секунд."
        actions={[{ label: 'New cover', href: '/covers/new' }]}
        icon="covers"
        meta={
          <>
            <div className="label">Total</div>
            <div className="text-[40px] font-extrabold leading-none tracking-[-0.02em] tabular-nums text-gold">{covers.length}</div>
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
        <div className="stagger grid grid-cols-2 gap-3 md:grid-cols-4">
          {covers.map((c) => (
            <article
              key={c.id}
              id={c.id}
              className={`relative flex aspect-[4/5] flex-col justify-between overflow-hidden rounded-[20px] border p-4 transition-all duration-300 ease-settle hover:-translate-y-0.5 ${
                focus === c.id ? 'border-transparent ring-2 ring-blue shadow-glow' : 'border-border-soft hover:border-border-2'
              }`}
              style={
                c.imageUrl
                  ? { backgroundImage: `linear-gradient(180deg, rgba(11,11,13,0) 30%, rgba(11,11,13,0.88) 100%), url(${c.imageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                  : { background: 'linear-gradient(170deg, rgba(255,61,139,0.22) 0%, rgba(11,11,13,0.92) 100%)' }
              }
            >
              <div className="flex items-center justify-between gap-2 pr-10">
                <span className={`status-badge status-${c.status === 'pending' ? 'queued' : c.status} truncate bg-black/50 backdrop-blur-md`}>{c.status}</span>
                <span className="shrink-0 rounded-full bg-black/50 px-2 py-0.5 text-[11px] font-medium tabular-nums text-white/80 backdrop-blur-md">{c.aspect}</span>
              </div>
              {c.status === 'completed' && c.imageUrl && (
                <a
                  href={`/api/covers/${c.id}/download`}
                  download
                  className="absolute right-3 top-3 z-[5] flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-black/55 text-white/85 backdrop-blur-md transition-colors hover:bg-blue hover:text-white"
                  title="Скачать обложку"
                  aria-label="Скачать обложку"
                >
                  <Download size={14} aria-hidden />
                </a>
              )}
              <div>
                <div className="break-words text-[15px] font-bold leading-tight tracking-[-0.02em] sm:text-[17px]">{c.title}</div>
                {c.subtitle && <div className="mt-1 break-words text-[12px] text-pink sm:text-[13px]">{c.subtitle}</div>}
                {c.cta && (
                  <div className="mt-2.5 inline-block max-w-full break-words rounded-full bg-pink px-2.5 py-0.5 text-[11px] font-semibold text-white">{c.cta}</div>
                )}
                <div className="mt-2.5 text-[11px] tabular-nums text-text-mute">{formatDate(c.createdAt)}</div>
                {c.status === 'failed' && (
                  <div className="mt-3 grid gap-2">
                    {c.errorMsg && (
                      <div className="break-words text-[11px] leading-snug text-danger/90">{c.errorMsg}</div>
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
