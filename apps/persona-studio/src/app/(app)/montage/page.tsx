import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { COSTS } from '@/lib/tokens';
import { ArrowRight } from 'lucide-react';
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
        eyebrow="монтаж по скиллам"
        title={
          <>
            Монтаж по скиллам — <span className="italic text-gold">паузы, титры, панчи.</span>
          </>
        }
        description="Свой движок монтажа на ffmpeg по пайплайну скилла montazh-rils: пословные таймкоды, вырезка пауз, субтитры в стиле скилла, хук-титр сверху и призыв «пиши «слово»» в конце. Без внешнего монтажёра."
        actions={[
          { label: 'Карусели', href: '/carousels' },
          { label: 'Submagic-монтаж', href: '/edits', tone: 'ghost' },
        ]}
        icon="montage"
        meta={
          <>
            <div className="label">Стилей</div>
            <div className="text-[40px] font-extrabold leading-none tabular-nums tracking-[-0.02em] text-gold">{MONTAGE_PRESETS.length}</div>
            <div className="label pt-3">Ролики · {montages.length}</div>
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
