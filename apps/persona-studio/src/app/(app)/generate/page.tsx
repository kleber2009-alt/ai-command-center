import Link from 'next/link';
import { GenerateStudio } from '@/components/generate-studio';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Generate — Persona Studio' };

export default async function GeneratePage() {
  const user = (await getCurrentUser())!;
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

      <GenerateStudio initialUploads={initialUploads} />

      <p className="mono text-[10px] tracking-widest uppercase text-text-mute">
        После генерации — <Link href="/avatars" className="text-lime">/avatars →</Link> для выбора лучшего и сборки обложки.
      </p>
    </div>
  );
}
