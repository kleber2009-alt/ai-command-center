import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { VideoForm } from '@/components/video-form';
import { EmptyState } from '@/components/empty-state';
import { VoiceStatus } from '@/components/voice-status';
import { PageHero } from '@/components/shell/page-hero';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { engineConfig } from '@/lib/video-engines';
import { defaultEngine } from '@/lib/studio/produce';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Новое видео — Persona Studio' };

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
      <div className="-mb-4 flex flex-wrap items-center gap-3">
        <Link href="/videos" className="btn-ghost !px-4 !py-2 text-[13px]">
          <ArrowLeft size={14} aria-hidden />
          все видео
        </Link>
        <span className="sec-num">/00</span>
        <span className="sec-title">Новое видео с говорящим фото</span>
      </div>

      <PageHero
        eyebrow="СОЗДАТЬ · ВИДЕО"
        icon="video"
        title={
          <>
            Твой аватар <span className="italic">говорит твоим голосом.</span>
          </>
        }
        description={`AI оживит выбранного аватара под сценарий и выдаст MP4 за 2–4 минуты. Спишется ${engineConfig(defaultEngine()).cost} токенов.`}
        extra={<VoiceStatus />}
      />

      {(parserRef || sourceUrl) && (
        <div className="panel reveal flex flex-col items-start gap-4 border-lime/25 p-4 sm:flex-row sm:p-5">
          {parserRef?.thumbnailUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={parserRef.thumbnailUrl}
              alt="референс"
              referrerPolicy="no-referrer"
              className="h-28 w-20 shrink-0 rounded-2xl border border-border-soft object-cover sm:h-32 sm:w-24"
            />
          )}
          <div className="grid min-w-0 flex-1 gap-1.5">
            <span className="label !text-lime">из парсера · референс</span>
            <p className="text-[15px] font-semibold text-text sm:text-[16px]">
              {parserRef?.owner ? `@${parserRef.owner}` : 'Instagram'}
              {parserRef?.fitScore != null && (
                <span className="ml-2 rounded-full bg-blue/15 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-gold">{parserRef.fitScore}/10</span>
              )}
            </p>
            {parserRef?.fitWhy && (
              <p className="text-[13px] text-text-dim">{parserRef.fitWhy}</p>
            )}
            {parserRef?.caption && (
              <p className="line-clamp-2 text-[12px] text-text-mute">{parserRef.caption}</p>
            )}
            <a
              href={parserRef?.url || sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-1.5 justify-self-start text-[13px] font-medium text-lime hover:underline"
            >
              Открыть оригинал в Instagram
              <ExternalLink size={13} aria-hidden />
            </a>
            <p className="mt-2 max-w-[60ch] text-[12px] text-text-mute">
              {parserRef?.rewrittenScript
                ? 'Сценарий уже переписан Claude под твою нишу по структуре хук → боль → раскрытие → призыв. Подправь под себя, выбери аватар — и в монтаж.'
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
          initialEngine={defaultEngine()}
        />
      )}
    </div>
  );
}
