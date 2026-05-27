import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { VideoForm } from '@/components/video-form';
import { EmptyState } from '@/components/empty-state';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'New video — Persona Studio' };

export default async function NewVideoPage({
  searchParams,
}: {
  searchParams: Promise<{ avatarId?: string; sourceUrl?: string; parserItemId?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');
  const { avatarId, sourceUrl, parserItemId } = await searchParams;

  const avatars = await prisma.avatar.findMany({
    where: { userId: user.id, status: 'done' },
    orderBy: [{ selected: 'desc' }, { createdAt: 'desc' }],
    select: { id: true, style: true, styleLabel: true, imageUrl: true },
    take: 60,
  });

  // Если пришли с /parser — подтянем оригинальный пост, чтобы показать
  // референс (caption + ссылка). Пост может быть уже dismissed/used —
  // показываем всё равно, фильтра по status тут нет.
  const parserRef = parserItemId
    ? await prisma.parserItem.findFirst({
        where: { id: parserItemId, userId: user.id },
        select: {
          id: true,
          url: true,
          owner: true,
          caption: true,
          fitScore: true,
          fitWhy: true,
          thumbnailUrl: true,
          rewrittenScript: true,
        },
      })
    : null;

  return (
    <div className="grid gap-8">
      <header>
        <div className="flex items-baseline gap-3 mb-4">
          <span className="sec-num">/00</span>
          <span className="sec-title">New talking-photo video</span>
          <span className="flex-1 border-b border-border translate-y-[-3px]" />
          <Link href="/videos" className="mono text-[10px] tracking-widest uppercase text-text-mute hover:text-text">
            ← all videos
          </Link>
        </div>
        <h1 className="font-serif text-[44px] leading-tight max-w-[22ch]">
          Твой аватар <span className="italic text-warm">говорит твоим голосом.</span>
        </h1>
        <p className="font-serif text-[16px] text-text-dim mt-3 max-w-[60ch]">
          HeyGen возьмёт выбранного аватара, оживит губы под скрипт и выдаст MP4 за 2–4 минуты. Списывается 30 токенов.
        </p>
      </header>

      {(parserRef || sourceUrl) && (
        <div className="border border-lime/40 bg-lime/[0.04] p-4 sm:p-5 flex flex-col sm:flex-row gap-4 items-start">
          {parserRef?.thumbnailUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={parserRef.thumbnailUrl}
              alt="reference"
              referrerPolicy="no-referrer"
              className="w-20 h-28 sm:w-24 sm:h-32 object-cover border border-border shrink-0"
            />
          )}
          <div className="grid gap-1 min-w-0 flex-1">
            <span className="mono text-[10px] tracking-widest uppercase text-lime">/parser · референс</span>
            <p className="font-serif text-[14px] sm:text-[15px] text-text">
              {parserRef?.owner ? `@${parserRef.owner}` : 'Instagram'}
              {parserRef?.fitScore != null && (
                <span className="mono text-[11px] text-warm ml-2">{parserRef.fitScore}/10</span>
              )}
            </p>
            {parserRef?.fitWhy && (
              <p className="font-serif italic text-[12.5px] text-text-dim">{parserRef.fitWhy}</p>
            )}
            {parserRef?.caption && (
              <p className="font-serif text-[12px] text-text-mute line-clamp-2">{parserRef.caption}</p>
            )}
            <a
              href={parserRef?.url || sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mono text-[10px] tracking-widest uppercase text-lime hover:underline mt-1"
            >
              Открыть оригинал в Instagram ↗
            </a>
            <p className="font-serif text-[12px] text-text-mute mt-2 max-w-[60ch]">
              {parserRef?.rewrittenScript
                ? 'Сценарий уже переписан Claude под твою нишу по структуре хук → боль → раскрытие → CTA. Подправь под себя, выбери аватар — и в монтаж.'
                : 'Перепиши хук под себя — и в монтаж.'}
            </p>
          </div>
        </div>
      )}

      {avatars.length === 0 ? (
        <EmptyState
          kind="need-avatar"
          title="Сначала нужен хотя бы один готовый аватар."
          description="Загрузи селфи — через ~60 секунд вернёмся к видео с готовым лицом."
          cta={{ href: '/generate?need=video', label: 'Загрузить фото' }}
        />
      ) : (
        <VideoForm
          avatars={avatars}
          initialAvatarId={avatarId}
          initialScript={parserRef?.rewrittenScript ?? undefined}
        />
      )}
    </div>
  );
}
