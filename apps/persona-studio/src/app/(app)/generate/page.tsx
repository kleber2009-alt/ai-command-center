import Link from 'next/link';
import { GenerateStudio } from '@/components/generate-studio';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PageHero } from '@/components/shell/page-hero';

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
  const need = params.need === 'video' ? 'video' : params.need === 'cover' ? 'cover' : null;
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
      <header>
        <div className="flex items-baseline gap-3 mb-4">
          <span className="sec-num">/00</span>
          <span className="sec-title">Generate avatars</span>
          <span className="flex-1 border-b border-border translate-y-[-3px]" />
        </div>
        <h1 className="font-serif text-[32px] sm:text-[44px] md:text-[56px] leading-[1.05] tracking-[-0.02em] max-w-[18ch]">
          До 10 фото — <span className="italic text-warm">десять аватаров.</span>
        </h1>
        <p className="font-serif text-[15px] sm:text-[17px] text-text-dim mt-4 max-w-[60ch]">
          Загрузи до 10 фото, выбери лучшее как primary. Дальше — три режима: дефолтные 10 стилей,
          20 ниш с готовыми пакетами по 10 промптов, или свой текст. Лицо сохраняется 1:1.
        </p>
      </header>

      {need && !onboarding && (
        <div className="border border-cyan/40 bg-[#05151a] p-5">
          <p className="mono text-[10px] tracking-widest uppercase text-cyan mb-2">/ prerequisite</p>
          <p className="font-serif text-[15px] sm:text-[16px] leading-snug">
            Чтобы {need === 'video' ? 'собрать видео' : 'сделать обложку'}, сначала нужен хотя бы один аватар.
            Загрузи селфи ниже — через ~60 секунд вернёмся к {need === 'video' ? 'видео' : 'обложке'}.
          </p>
        </div>
      )}

      {onboarding && (
        <div className="border border-lime/40 bg-[#0a1305] p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="max-w-[64ch]">
              <p className="mono text-[10px] tracking-widest uppercase text-lime mb-2">/ welcome · шаг 1 из 1</p>
              <h2 className="font-serif text-[22px] sm:text-[26px] leading-tight mb-2">
                Загрузи селфи — ниже будет всё остальное.
              </h2>
              <p className="font-serif italic text-[14px] sm:text-[15px] text-text-dim">
                Хорошо работают: лицо в фокусе, ровный свет, без очков, разрешение от 1024px. Можно сразу несколько — выберешь
                primary в следующем шаге.
              </p>
            </div>
            <Link
              href="/dashboard?welcome=skipped"
              className="mono text-[10px] tracking-widest uppercase text-text-dim hover:text-text whitespace-nowrap"
            >
              пропустить →
            </Link>
          </div>
        </div>
      )}

      <GenerateStudio initialUploads={initialUploads} />

      <p className="mono text-[10px] tracking-widest uppercase text-text-mute">
        После генерации — <Link href="/avatars" className="text-lime">/avatars →</Link> для выбора лучшего и сборки обложки.
      </p>
    </div>
  );
}
