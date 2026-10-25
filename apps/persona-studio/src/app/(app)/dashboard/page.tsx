import Link from 'next/link';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getCurrentUser } from '@/lib/auth';
import { listOwnedVoices } from '@/lib/voice/owned';
import { prisma } from '@/lib/prisma';
import { formatDate } from '@/lib/utils';
import { COSTS } from '@/lib/tokens';
import { engineConfig } from '@/lib/video-engines';
import { defaultEngine } from '@/lib/studio/produce';
import { ArrowRight, Play } from 'lucide-react';
import { Icon3D, type Icon3DName } from '@/components/ui/icon3d';

export const dynamic = 'force-dynamic';

type StatusTone = 'ready' | 'processing' | 'queued' | 'failed' | 'partial';

function mapStatus(raw: string): { label: string; tone: StatusTone } {
  const s = raw.toLowerCase();
  if (s === 'done' || s === 'completed' || s === 'ready') return { label: 'Готово', tone: 'ready' };
  if (s === 'failed' || s === 'error') return { label: 'Ошибка', tone: 'failed' };
  if (s === 'partial') return { label: 'Частично', tone: 'partial' };
  if (s === 'queued' || s === 'pending' || s === 'scheduled') return { label: 'В очереди', tone: 'queued' };
  return { label: 'В работе', tone: 'processing' };
}

const statusClass: Record<StatusTone, string> = {
  ready: 'status-badge status-ready',
  processing: 'status-badge status-processing',
  queued: 'status-badge status-queued',
  failed: 'status-badge status-failed',
  partial: 'status-badge status-partial',
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');

  const params = await searchParams;
  // ?welcome=skipped is the legacy link; the cookie is set by /api/onboarding/skip.
  const welcomeSkipped =
    params.welcome === 'skipped' || (await cookies()).get('ps_onboarding_skipped')?.value === '1';

  const firstGenerationExists =
    (await prisma.avatarGeneration.count({ where: { userId: user.id } })) > 0;

  // First-touch onboarding redirect — preserved from previous dashboard.
  if (!firstGenerationExists && !welcomeSkipped) {
    redirect('/generate?onboarding=1');
  }

  const [
    generations,
    avatarsCount,
    coversCount,
    videosCount,
    editsCount,
    voicesCount,
    recentAvatars,
    recentCovers,
    recentVideos,
    recentEdits,
    parserItems,
    heroAvatar,
    pendingAvatarBatch,
    pendingVideo,
    pendingEdit,
    montagesCount,
    pendingMontage,
    carouselsCount,
    scheduledCount,
  ] = await Promise.all([
    prisma.avatarGeneration.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    prisma.avatar.count({ where: { userId: user.id, status: 'done' } }),
    prisma.cover.count({ where: { userId: user.id, status: 'completed' } }),
    prisma.videoGeneration.count({ where: { userId: user.id, status: 'completed' } }),
    prisma.videoEdit.count({ where: { userId: user.id, status: 'completed' } }),
    listOwnedVoices(user.id).then((v) => v.length).catch(() => 0),
    prisma.avatar.findMany({
      where: { userId: user.id, status: 'done' },
      orderBy: { createdAt: 'desc' },
      take: 6,
    }),
    prisma.cover.findMany({
      where: { userId: user.id, status: 'completed' },
      orderBy: { createdAt: 'desc' },
      take: 4,
    }),
    prisma.videoGeneration.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 3,
      include: { avatar: { select: { imageUrl: true, styleLabel: true } } },
    }),
    prisma.videoEdit.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 2,
    }),
    prisma.parserItem
      .findMany({
        where: { userId: user.id, status: { not: 'dismissed' } },
        orderBy: [{ fitScore: 'desc' }, { createdAt: 'desc' }],
        take: 5,
      })
      .catch(() => [] as Array<{ id: string; caption: string | null; fitScore: number | null }>),
    prisma.avatar.findFirst({
      where: { userId: user.id, status: 'done' },
      orderBy: [{ selected: 'desc' }, { createdAt: 'desc' }],
    }),
    prisma.avatarGeneration.findFirst({
      where: { userId: user.id, status: { in: ['processing', 'pending'] } },
    }),
    prisma.videoGeneration.findFirst({
      where: { userId: user.id, status: { in: ['processing', 'pending'] } },
    }),
    prisma.videoEdit.findFirst({
      where: { userId: user.id, status: { in: ['processing', 'pending'] } },
    }),
    prisma.montage.count({ where: { userId: user.id, status: 'completed' } }),
    prisma.montage.findFirst({
      where: { userId: user.id, status: { in: ['processing', 'pending'] } },
    }),
    prisma.carouselDraft.count({ where: { userId: user.id } }),
    prisma.scheduledPost.count({ where: { userId: user.id, status: 'scheduled' } }),
  ]);

  const lowBalance = user.tokenBalance < COSTS.avatarGeneration;
  const heroImage =
    heroAvatar?.imageUrl ||
    recentAvatars[0]?.imageUrl ||
    null;

  const displayName = (user.name || user.email.split('@')[0]).split(' ')[0];

  // Activity feed — derived from real timestamps in the DB.
  type Activity = { time: Date; label: string; tone: StatusTone };
  const activity: Activity[] = [];
  for (const g of generations.slice(0, 3)) {
    activity.push({
      time: g.createdAt,
      label: `Пакет аватаров · ${mapStatus(g.status).label.toLowerCase()}`,
      tone: mapStatus(g.status).tone,
    });
  }
  for (const v of recentVideos.slice(0, 2)) {
    activity.push({
      time: v.createdAt,
      label: `Видео · ${mapStatus(v.status).label.toLowerCase()}`,
      tone: mapStatus(v.status).tone,
    });
  }
  for (const e of recentEdits.slice(0, 2)) {
    activity.push({
      time: e.createdAt,
      label: `Монтаж · ${mapStatus(e.status).label.toLowerCase()}`,
      tone: mapStatus(e.status).tone,
    });
  }
  for (const c of recentCovers.slice(0, 2)) {
    activity.push({
      time: c.createdAt,
      label: `Обложка · ${c.title || c.id.slice(0, 6)}`,
      tone: 'ready',
    });
  }
  activity.sort((a, b) => b.time.getTime() - a.time.getTime());

  return (
    <div className="space-y-12">
      {/* === HERO === */}
      <section className="panel relative overflow-hidden !rounded-[28px]">
        <div className="hero-gradient pointer-events-none absolute inset-0" />
        <div className="relative grid lg:grid-cols-[1.05fr_0.95fr] gap-0">
          {/* Left: headline */}
          <div className="p-7 lg:p-12 flex flex-col justify-between min-h-[400px] lg:min-h-[520px]">
            <div>
              <div className="eyebrow mb-6 reveal">
                <span className="h-1.5 w-1.5 rounded-full bg-gold shadow-[0_0_8px_2px_rgba(59,140,255,0.6)]" />
                С возвращением, {displayName}
              </div>
              <h1 className="display-2 mb-6 reveal" style={{ ['--i' as string]: 1 } as React.CSSProperties}>
                AI создаёт.<br />
                <span className="italic text-gold">Ты вдохновляешь.</span><br />
                Мы масштабируем.
              </h1>
              <p
                className="reveal text-[16px] leading-[1.6] text-text-dim max-w-[44ch]"
                style={{ ['--i' as string]: 2 } as React.CSSProperties}
              >
                Личная AI-студия контента: аватары, голос, видео, карусели и монтаж
                по скиллам — всё в одном месте.
              </p>
            </div>

            <div
              className="mt-10 flex flex-wrap items-center gap-3 reveal"
              style={{ ['--i' as string]: 3 } as React.CSSProperties}
            >
              <Link href="/generate" className="btn-primary">
                Открыть студию
                <ArrowRight size={16} strokeWidth={2.2} aria-hidden="true" />
              </Link>
              <Link href="/help" className="btn-ghost">
                <Play size={14} strokeWidth={2.2} aria-hidden="true" />
                Как это работает
              </Link>
            </div>
          </div>

          {/* Right: portrait */}
          <div className="relative m-3 lg:m-4 lg:ml-0 rounded-[22px] bg-white/[0.03] border border-border-soft min-h-[320px] lg:min-h-[488px] overflow-hidden fade-in">
            {heroImage ? (
              <div
                className="absolute inset-0 bg-cover bg-center"
                style={{ backgroundImage: `url(${heroImage})` }}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center p-6">
                <div className="flex flex-col items-center text-center gap-4">
                  <div className="pop-in">
                    <Icon3D name="avatar" size={56} tile sway />
                  </div>
                  <div className="text-[22px] font-semibold tracking-[-0.02em] text-text-dim">
                    портрета пока нет
                  </div>
                  <Link href="/generate" className="btn-ghost">
                    Создать первый аватар
                    <ArrowRight size={16} strokeWidth={2.2} aria-hidden="true" />
                  </Link>
                </div>
              </div>
            )}
            {heroImage && (
              <div className="absolute inset-0 bg-gradient-to-t from-bg-main/70 via-transparent to-transparent pointer-events-none" />
            )}
            <div className="absolute top-4 right-4 eyebrow !py-1 !px-3 !text-[11px]">
              Персона · {new Date().getFullYear()}
            </div>
            <div className="absolute bottom-4 right-4 text-right">
              <div className="text-[12px] text-text-dim">основной аватар</div>
              {heroAvatar?.styleLabel && (
                <div className="text-[16px] font-semibold tracking-[-0.01em] text-text-primary">{heroAvatar.styleLabel}</div>
              )}
            </div>
          </div>
        </div>

        {lowBalance && (
          <div className="relative mx-3 mb-3 lg:mx-4 lg:mb-4 rounded-[20px] border border-pink/25 bg-pink/[0.08] px-5 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 text-[14px] text-text">
              <Icon3D name="warning" size={22} />
              <span>
                <span className="font-semibold text-pink">мало токенов</span>
                <span className="text-text-dim"> · осталось {user.tokenBalance} · пакет аватаров стоит {COSTS.avatarGeneration}</span>
              </span>
            </div>
            <Link href="/billing" className="btn-ghost !border-pink/40 hover:!border-pink">
              Пополнить
              <ArrowRight size={16} strokeWidth={2.2} aria-hidden="true" />
            </Link>
          </div>
        )}
      </section>

      {/* === STATS ROW === */}
      <section>
        <SectionHeader num="/01" title="Студия в цифрах" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 stagger">
          <MetricCard label="Видео" value={videosCount} accent="gold" icon="videos" />
          <MetricCard label="Аватары" value={avatarsCount} accent="lime" icon="avatar" />
          <MetricCard label="Голоса" value={voicesCount} accent="cyan" icon="voice" />
          <MetricCard label="Обложки" value={coversCount} accent="pink" icon="covers" />
          <MetricCard label="Монтажи" value={editsCount + montagesCount} accent="gold" icon="montage" />
        </div>
      </section>

      {/* === CREATE NEXT MASTERPIECE === */}
      <section>
        <SectionHeader num="/02" title="Что создаём" right={<span className="text-[12px] text-text-mute">5 инструментов</span>} />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 stagger">
          <FeatureCard
            href="/generate"
            kicker="01 · Аватар"
            title="Цифровая версия тебя из одного фото"
            cost={`-${COSTS.avatarGeneration}t`}
            accent="gold"
            icon="avatar"
          />
          <FeatureCard
            href="/voice"
            kicker="02 · Голос"
            title="Клонируй свой голос для видео"
            cost="бесплатно"
            accent="lime"
            icon="voice"
          />
          <FeatureCard
            href={avatarsCount > 0 ? '/videos/new' : '/generate?need=video'}
            kicker="03 · Видео"
            title="Говорящее видео с твоим аватаром"
            cost={`-${engineConfig(defaultEngine()).cost}t`}
            accent="cyan"
            icon="video"
          />
          <FeatureCard
            href="/carousels"
            kicker="04 · Карусель"
            title="Карусель по скиллу из одной темы"
            cost="по слайдам"
            accent="pink"
            icon="carousel"
          />
          <FeatureCard
            href="/montage"
            kicker="05 · Монтаж"
            title="Монтаж рилса по скиллу: паузы, титры, панчи"
            cost={`-${COSTS.kadrikMontage}t`}
            accent="gold"
            icon="montage"
          />
        </div>
      </section>

      {/* === RECENT CREATIONS === */}
      <section>
        <SectionHeader
          num="/03"
          title="Последние работы"
          right={<HeaderLink href="/avatars">Библиотека</HeaderLink>}
        />
        {recentAvatars.length + recentCovers.length + recentVideos.length === 0 ? (
          <div className="panel p-10 flex flex-col items-center text-center gap-4 reveal">
            <Icon3D name="sparkles" size={40} tile sway />
            <div className="text-[16px] text-text-dim">
              Пока пусто — начни с аватара, остальное соберётся вокруг него.
            </div>
            <Link href="/generate" className="btn-primary">
              Создать аватар
              <ArrowRight size={16} strokeWidth={2.2} aria-hidden="true" />
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 stagger">
            {recentVideos.slice(0, 2).map((v) => {
              const status = mapStatus(v.status);
              return (
                <Link
                  key={v.id}
                  href="/videos"
                  className="card-editorial overflow-hidden flex flex-col"
                >
                  <div
                    className="aspect-[4/5] relative bg-white/[0.03]"
                    style={v.avatar?.imageUrl ? { backgroundImage: `url(${v.avatar.imageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
                  >
                    <div className={`absolute top-3 left-3 ${MEDIA_TAG}`}>
                      Видео
                    </div>
                    <div className="absolute bottom-3 left-3">
                      <span className={`${statusClass[status.tone]} bg-black/60 backdrop-blur`}>{status.label}</span>
                    </div>
                  </div>
                  <div className="p-3.5">
                    <div className="text-[14px] font-medium text-text-primary truncate">
                      {v.script ? v.script.slice(0, 38) : 'Говорящее видео'}
                    </div>
                    <div className="text-[12px] text-text-mute mt-1 tabular-nums">
                      {formatDate(v.createdAt)}
                    </div>
                  </div>
                </Link>
              );
            })}
            {recentCovers.slice(0, 2).map((c) => (
              <Link
                key={c.id}
                href="/covers"
                className="card-editorial overflow-hidden flex flex-col"
              >
                <div
                  className="aspect-[4/5] relative p-3 flex flex-col justify-between bg-white/[0.03]"
                  style={c.imageUrl ? { backgroundImage: `url(${c.imageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
                >
                  <div className={`${MEDIA_TAG} self-start`}>
                    Обложка
                  </div>
                  <div>
                    <div className="text-[17px] font-semibold tracking-[-0.01em] leading-tight text-text-primary drop-shadow">
                      {c.title}
                    </div>
                  </div>
                </div>
                <div className="p-3.5">
                  <div className="text-[12px] text-text-mute tabular-nums">
                    {formatDate(c.createdAt)}
                  </div>
                </div>
              </Link>
            ))}
            {recentAvatars.slice(0, 2).map((a) => (
              <Link
                key={a.id}
                href="/avatars"
                className="card-editorial overflow-hidden flex flex-col"
              >
                <div
                  className="aspect-[4/5] relative bg-white/[0.03]"
                  style={a.imageUrl ? { backgroundImage: `url(${a.imageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
                >
                  <div className={`absolute top-3 left-3 ${MEDIA_TAG}`}>
                    Аватар
                  </div>
                </div>
                <div className="p-3.5">
                  <div className="text-[14px] font-medium text-text-primary truncate">{a.styleLabel || a.style}</div>
                  <div className="text-[12px] text-text-mute mt-1 tabular-nums">
                    {formatDate(a.createdAt)}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* === AI AGENTS AT WORK === */}
      <section id="agents">
        <SectionHeader
          num="/04"
          title="Что сейчас в работе"
          right={
            <span className="inline-flex items-center gap-1.5 text-[12px] text-text-mute">
              <span className="h-1.5 w-1.5 rounded-full bg-green animate-pulse" />
              онлайн
            </span>
          }
        />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 stagger">
          <AgentCard
            name="Аватары"
            icon="avatar"
            task={pendingAvatarBatch ? 'Генерирую пакет аватаров' : 'Свободен · жду фото'}
            busy={!!pendingAvatarBatch}
            tone={pendingAvatarBatch ? 'processing' : 'ready'}
          />
          <AgentCard
            name="Голос"
            icon="voice"
            task={voicesCount > 0 ? `Голосов: ${voicesCount}` : 'Голос ещё не клонирован'}
            busy={false}
            tone={voicesCount > 0 ? 'ready' : 'queued'}
          />
          <AgentCard
            name="Видео"
            icon="video"
            task={pendingVideo ? 'Рендерю говорящее видео' : 'Свободен · жду сценарий'}
            busy={!!pendingVideo}
            tone={pendingVideo ? 'processing' : 'ready'}
          />
          <AgentCard
            name="Карусели"
            icon="carousel"
            task={carouselsCount > 0 ? `Каруселей: ${carouselsCount}` : 'Ещё ни одной карусели'}
            busy={false}
            tone={carouselsCount > 0 ? 'ready' : 'queued'}
          />
          <AgentCard
            name="Хуки"
            icon="hooks"
            task={parserItems.length > 0 ? `Найдено идей: ${parserItems.length}` : 'Жду запуска парсера'}
            busy={false}
            tone={parserItems.length > 0 ? 'ready' : 'queued'}
          />
          <AgentCard
            name="Монтаж"
            icon="montage"
            task={pendingMontage || pendingEdit ? 'Монтирую ролик' : 'Свободен · жду видео'}
            busy={!!(pendingMontage || pendingEdit)}
            tone={pendingMontage || pendingEdit ? 'processing' : 'ready'}
          />
        </div>
      </section>

      {/* === CONTENT PIPELINE === */}
      <section id="pipeline">
        <SectionHeader
          num="/05"
          title="Путь контента"
          right={
            <span className="inline-flex items-center gap-1.5 text-[12px] text-text-mute">
              фото <ArrowRight size={12} aria-hidden="true" /> публикация
            </span>
          }
        />
        <div className="panel p-4 lg:p-5">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 stagger">
            <PipelineStep n="01" label="Фото" href="/generate" status={avatarsCount > 0 || pendingAvatarBatch ? 'ready' : 'queued'} />
            <PipelineStep n="02" label="Аватар" href="/avatars" status={avatarsCount > 0 ? 'ready' : pendingAvatarBatch ? 'processing' : 'queued'} />
            <PipelineStep n="03" label="Голос" href="/voice" status={voicesCount > 0 ? 'ready' : 'queued'} />
            <PipelineStep n="04" label="Видео" href="/videos" status={videosCount > 0 ? 'ready' : pendingVideo ? 'processing' : 'queued'} />
            <PipelineStep n="05" label="Монтаж" href="/montage" status={editsCount + montagesCount > 0 ? 'ready' : pendingEdit || pendingMontage ? 'processing' : 'queued'} />
            <PipelineStep n="06" label="Публикация" href="/schedule" status={scheduledCount > 0 ? 'processing' : 'queued'} />
          </div>
        </div>
      </section>

      {/* === TREND INTELLIGENCE === */}
      <section>
        <SectionHeader
          num="/06"
          title="Идеи из парсера"
          right={<HeaderLink href="/parser">Открыть парсер</HeaderLink>}
        />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 stagger">
          {parserItems.length === 0 ? (
            <div className="panel p-6 flex flex-wrap items-center justify-between gap-4 md:col-span-2 lg:col-span-5">
              <div className="flex items-center gap-4 text-[15px] text-text-dim">
                <Icon3D name="trends" size={24} tile />
                Идей пока нет — найди вирусные ролики в своей нише.
              </div>
              <Link href="/research" className="btn-ghost">
                Открыть ресёрч
                <ArrowRight size={16} strokeWidth={2.2} aria-hidden="true" />
              </Link>
            </div>
          ) : (
            parserItems.slice(0, 5).map((p, i) => (
              <TrendCard
                key={p.id}
                rank={String(i + 1).padStart(2, '0')}
                topic={(p.caption || '').slice(0, 36) || 'Идея'}
                score={p.fitScore ?? 0}
              />
            ))
          )}
        </div>
      </section>

      {/* === ACTIVITY FEED + STORAGE === */}
      <section className="grid lg:grid-cols-[2fr_1fr] gap-6">
        <div>
          <SectionHeader num="/07" title="Лента событий" />
          <div className="panel overflow-hidden">
            {activity.length === 0 ? (
              <div className="p-6 flex items-center gap-4 text-[15px] text-text-dim">
                <Icon3D name="bell" size={24} tile />
                Пока тихо — событий ещё нет.
              </div>
            ) : (
              <div className="stagger">
                {activity.slice(0, 6).map((a, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-[auto_1fr_auto] gap-4 items-center px-5 py-3.5 border-b border-border-soft last:border-b-0"
                  >
                    <span className={statusClass[a.tone]}>{TONE_LABEL[a.tone]}</span>
                    <span className="text-[14px] text-text-primary truncate">{a.label}</span>
                    <span className="text-[12px] text-text-mute whitespace-nowrap tabular-nums">
                      {formatDate(a.time)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div>
          <SectionHeader num="/08" title="Баланс" />
          <BalanceCard balance={user.tokenBalance} scheduled={scheduledCount} />
        </div>
      </section>

      {/* === RECENT GENERATIONS TABLE === */}
      <section>
        <SectionHeader
          num="/09"
          title="Последние пакеты аватаров"
          right={<HeaderLink href="/avatars">Все пакеты</HeaderLink>}
        />
        {generations.length === 0 ? (
          <div className="panel p-6 flex items-center gap-4 text-[15px] text-text-dim">
            <Icon3D name="folders" size={24} tile />
            Пакетов пока нет.
          </div>
        ) : (
          <div className="panel overflow-hidden divide-y divide-border-soft stagger">
            {generations.map((g) => {
              const status = mapStatus(g.status);
              return (
                <Link
                  key={g.id}
                  href="/avatars"
                  className="grid grid-cols-[1fr_auto_auto_auto] gap-4 items-center px-5 py-3.5 hover:bg-white/[0.04] transition-colors"
                >
                  <span className="text-[15px] font-medium text-text-primary truncate">
                    Пакет от {formatDate(g.createdAt)}
                  </span>
                  <span className={statusClass[status.tone]}>{status.label}</span>
                  <span className="rounded-full bg-white/[0.05] px-2.5 py-0.5 text-[12px] text-text-dim tabular-nums">
                    -{g.tokensCost}t
                  </span>
                  <span className="text-[12px] text-text-mute whitespace-nowrap tabular-nums">
                    {formatDate(g.createdAt)}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

/* ============================================================ */
/*  Sub-components                                                */
/* ============================================================ */

type Accent = 'gold' | 'lime' | 'cyan' | 'pink';

const ACCENT_TEXT: Record<Accent, string> = {
  gold: 'text-gold',
  lime: 'text-lime',
  cyan: 'text-cyan',
  pink: 'text-pink',
};

/** small glass tag that sits on top of media previews */
const MEDIA_TAG =
  'rounded-full bg-black/55 backdrop-blur px-2.5 py-1 text-[11px] font-medium text-text-primary';

function SectionHeader({
  num,
  title,
  right,
}: {
  num: string;
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <span className="sec-num">{num}</span>
      <span className="sec-title">{title}</span>
      <span className="flex-1 border-b border-border-soft" />
      {right}
    </div>
  );
}

function HeaderLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="group inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[13px] font-medium text-gold hover:bg-blue/10 transition-colors"
    >
      {children}
      <ArrowRight size={14} strokeWidth={2.2} className="transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
    </Link>
  );
}

function MetricCard({
  label,
  value,
  accent,
  icon,
}: {
  label: string;
  value: number;
  accent: Accent;
  icon: Icon3DName;
}) {
  return (
    <div className="panel p-5">
      <div className="flex items-start justify-between gap-2 mb-4">
        <div className="text-[13px] text-text-mute">{label}</div>
        <Icon3D name={icon} size={20} tile />
      </div>
      <div className={`text-[40px] leading-none font-extrabold tabular-nums tracking-[-0.02em] ${ACCENT_TEXT[accent]}`}>{value}</div>
    </div>
  );
}

function FeatureCard({
  href,
  kicker,
  title,
  cost,
  accent,
  icon,
}: {
  href: string;
  kicker: string;
  title: string;
  cost: string;
  accent: Accent;
  icon: Icon3DName;
}) {
  return (
    <Link
      href={href}
      className="card-editorial p-5 flex flex-col justify-between gap-5 min-h-[220px] group"
    >
      <div className="flex items-start justify-between gap-2">
        <Icon3D name={icon} size={28} tile />
        <span className={`text-[12px] font-semibold ${ACCENT_TEXT[accent]}`}>{kicker}</span>
      </div>
      <div>
        <div className="text-[18px] font-semibold tracking-[-0.02em] leading-snug text-text-primary mb-4">
          {title}
        </div>
        <div className="flex items-center justify-between">
          <span className="rounded-full bg-white/[0.05] border border-border-soft px-2.5 py-0.5 text-[12px] text-text-dim tabular-nums">
            {cost}
          </span>
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.05] text-text-dim transition-all group-hover:bg-blue group-hover:text-white group-hover:translate-x-0.5">
            <ArrowRight size={16} strokeWidth={2.2} aria-hidden="true" />
          </span>
        </div>
      </div>
    </Link>
  );
}

function AgentCard({
  name,
  icon,
  task,
  busy,
  tone,
}: {
  name: string;
  icon: Icon3DName;
  task: string;
  busy: boolean;
  tone: StatusTone;
}) {
  return (
    <div className="panel p-5">
      <div className="flex items-start justify-between gap-2 mb-3">
        <Icon3D name={icon} size={20} tile />
        <span className={statusClass[tone]}>{TONE_LABEL[tone]}</span>
      </div>
      <div className="text-[15px] font-semibold tracking-[-0.01em] text-text mb-1">{name}</div>
      <div className="text-[14px] text-text-dim leading-snug min-h-[40px]">
        {task}
      </div>
      {busy && (
        <div className="mt-3 h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
          <div className="skeleton h-full w-full rounded-full" />
        </div>
      )}
    </div>
  );
}

const TONE_LABEL: Record<StatusTone, string> = {
  ready: 'Готово',
  processing: 'В работе',
  queued: 'Ожидает',
  failed: 'Ошибка',
  partial: 'Частично',
};

function PipelineStep({
  n,
  label,
  href,
  status,
}: {
  n: string;
  label: string;
  href: string;
  status: StatusTone;
}) {
  return (
    <Link href={href} className="rounded-[18px] border border-border-soft bg-white/[0.03] p-4 transition-colors hover:bg-white/[0.06] hover:border-border-2">
      <div className="mb-3"><span className="sec-num">{n}</span></div>
      <div className="text-[17px] font-semibold tracking-[-0.02em] text-text-primary mb-3">{label}</div>
      <span className={statusClass[status]}>{TONE_LABEL[status]}</span>
    </Link>
  );
}

function TrendCard({
  rank,
  topic,
  score,
}: {
  rank: string;
  topic: string;
  score: number;
}) {
  return (
    <div className="panel p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="sec-num">{rank}</span>
      </div>
      <div className="text-[17px] font-semibold tracking-[-0.02em] text-text-primary leading-snug min-h-[44px]">
        {topic}
      </div>
      <div>
        <span className="inline-flex rounded-full bg-blue/15 px-2.5 py-0.5 text-[12px] font-semibold text-gold tabular-nums">
          совпадение {score}/10
        </span>
      </div>
    </div>
  );
}

function BalanceCard({ balance, scheduled }: { balance: number; scheduled: number }) {
  const rows: { label: string; cost: number }[] = [
    { label: 'Пакет аватаров', cost: COSTS.avatarGeneration },
    { label: 'Монтаж по скиллу', cost: COSTS.kadrikMontage },
    { label: 'Говорящее видео', cost: engineConfig(defaultEngine()).cost },
    { label: 'Обложка', cost: COSTS.coverGeneration },
  ];
  return (
    <div className="panel p-5">
      <div className="flex items-baseline justify-between mb-4">
        <div className="text-[30px] font-extrabold tabular-nums tracking-[-0.02em] text-text-primary leading-none">
          {balance} <span className="text-text-mute text-[14px] font-medium">токенов</span>
        </div>
        <Icon3D name="coin" size={22} tile />
      </div>
      <ul className="space-y-2 text-[13px] text-text-dim mb-4">
        {rows.map((r) => (
          <li key={r.label} className="flex justify-between">
            <span>{r.label}</span>
            <span className="tabular-nums text-text">{r.cost}</span>
          </li>
        ))}
        <li className="flex justify-between border-t border-border-soft pt-2">
          <span>Запланировано публикаций</span>
          <span className="tabular-nums text-text">{scheduled}</span>
        </li>
      </ul>
      <Link href="/billing" className="btn-ghost w-full justify-center">
        Пополнить
        <ArrowRight size={16} strokeWidth={2.2} aria-hidden="true" />
      </Link>
    </div>
  );
}
