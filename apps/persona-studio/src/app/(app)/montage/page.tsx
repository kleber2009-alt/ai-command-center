import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { COSTS } from '@/lib/tokens';
import { ArrowRight } from 'lucide-react';
import { PageHero } from '@/components/shell/page-hero';
import { MontageStudio } from '@/components/montage/montage-studio';
import { KADRIK_STYLES } from '@/lib/montage/kadrik-styles';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Скиллы монтажа — Persona Studio' };

const PIPELINE = ['стиль Студии Кадрика', 'Claude Code + скилл', 'нарезка и титры', 'проверка кадров', 'mp4 / тексты'];

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
            Монтаж по скиллам — <span className="italic text-gold">стили Студии Кадрика.</span>
          </>
        }
        description="Те же 31 скилл и стиль, что в мини-аппе @studio_kadrik_bot: рилсы, стили @ilia.paliy, YouTube, клипы и тексты. Выбери стиль, дай видео — Кадрик смонтирует его скиллом через Claude Code и вернёт готовый ролик сюда."
        actions={[
          { label: 'Карусели', href: '/carousels' },
          { label: 'Submagic-монтаж', href: '/edits', tone: 'ghost' },
        ]}
        icon="montage"
        meta={
          <>
            <div className="label">Стилей</div>
            <div className="text-[40px] font-extrabold leading-none tabular-nums tracking-[-0.02em] text-gold">{KADRIK_STYLES.length}</div>
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
        cost={COSTS.kadrikMontage}
        videos={videos.map((v) => ({
          id: v.id,
          videoUrl: v.videoUrl,
          aspect: v.aspect,
          createdAt: v.createdAt.toISOString(),
          label: v.avatar?.styleLabel ?? v.heygenAvatarName ?? 'Видео',
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
          progress: m.progress,
          createdAt: m.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
