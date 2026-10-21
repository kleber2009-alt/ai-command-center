import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Icon3D } from '@/components/ui/icon3d';
import { GenerateStudio } from '@/components/generate-studio';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PageHero } from '@/components/shell/page-hero';
import { COSTS } from '@/lib/tokens';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Generate — Persona Studio' };

export default async function GeneratePage({
  searchParams,
}: {
  searchParams: Promise<{ onboarding?: string; need?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');
  const params = await searchParams;
  const onboarding = params.onboarding === '1';
  const need = params.need === 'video' || params.need === 'cover' || params.need === 'carousel' ? params.need : null;
  const uploads = await prisma.upload.findMany({
    where: { userId: user.id, status: 'ready' },
    orderBy: { createdAt: 'desc' },
    select: { id: true, fileUrl: true, fileType: true, bytes: true, createdAt: true },
    take: 20,
  });
  const initialUploads = uploads.map((u) => ({
    id: u.id,
    url: u.fileUrl,
    type: u.fileType,
    bytes: u.bytes,
    createdAt: u.createdAt.toISOString(),
  }));
  return (
    <div className="grid gap-10">
      <PageHero
        eyebrow="CREATE · 01 · AVATAR"
        title={
          <>
            One photo, <span className="italic">ten avatars.</span>
          </>
        }
        description={
          <>
            Загрузи до 10 фото, выбери лучшее как primary. Дальше — три режима: дефолтные 10 стилей,
            20 ниш с готовыми пакетами по 10 промптов, или свой текст. Лицо сохраняется 1:1.
          </>
        }
        icon="avatar"
        meta={
          <>
            <div className="label">Engine</div>
            <div className="text-[14px] font-medium text-gold">AI-генерация · 10 стилей</div>
          </>
        }
      />

      {need && !onboarding && (
        <div className="panel reveal flex items-start gap-4 p-5 sm:p-6">
          <Icon3D name="warning" size={26} tile />
          <div>
            <p className="label mb-1.5 !text-cyan">/ prerequisite</p>
            <p className="text-[15px] leading-snug sm:text-[16px]">
              Чтобы {need === 'video' ? 'собрать видео' : need === 'carousel' ? 'поставить аватар на обложку карусели' : 'сделать обложку'}, сначала нужен хотя бы один аватар.
              Загрузи селфи ниже — через ~60 секунд вернёмся к {need === 'video' ? 'видео' : need === 'carousel' ? 'карусели' : 'обложке'}.
            </p>
          </div>
        </div>
      )}

      {onboarding && (
        <div className="panel reveal overflow-hidden border-lime/30 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex max-w-[64ch] items-start gap-4">
              <Icon3D name="sparkles" size={30} tile="lime" sway />
              <div>
                <p className="label mb-2 !text-lime">/ welcome · шаг 1 из 1</p>
                <h2 className="mb-2 text-[22px] font-semibold leading-tight tracking-[-0.02em] sm:text-[26px]">
                  Загрузи селфи — ниже будет всё остальное.
                </h2>
                <p className="text-[14px] text-text-dim sm:text-[15px]">
                  Хорошо работают: лицо в фокусе, ровный свет, без очков, разрешение от 1024px. Можно сразу несколько — выберешь
                  primary в следующем шаге.
                </p>
              </div>
            </div>
            <Link href="/api/onboarding/skip" className="btn-ghost !px-4 !py-2 text-[13px]">
              пропустить
              <ArrowRight size={14} aria-hidden />
            </Link>
          </div>
        </div>
      )}

      <GenerateStudio initialUploads={initialUploads} cost={COSTS.avatarGeneration} />

      <p className="flex flex-wrap items-center gap-1.5 text-[13px] text-text-mute">
        После генерации —
        <Link href="/avatars" className="inline-flex items-center gap-1 font-medium text-gold hover:text-text">
          /avatars
          <ArrowRight size={13} aria-hidden />
        </Link>
        для выбора лучшего и сборки обложки.
      </p>
    </div>
  );
}
