import Link from 'next/link';
import { UploadZone } from '@/components/upload-zone';
import { AVATAR_STYLES } from '@/lib/styles';
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
        <h1 className="font-serif text-[56px] leading-[1.0] tracking-[-0.02em] max-w-[18ch]">
          До 10 фото — <span className="italic text-warm">десять аватаров.</span>
        </h1>
        <p className="font-serif text-[17px] text-text-dim mt-4 max-w-[60ch]">
          Загрузи до 10 фото, выбери лучшее как primary. Flux Kontext Pro построит 10 портретов в разных
          режиссёрских стилях, сохраняя твою узнаваемость 1:1 (не подменяет лицо).
        </p>
      </header>

      <section>
        <UploadZone initialUploads={initialUploads} />
      </section>

      <section>
        <div className="flex items-baseline gap-3 mb-3">
          <span className="sec-num">/01</span>
          <span className="sec-title">Что будет сгенерировано</span>
          <span className="flex-1 border-b border-border translate-y-[-3px]" />
          <span className="mono text-[10px] tracking-widest uppercase text-text-mute">10 styles</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-[2px] bg-border border border-border">
          {AVATAR_STYLES.map((s, i) => (
            <div key={s.slug} className="bg-surface px-5 py-4 grid grid-cols-[56px_1fr] gap-4 items-center">
              <span className="mono text-[20px] font-bold text-text-faint">
                {(i + 1).toString().padStart(2, '0')}
              </span>
              <div>
                <div className="font-serif italic text-[19px] leading-tight">{s.label}</div>
                <div className="mono text-[10px] tracking-widest uppercase text-text-mute mt-1">
                  {s.description}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <p className="mono text-[10px] tracking-widest uppercase text-text-mute">
        После генерации — <Link href="/avatars" className="text-lime">/avatars →</Link> для выбора лучшего и сборки обложки.
      </p>
    </div>
  );
}
