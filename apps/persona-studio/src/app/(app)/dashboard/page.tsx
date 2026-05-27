import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { formatDate } from '@/lib/utils';
import { COSTS } from '@/lib/tokens';

export const dynamic = 'force-dynamic';

type StatusTone = 'ready' | 'processing' | 'queued' | 'failed' | 'partial';

function mapStatus(raw: string): { label: string; tone: StatusTone } {
  const s = raw.toLowerCase();
  if (s === 'done' || s === 'completed' || s === 'ready') return { label: 'Ready', tone: 'ready' };
  if (s === 'failed' || s === 'error') return { label: 'Failed', tone: 'failed' };
  if (s === 'partial') return { label: 'Partial', tone: 'partial' };
  if (s === 'queued' || s === 'pending' || s === 'scheduled') return { label: 'Queued', tone: 'queued' };
  return { label: raw.charAt(0).toUpperCase() + raw.slice(1), tone: 'processing' };
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
  const welcomeSkipped = params.welcome === 'skipped';

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
    // "Voices trained" = distinct custom voice_ids seen across user's video jobs.
    prisma.videoGeneration.findMany({
      where: { userId: user.id, voiceId: { not: null } },
      select: { voiceId: true },
      distinct: ['voiceId'],
    }),
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
      label: `Avatar batch ${g.id.slice(0, 6)} · ${g.status}`,
      tone: mapStatus(g.status).tone,
    });
  }
  for (const v of recentVideos.slice(0, 2)) {
    activity.push({
      time: v.createdAt,
      label: `Video render · ${v.status}`,
      tone: mapStatus(v.status).tone,
    });
  }
  for (const e of recentEdits.slice(0, 2)) {
    activity.push({
      time: e.createdAt,
      label: `Submagic edit · ${e.status}`,
      tone: mapStatus(e.status).tone,
    });
  }
  for (const c of recentCovers.slice(0, 2)) {
    activity.push({
      time: c.createdAt,
      label: `Cover · ${c.title || c.id.slice(0, 6)}`,
      tone: 'ready',
    });
  }
  activity.sort((a, b) => b.time.getTime() - a.time.getTime());

  return (
    <div className="space-y-12">
      {/* === HERO === */}
      <section className="relative hero-gradient border border-border-soft overflow-hidden">
        <div className="grid lg:grid-cols-[1.05fr_0.95fr] gap-0">
          {/* Left: editorial text */}
          <div className="p-8 lg:p-14 flex flex-col justify-between min-h-[420px] lg:min-h-[560px]">
            <div>
              <div className="eyebrow mb-6">
                <span className="text-gold">◆</span> Welcome back, {displayName.toUpperCase()}
              </div>
              <h1 className="display-1 mb-6">
                AI creates.<br />
                <span className="italic text-gold">You inspire.</span><br />
                We scale.
              </h1>
              <p className="font-serif italic text-[18px] leading-[1.55] text-text-secondary max-w-[42ch]">
                Your personal AI studio for content that connects and converts.
                Avatars, voice, video, carousels — assembled by autonomous agents.
              </p>
            </div>

            <div className="mt-10 flex flex-wrap items-center gap-4">
              <Link href="/generate" className="btn-primary">
                Open Studio →
              </Link>
              <Link
                href="#pipeline"
                className="mono text-[11px] tracking-[0.22em] uppercase text-text-secondary hover:text-gold transition-colors"
              >
                Watch studio intro →
              </Link>
            </div>
          </div>

          {/* Right: cinematic portrait */}
          <div className="relative bg-bg-card min-h-[340px] lg:min-h-[560px] overflow-hidden">
            {heroImage ? (
              <div
                className="absolute inset-0 bg-cover bg-center"
                style={{ backgroundImage: `url(${heroImage})` }}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <div className="font-serif italic text-[28px] text-text-secondary mb-2">
                    no portrait yet
                  </div>
                  <Link href="/generate" className="mono text-[10px] tracking-[0.28em] uppercase text-gold hover:underline">
                    Generate first avatar →
                  </Link>
                </div>
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-l from-transparent via-bg-main/10 to-bg-main/60 pointer-events-none" />
            <div className="absolute top-6 right-6 mono text-[9px] tracking-[0.28em] uppercase text-text-primary/80">
              Persona · {new Date().getFullYear()}
            </div>
            <div className="absolute bottom-6 right-6 text-right">
              <div className="mono text-[9px] tracking-[0.28em] uppercase text-text-primary/70">primary avatar</div>
              {heroAvatar?.styleLabel && (
                <div className="font-serif italic text-[16px] text-text-primary">{heroAvatar.styleLabel}</div>
              )}
            </div>
          </div>
        </div>

        {lowBalance && (
          <div className="border-t border-border-soft px-8 lg:px-14 py-4 flex flex-wrap items-center justify-between gap-3 bg-bg-card/80">
            <div className="mono text-[10px] tracking-[0.22em] uppercase text-pink">
              ◆ low balance · {user.tokenBalance} tokens left · batch costs {COSTS.avatarGeneration}
            </div>
            <Link href="/billing" className="btn-ghost text-pink border-pink/40 hover:border-pink">
              Top up →
            </Link>
          </div>
        )}
      </section>

      {/* === STATS ROW === */}
      <section>
        <SectionHeader num="/01" title="Studio at a glance" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-px bg-border-soft border border-border-soft">
          <MetricCard label="Videos created" value={videosCount} accent="gold" />
          <MetricCard label="Avatars ready" value={avatarsCount} accent="lime" />
          <MetricCard label="Voices trained" value={voicesCount.length} accent="cyan" />
          <MetricCard label="Covers designed" value={coversCount} accent="pink" />
          <MetricCard label="Edits rendered" value={editsCount} accent="gold" />
        </div>
      </section>

      {/* === CREATE NEXT MASTERPIECE === */}
      <section>
        <SectionHeader num="/02" title="Create your next masterpiece" right={<span className="mono text-[10px] tracking-[0.22em] uppercase text-text-muted">5 surfaces</span>} />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          <FeatureCard
            href="/generate"
            kicker="01 · Avatar"
            title="Create a digital version of yourself"
            cost={`-${COSTS.avatarGeneration}t`}
            accent="gold"
          />
          <FeatureCard
            href="/voice"
            kicker="02 · Voice"
            title="Clone your voice or train a new one"
            cost="external"
            accent="lime"
          />
          <FeatureCard
            href={avatarsCount > 0 ? '/videos/new' : '/generate?need=video'}
            kicker="03 · Video"
            title="Generate videos with your avatar"
            cost={`-${COSTS.heygenVideo}t`}
            accent="cyan"
          />
          <FeatureCard
            href={avatarsCount > 0 ? '/carousels' : '/generate?need=carousel'}
            kicker="04 · Carousel"
            title="Create scroll-stopping carousel posts"
            cost="—"
            accent="pink"
          />
          <FeatureCard
            href="/edits/new"
            kicker="05 · Montage"
            title="Edit and assemble cinematic videos"
            cost={`-${COSTS.submagicEdit}t`}
            accent="gold"
          />
        </div>
      </section>

      {/* === RECENT CREATIONS === */}
      <section>
        <SectionHeader
          num="/03"
          title="Recent creations"
          right={
            <Link href="/avatars" className="mono text-[10px] tracking-[0.22em] uppercase text-gold hover:underline">
              Library →
            </Link>
          }
        />
        {recentAvatars.length + recentCovers.length + recentVideos.length === 0 ? (
          <div className="panel p-10 text-center">
            <div className="font-serif italic text-[18px] text-text-secondary mb-3">
              No creations yet — your library is a blank canvas.
            </div>
            <Link href="/generate" className="btn-primary">Start with an avatar →</Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {recentVideos.slice(0, 2).map((v) => {
              const status = mapStatus(v.status);
              return (
                <Link
                  key={v.id}
                  href="/videos"
                  className="card-editorial overflow-hidden flex flex-col"
                >
                  <div
                    className="aspect-[4/5] relative bg-bg-card"
                    style={v.avatar?.imageUrl ? { backgroundImage: `url(${v.avatar.imageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
                  >
                    <div className="absolute top-3 left-3 mono text-[8.5px] tracking-[0.22em] uppercase bg-black/60 text-text-primary px-2 py-1">
                      Talking video
                    </div>
                    <div className="absolute bottom-3 left-3">
                      <span className={statusClass[status.tone]}>{status.label}</span>
                    </div>
                  </div>
                  <div className="p-3">
                    <div className="font-serif italic text-[14px] text-text-primary truncate">
                      {v.script ? v.script.slice(0, 38) : `video ${v.id.slice(0, 6)}`}
                    </div>
                    <div className="mono text-[9px] tracking-[0.2em] uppercase text-text-muted mt-1">
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
                  className="aspect-[4/5] relative p-4 flex flex-col justify-between bg-bg-card"
                  style={c.imageUrl ? { backgroundImage: `url(${c.imageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
                >
                  <div className="mono text-[8.5px] tracking-[0.22em] uppercase bg-black/60 text-text-primary px-2 py-1 self-start">
                    Cover
                  </div>
                  <div>
                    <div className="font-serif italic text-[18px] leading-tight text-text-primary drop-shadow">
                      {c.title}
                    </div>
                  </div>
                </div>
                <div className="p-3">
                  <div className="mono text-[9px] tracking-[0.2em] uppercase text-text-muted">
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
                  className="aspect-[4/5] relative bg-bg-card"
                  style={a.imageUrl ? { backgroundImage: `url(${a.imageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
                >
                  <div className="absolute top-3 left-3 mono text-[8.5px] tracking-[0.22em] uppercase bg-black/60 text-text-primary px-2 py-1">
                    Avatar
                  </div>
                </div>
                <div className="p-3">
                  <div className="font-serif italic text-[14px] text-text-primary truncate">{a.styleLabel || a.style}</div>
                  <div className="mono text-[9px] tracking-[0.2em] uppercase text-text-muted mt-1">
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
        <SectionHeader num="/04" title="AI agents at work" right={<span className="mono text-[10px] tracking-[0.22em] uppercase text-text-muted">live</span>} />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          <AgentCard
            name="Avatar Agent"
            task={pendingAvatarBatch ? `Rendering batch ${pendingAvatarBatch.id.slice(0, 6)}` : 'Idle · ready for next batch'}
            progress={pendingAvatarBatch ? 42 : null}
            tone={pendingAvatarBatch ? 'processing' : 'ready'}
          />
          <AgentCard
            name="Voice Agent"
            task={voicesCount.length > 0 ? `${voicesCount.length} voice${voicesCount.length === 1 ? '' : 's'} connected` : 'No voice cloned yet'}
            progress={null}
            tone={voicesCount.length > 0 ? 'ready' : 'queued'}
          />
          <AgentCard
            name="Video Agent"
            task={pendingVideo ? `Generating ${pendingVideo.id.slice(0, 6)}` : 'Idle · awaiting script'}
            progress={pendingVideo ? 76 : null}
            tone={pendingVideo ? 'processing' : 'ready'}
          />
          <AgentCard
            name="Hook Agent"
            task={parserItems.length > 0 ? `Found ${parserItems.length} viral hook${parserItems.length === 1 ? '' : 's'}` : 'Awaiting parser run'}
            progress={null}
            tone={parserItems.length > 0 ? 'ready' : 'queued'}
          />
          <AgentCard
            name="Submagic Agent"
            task={pendingEdit ? `Editing ${pendingEdit.id.slice(0, 6)}` : 'Idle · awaiting video'}
            progress={pendingEdit ? 58 : null}
            tone={pendingEdit ? 'processing' : 'ready'}
          />
        </div>
      </section>

      {/* === CONTENT PIPELINE === */}
      <section id="pipeline">
        <SectionHeader num="/05" title="Content pipeline" right={<span className="mono text-[10px] tracking-[0.22em] uppercase text-text-muted">photo → publish</span>} />
        <div className="panel p-6 lg:p-8">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <PipelineStep n="01" label="Upload" status={avatarsCount > 0 || pendingAvatarBatch ? 'ready' : 'queued'} />
            <PipelineStep n="02" label="Avatar" status={avatarsCount > 0 ? 'ready' : pendingAvatarBatch ? 'processing' : 'queued'} />
            <PipelineStep n="03" label="Voice" status={voicesCount.length > 0 ? 'ready' : 'queued'} />
            <PipelineStep n="04" label="Video" status={videosCount > 0 ? 'ready' : pendingVideo ? 'processing' : 'queued'} />
            <PipelineStep n="05" label="Edit" status={editsCount > 0 ? 'ready' : pendingEdit ? 'processing' : 'queued'} />
            <PipelineStep n="06" label="Publish" status={editsCount > 0 ? 'queued' : 'queued'} />
          </div>
        </div>
      </section>

      {/* === TREND INTELLIGENCE === */}
      <section>
        <SectionHeader
          num="/06"
          title="Trend intelligence"
          right={
            <Link href="/parser" className="mono text-[10px] tracking-[0.22em] uppercase text-gold hover:underline">
              Open radar →
            </Link>
          }
        />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-px bg-border-soft border border-border-soft">
          {(parserItems.length > 0
            ? parserItems
            : [
                { id: 'mock1', caption: 'AI Avatars', fitScore: 9 },
                { id: 'mock2', caption: 'Productivity Tips', fitScore: 8 },
                { id: 'mock3', caption: 'Morning Routine', fitScore: 7 },
                { id: 'mock4', caption: 'Mindset Shift', fitScore: 7 },
                { id: 'mock5', caption: 'Digital Minimalism', fitScore: 6 },
              ]
          )
            .slice(0, 5)
            .map((p, i) => (
              <TrendCard
                key={p.id}
                rank={String(i + 1).padStart(2, '0')}
                topic={(p.caption || '').slice(0, 36) || 'Trend topic'}
                score={p.fitScore ?? 0}
                isMock={parserItems.length === 0}
              />
            ))}
        </div>
      </section>

      {/* === ACTIVITY FEED + STORAGE === */}
      <section className="grid lg:grid-cols-[2fr_1fr] gap-6">
        <div>
          <SectionHeader num="/07" title="Activity feed" />
          <div className="panel">
            {activity.length === 0 ? (
              <div className="p-6 font-serif italic text-text-secondary">No activity yet — your studio is quiet.</div>
            ) : (
              activity.slice(0, 6).map((a, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[auto_1fr_auto] gap-4 items-center px-5 py-3 border-b border-border-soft last:border-b-0"
                >
                  <span className={statusClass[a.tone]}>{a.tone}</span>
                  <span className="font-serif italic text-[14px] text-text-primary truncate">{a.label}</span>
                  <span className="mono text-[10px] tracking-[0.2em] uppercase text-text-muted whitespace-nowrap">
                    {formatDate(a.time)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div>
          <SectionHeader num="/08" title="Storage & usage" />
          <StorageCard
            avatars={avatarsCount}
            covers={coversCount}
            videos={videosCount}
            edits={editsCount}
          />
        </div>
      </section>

      {/* === RECENT GENERATIONS TABLE === */}
      <section>
        <SectionHeader
          num="/09"
          title="Last avatar batches"
          right={
            <Link href="/avatars" className="mono text-[10px] tracking-[0.22em] uppercase text-gold hover:underline">
              All batches →
            </Link>
          }
        />
        {generations.length === 0 ? (
          <div className="panel p-6 font-serif italic text-text-secondary">No batches yet.</div>
        ) : (
          <div className="panel divide-y divide-border-soft">
            {generations.map((g) => {
              const status = mapStatus(g.status);
              return (
                <Link
                  key={g.id}
                  href="/avatars"
                  className="grid grid-cols-[1fr_auto_auto_auto] gap-4 items-center px-5 py-3 hover:bg-bg-card transition-colors"
                >
                  <span className="font-serif italic text-[15px] text-text-primary truncate">
                    Batch {g.id.slice(0, 6)}
                  </span>
                  <span className={statusClass[status.tone]}>{status.label}</span>
                  <span className="mono text-[10px] tracking-[0.22em] uppercase text-text-muted">
                    -{g.tokensCost}t
                  </span>
                  <span className="mono text-[10px] tracking-[0.22em] uppercase text-text-muted whitespace-nowrap">
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
    <div className="flex items-baseline gap-4 mb-4">
      <span className="sec-num">{num}</span>
      <span className="sec-title">{title}</span>
      <span className="flex-1 border-b border-border-soft translate-y-[-3px]" />
      {right}
    </div>
  );
}

function MetricCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: 'gold' | 'lime' | 'cyan' | 'pink';
}) {
  const cls =
    accent === 'gold' ? 'text-gold' :
    accent === 'lime' ? 'text-lime' :
    accent === 'cyan' ? 'text-cyan' : 'text-pink';
  return (
    <div className="bg-bg-panel p-6">
      <div className="mono text-[9px] tracking-[0.28em] uppercase text-text-muted mb-3">{label}</div>
      <div className={`font-serif text-[44px] leading-none ${cls}`}>{value}</div>
    </div>
  );
}

function FeatureCard({
  href,
  kicker,
  title,
  cost,
  accent,
}: {
  href: string;
  kicker: string;
  title: string;
  cost: string;
  accent: 'gold' | 'lime' | 'cyan' | 'pink';
}) {
  const cls =
    accent === 'gold' ? 'text-gold' :
    accent === 'lime' ? 'text-lime' :
    accent === 'cyan' ? 'text-cyan' : 'text-pink';
  return (
    <Link
      href={href}
      className="card-editorial p-6 flex flex-col justify-between min-h-[200px] group"
    >
      <div>
        <div className={`mono text-[9px] tracking-[0.28em] uppercase ${cls}`}>{kicker}</div>
      </div>
      <div>
        <div className="font-serif italic text-[20px] leading-snug text-text-primary mb-4">
          {title}
        </div>
        <div className="flex items-center justify-between">
          <span className="mono text-[10px] tracking-[0.22em] uppercase text-text-muted">{cost}</span>
          <span className={`mono text-[14px] transition-transform group-hover:translate-x-1 ${cls}`}>→</span>
        </div>
      </div>
    </Link>
  );
}

function AgentCard({
  name,
  task,
  progress,
  tone,
}: {
  name: string;
  task: string;
  progress: number | null;
  tone: StatusTone;
}) {
  return (
    <div className="panel p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="mono text-[9px] tracking-[0.28em] uppercase text-text-muted">{name}</span>
        <span className={statusClass[tone]}>{tone}</span>
      </div>
      <div className="font-serif italic text-[14px] text-text-primary leading-snug min-h-[40px]">
        {task}
      </div>
      {progress !== null && (
        <div className="mt-3">
          <div className="h-[2px] bg-border-soft overflow-hidden">
            <div
              className="h-full bg-gold transition-all duration-700"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mono text-[9px] tracking-[0.28em] uppercase text-text-muted mt-1.5">{progress}%</div>
        </div>
      )}
    </div>
  );
}

function PipelineStep({
  n,
  label,
  status,
}: {
  n: string;
  label: string;
  status: StatusTone;
}) {
  const statusLabel = status === 'ready' ? 'Ready' : status === 'processing' ? 'Processing' : status === 'queued' ? 'Queued' : status === 'partial' ? 'Partial' : 'Failed';
  return (
    <div className="border border-border-soft p-4 bg-bg-card">
      <div className="mono text-[9px] tracking-[0.28em] uppercase text-text-muted mb-2">{n}</div>
      <div className="font-serif text-[18px] text-text-primary mb-2">{label}</div>
      <span className={statusClass[status]}>{statusLabel}</span>
    </div>
  );
}

function TrendCard({
  rank,
  topic,
  score,
  isMock,
}: {
  rank: string;
  topic: string;
  score: number;
  isMock: boolean;
}) {
  return (
    <div className="bg-bg-panel p-5 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="mono text-[10px] tracking-[0.28em] uppercase text-text-muted">{rank}</span>
        {isMock && <span className="mono text-[8px] tracking-[0.28em] uppercase text-text-muted/60">mock</span>}
      </div>
      <div className="font-serif italic text-[18px] text-text-primary leading-snug min-h-[44px]">
        {topic}
      </div>
      <div className="mono text-[10px] tracking-[0.22em] uppercase text-gold">
        fit {score}/10
      </div>
    </div>
  );
}

function StorageCard({
  avatars,
  covers,
  videos,
  edits,
}: {
  avatars: number;
  covers: number;
  videos: number;
  edits: number;
}) {
  // Rough estimate until storage tracking lands: avg sizes per asset type in MB.
  const usedMb = avatars * 1.2 + covers * 1.6 + videos * 28 + edits * 24;
  const quotaGb = 200;
  const usedGb = usedMb / 1024;
  const pct = Math.min(100, (usedGb / quotaGb) * 100);

  return (
    <div className="panel p-5">
      <div className="flex items-baseline justify-between mb-3">
        <div className="font-serif text-[26px] text-text-primary leading-none">
          {usedGb.toFixed(1)} <span className="text-text-muted text-[14px]">/ {quotaGb} GB</span>
        </div>
        <span className="mono text-[9px] tracking-[0.28em] uppercase text-gold">{pct.toFixed(0)}%</span>
      </div>
      <div className="h-[3px] bg-border-soft overflow-hidden mb-4">
        <div className="h-full bg-gold transition-all duration-700" style={{ width: `${pct}%` }} />
      </div>
      <ul className="space-y-1.5 mono text-[10px] tracking-[0.22em] uppercase text-text-secondary">
        <li className="flex justify-between"><span>Videos</span><span>{videos}</span></li>
        <li className="flex justify-between"><span>Avatars</span><span>{avatars}</span></li>
        <li className="flex justify-between"><span>Covers</span><span>{covers}</span></li>
        <li className="flex justify-between"><span>Edits</span><span>{edits}</span></li>
      </ul>
    </div>
  );
}
