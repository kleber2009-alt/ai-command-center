import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { EmptyState } from '@/components/empty-state';
import { PageHero } from '@/components/shell/page-hero';
import { CAROUSEL_STYLES, styleMeta } from '@/lib/carousel/styles';

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
        eyebrow="CREATE · 04 · AI CAROUSEL ENGINE v2"
        title={
          <>
            Editorial carousels — <span className="italic text-gold">cinematic, viral, on-brand.</span>
          </>
        }
        description="Тема + аватар + стиль → за 30 секунд: cover, slides и CTA в едином visual identity. Pipeline ведёт Claude (hook → structure → split), а satori → resvg печатает 1080×1350 PNG."
        actions={[
          { label: 'Open parser', href: '/parser' },
          { label: 'Avatars', href: '/avatars', tone: 'ghost' },
        ]}
        meta={
          <>
            <div className="mono text-[9px] tracking-[0.28em] uppercase text-text-muted">Drafts</div>
            <div className="font-serif text-[28px] text-gold leading-none">{drafts.length}</div>
            <div className="mono text-[9px] tracking-[0.22em] uppercase text-text-muted mt-3">
              Style DNA · {CAROUSEL_STYLES.length}
            </div>
          </>
        }
        extra={
          <div className="mono text-[10px] tracking-[0.22em] uppercase text-text-muted flex flex-wrap gap-x-3 gap-y-1.5 items-center">
            {PIPELINE.map((step, i) => (
              <span key={step} className="flex items-center gap-3">
                <span className={i === 0 ? 'text-gold' : 'text-text-dim'}>{step}</span>
                {i < PIPELINE.length - 1 && <span className="text-border">→</span>}
              </span>
            ))}
          </div>
        }
      />

      {/* 5 Style DNA — single source of truth for what the engine can render */}
      <section className="grid gap-3">
        <div className="flex items-baseline gap-3">
          <span className="sec-num">/01</span>
          <span className="sec-title">Style DNA · 5 визуальных систем</span>
          <span className="flex-1 border-b border-border translate-y-[-3px]" />
          <span className="mono text-[10px] tracking-[0.18em] uppercase text-text-mute">
            single palette · single grid · single voice
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2">
          {CAROUSEL_STYLES.map((s) => (
            <div
              key={s.id}
              className="border border-border bg-surface p-3 grid gap-2 hover:border-text-dim transition"
            >
              <div className="flex border border-border overflow-hidden">
                {s.swatch.map((c, i) => (
                  <span key={i} className="block flex-1" style={{ background: c, height: 32 }} />
                ))}
              </div>
              <div className="grid gap-0.5">
                <span className="font-serif text-[14px] text-text leading-tight">{s.label}</span>
                <span className="mono text-[9px] tracking-wider text-text-mute uppercase">{s.tag}</span>
              </div>
              <p className="font-serif italic text-[12px] text-text-dim leading-snug line-clamp-3">
                {s.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Drafts list */}
      <section className="grid gap-3">
        <div className="flex items-baseline gap-3">
          <span className="sec-num">/02</span>
          <span className="sec-title">Drafts · {drafts.length}</span>
          <span className="flex-1 border-b border-border translate-y-[-3px]" />
          <span className="mono text-[10px] tracking-[0.18em] uppercase text-text-mute">
            cover · slides · cta · png
          </span>
        </div>

        {drafts.length === 0 ? (
          <EmptyState
            title="Черновиков карусели пока нет."
            description="Открой парсер, найди залётную карусель, нажми «Создать карусель» — и попадёшь сюда с готовыми слайдами в выбранном стиле."
            cta={{ href: '/parser', label: 'Открыть парсер' }}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {drafts.map((d) => {
              const slides = Array.isArray(d.slides) ? (d.slides as Array<{ title?: string }>) : [];
              const first = slides[0] || {};
              const meta = styleMeta(d.style);
              return (
                <Link
                  key={d.id}
                  href={`/carousels/new?draftId=${d.id}`}
                  className="border border-border bg-surface p-4 grid gap-3 hover:border-text-dim transition"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="mono text-[10px] tracking-widest uppercase text-text-mute">
                      /draft · {slides.length} sl.
                    </span>
                    <span className="mono text-[9px] text-text-mute">
                      {new Date(d.createdAt).toLocaleDateString('ru-RU')}
                    </span>
                  </div>
                  <div className="flex items-start gap-3">
                    {d.coverAvatar?.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={d.coverAvatar.imageUrl}
                        alt={d.coverAvatar.styleLabel}
                        className="w-14 h-18 sm:w-16 sm:h-20 object-cover border border-border shrink-0"
                      />
                    )}
                    <div className="grid gap-1 min-w-0">
                      <p className="font-serif text-[15px] text-text leading-snug line-clamp-2">
                        {first.title || 'Без заголовка'}
                      </p>
                      {d.parserItem?.owner && (
                        <span className="mono text-[10px] text-text-mute">
                          @{d.parserItem.owner}
                          {d.parserItem.fitScore != null && (
                            <span className="text-warm ml-2">{d.parserItem.fitScore}/10</span>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pt-1 border-t border-border-soft">
                    <div className="flex border border-border-soft overflow-hidden">
                      {meta.swatch.map((c, i) => (
                        <span key={i} className="block" style={{ background: c, width: 10, height: 14 }} />
                      ))}
                    </div>
                    <span className="mono text-[9px] tracking-wider uppercase text-text-mute truncate">
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
