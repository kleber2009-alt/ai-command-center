import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { COSTS } from '@/lib/tokens';
import { PageHero } from '@/components/shell/page-hero';
import { MontageStudio } from '@/components/montage/montage-studio';
import { MONTAGE_PRESETS } from '@/lib/montage/presets';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Скиллы монтажа — Persona Studio' };

const PIPELINE = ['Whisper · слова', 'паузы ≤ 0.2 c', 'субтитры 1–3 слова', 'хук + «пиши слово»', '−14 LUFS'];

export default async function MontagePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');

  const [videos, montages] = await Promise.all([
    prisma.videoGeneration.findMany({
      where: { userId: user.id, status: 'completed', videoUrl: { not: null } },
      orderBy: { createdAt: 'desc' },
      include: { avatar: { select: { styleLabel: true } } },
      take: 30,
    }),
    prisma.montage.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
  ]);

  return (
    <div className="grid gap-8">
      <PageHero
        eyebrow="SKILL MONTAGE · MONTAZH-RILS ENGINE"
        title={
          <>
            Монтаж по скиллам — <span className="italic text-gold">как в рилсах @ilia.paliy.</span>
          </>
        }
        description="Свой движок монтажа на ffmpeg по пайплайну скилла montazh-rils: пословные таймкоды, вырезка пауз, субтитры в стиле скилла, хук-титр сверху и призыв «пиши «слово»» в конце. Без внешнего монтажёра."
        actions={[
          { label: 'Карусели', href: '/carousels' },
          { label: 'Submagic-монтаж', href: '/edits', tone: 'ghost' },
        ]}
        meta={
          <>
            <div className="mono text-[9px] tracking-[0.28em] uppercase text-text-muted">Стилей</div>
            <div className="font-serif text-[28px] text-gold leading-none">{MONTAGE_PRESETS.length}</div>
            <div className="mono text-[9px] tracking-[0.22em] uppercase text-text-muted mt-3">Ролики · {montages.length}</div>
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
      <MontageStudio
        cost={COSTS.skillMontage}
        videos={videos.map((v) => ({
          id: v.id,
          videoUrl: v.videoUrl,
          aspect: v.aspect,
          createdAt: v.createdAt.toISOString(),
          label: v.avatar?.styleLabel ?? 'Видео',
        }))}
        initial={montages.map((m) => ({
          id: m.id,
          style: m.style,
          format: m.format,
          hookTitle: m.hookTitle,
          ctaWord: m.ctaWord,
          status: m.status,
          resultUrl: m.resultUrl,
          durationSec: m.durationSec,
          errorMsg: m.errorMsg,
          createdAt: m.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
