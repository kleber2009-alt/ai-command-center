import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { EmptyState } from '@/components/empty-state';
import { PageHero } from '@/components/shell/page-hero';
import { ArrowRight } from 'lucide-react';
import { CAROUSEL_STYLES, styleMeta } from '@/lib/carousel/styles';
import { NewCarouselForm } from '@/components/carousel/new-carousel-form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'AI Carousel Engine v2 — Persona Studio' };

const PIPELINE = [
  'INPUT',
  'HOOK',
  'STRUCTURE',
  'STYLE',
  'LAYOUT',
  'IMAGE',
  'EXPORT',
];

export default async function CarouselsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');

  const drafts = await prisma.carouselDraft.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      coverAvatar: { select: { id: true, styleLabel: true, imageUrl: true } },
      parserItem: { select: { owner: true, fitScore: true } },
    },
  });

  return (
    <div className="grid gap-8">
      <PageHero
        eyebrow="создать · карусель"
        title={
          <>
            Карусели — <span className="italic text-gold">из одной темы за минуту.</span>
          </>
        }
        description="Тема и стиль → за 30 секунд: обложка-хук, слайды и призыв в едином стиле. Готовые PNG 1080×1350 — сразу в Instagram или Telegram."
        actions={[
          { label: 'Открыть парсер', href: '/parser' },
          { label: 'Аватары', href: '/avatars', tone: 'ghost' },
        ]}
        icon="carousel"
        meta={
          <>
            <div className="label">Черновики</div>
            <div className="text-[40px] font-extrabold leading-none tabular-nums tracking-[-0.02em] text-gold">{drafts.length}</div>
            <div className="label pt-3">Стилей · {CAROUSEL_STYLES.length}</div>
          </>
        }
        extra={
          <div className="flex flex-wrap items-center gap-1.5">
            {PIPELINE.map((step, i) => (
              <span key={step} className="flex items-center gap-1.5">
                <span
                  className={`rounded-full border px-3 py-1 text-[12px] font-medium ${
                    i === 0 ? 'border-transparent bg-blue text-white' : 'border-border-soft bg-white/[0.04] text-text-dim'
                  }`}
                >
                  {step}
                </span>
                {i < PIPELINE.length - 1 && <ArrowRight size={13} className="text-text-mute" />}
              </span>
            ))}
          </div>
        }
      />

      {/* Новая карусель из темы — стили скилла karusel + 5 Persona DNA */}
      <section className="grid gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="sec-num">/01</span>
          <span className="sec-title">Новая карусель · {CAROUSEL_STYLES.length} стилей</span>
          <span className="hidden flex-1 border-b border-border-soft sm:block" />
          <span className="text-[12px] text-text-mute">
            хук · пункты 01/02 · ✕/✓ · «пиши слово»
          </span>
        </div>
        <NewCarouselForm />
      </section>

      {/* Drafts list */}
      <section className="grid gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="sec-num">/02</span>
          <span className="sec-title">Drafts · {drafts.length}</span>
          <span className="hidden flex-1 border-b border-border-soft sm:block" />
          <span className="text-[12px] text-text-mute">cover · slides · cta · png</span>
        </div>

        {drafts.length === 0 ? (
          <EmptyState
            title="Черновиков карусели пока нет."
            description="Открой парсер, найди залётную карусель, нажми «Создать карусель» — и попадёшь сюда с готовыми слайдами в выбранном стиле."
            cta={{ href: '/parser', label: 'Открыть парсер' }}
          />
        ) : (
          <div className="stagger grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {drafts.map((d) => {
              const slides = Array.isArray(d.slides) ? (d.slides as Array<{ title?: string }>) : [];
              const first = slides[0] || {};
              const meta = styleMeta(d.style);
              return (
                <Link
                  key={d.id}
                  href={`/carousels/new?draftId=${d.id}`}
                  className="card-editorial grid gap-4 p-5"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[12px] font-medium text-text-dim">
                      /draft · {slides.length} sl.
                    </span>
                    <span className="text-[12px] tabular-nums text-text-mute">
                      {new Date(d.createdAt).toLocaleDateString('ru-RU')}
                    </span>
                  </div>
                  <div className="flex items-start gap-3">
                    {d.coverAvatar?.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={d.coverAvatar.imageUrl}
                        alt={d.coverAvatar.styleLabel}
                        className="h-[72px] w-14 shrink-0 rounded-xl border border-border-soft object-cover sm:h-20 sm:w-16"
                      />
                    )}
                    <div className="grid min-w-0 gap-1.5">
                      <p className="line-clamp-2 text-[16px] font-semibold leading-snug tracking-[-0.02em] text-text">
                        {first.title || 'Без заголовка'}
                      </p>
                      {d.parserItem?.owner && (
                        <span className="text-[12px] text-text-mute">
                          @{d.parserItem.owner}
                          {d.parserItem.fitScore != null && (
                            <span className="ml-2 font-semibold text-gold">{d.parserItem.fitScore}/10</span>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 border-t border-border-soft pt-3">
                    <div className="flex overflow-hidden rounded-full border border-border-soft">
                      {meta.swatch.map((c, i) => (
                        <span key={i} className="block" style={{ background: c, width: 10, height: 14 }} />
                      ))}
                    </div>
                    <span className="truncate text-[12px] text-text-mute">
                      {meta.label} · {meta.tag}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
