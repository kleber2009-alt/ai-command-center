// Server side of the pipeline: load a Pipeline with the rows it links to,
// re-derive its stage from them (persisting a change), serialize for the UI,
// and start a HeyGen video from an account look.

import type { Pipeline } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { chargeTokens, refundTokens, InsufficientTokensError } from '@/lib/tokens';
import { queueForName } from '@/lib/queue';
import { engineConfig } from '@/lib/video-engines';
import { normalizeTone } from '@/lib/studio/persona';
import { deriveStage } from './stage';
import type { PipelineGate, PipelineKind, PipelineStage, PipelineView } from './types';
import type { ScriptVoice } from './script';

export async function findPipeline(userId: string, id: string) {
  return prisma.pipeline.findFirst({ where: { id, userId } });
}

async function linked(p: Pipeline) {
  const [source, video, montage, post] = await Promise.all([
    p.parserItemId
      ? prisma.parserItem.findFirst({ where: { id: p.parserItemId, userId: p.userId } })
      : null,
    p.videoGenerationId
      ? prisma.videoGeneration.findFirst({
          where: { id: p.videoGenerationId, userId: p.userId },
          select: { id: true, status: true, videoUrl: true, errorMsg: true, tokensCost: true, createdAt: true },
        })
      : null,
    p.montageId
      ? prisma.montage.findFirst({
          where: { id: p.montageId, userId: p.userId },
          select: { id: true, style: true, status: true, resultUrl: true, progress: true, errorMsg: true, tokensCost: true, createdAt: true },
        })
      : null,
    p.scheduledPostId
      ? prisma.scheduledPost.findFirst({
          where: { id: p.scheduledPostId, userId: p.userId },
          select: {
            id: true,
            status: true,
            scheduledAt: true,
            publishedAt: true,
            errorMsg: true,
            targets: {
              select: { platform: true, status: true, permalink: true, socialAccount: { select: { displayName: true } } },
            },
          },
        })
      : null,
  ]);
  return { source, video, montage, post };
}

/** Load links, re-derive the stage (saving it when it moved) and serialize. */
export async function pipelineView(p: Pipeline): Promise<PipelineView> {
  const l = await linked(p);
  const derived = deriveStage({
    kind: p.kind,
    stage: p.stage,
    script: p.script,
    montageStyle: p.montageStyle,
    video: l.video,
    montage: l.montage,
    post: l.post,
  });
  let row = p;
  if (derived.stage !== p.stage || (derived.errorMsg ?? null) !== (p.errorMsg ?? null)) {
    row = await prisma.pipeline.update({
      where: { id: p.id },
      data: { stage: derived.stage, errorMsg: derived.errorMsg },
    });
  }
  return serialize(row, l);
}

function serialize(p: Pipeline, l: Awaited<ReturnType<typeof linked>>): PipelineView {
  const s = l.source;
  return {
    id: p.id,
    kind: (p.kind === 'carousel' ? 'carousel' : 'reel') as PipelineKind,
    stage: p.stage as PipelineStage,
    title: p.title,
    sourceText: p.sourceText,
    script: p.script,
    similarity: p.similarity,
    gate: (p.gate as PipelineGate | null) ?? null,
    heygenAvatarId: p.heygenAvatarId,
    heygenAvatarName: p.heygenAvatarName,
    heygenAvatarImage: p.heygenAvatarImage,
    voiceId: p.voiceId,
    voiceName: p.voiceName,
    montageStyle: p.montageStyle,
    videoGenerationId: p.videoGenerationId,
    montageId: p.montageId,
    carouselDraftId: p.carouselDraftId,
    scheduledPostId: p.scheduledPostId,
    errorMsg: p.errorMsg,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    source: s
      ? {
          id: s.id,
          url: s.url,
          kind: s.kind,
          source: s.source,
          owner: s.owner,
          thumbnailUrl: s.thumbnailUrl,
          caption: s.caption,
          plays: s.plays,
          likes: s.likes,
          comments: s.comments,
          shares: s.shares,
          durationSec: s.durationSec,
          videoUrl: s.videoUrl,
          slideImages: s.slideImages,
          ageHours: s.ageHours,
        }
      : null,
    video: l.video ? { ...l.video, createdAt: l.video.createdAt.toISOString() } : null,
    montage: l.montage ? { ...l.montage, createdAt: l.montage.createdAt.toISOString() } : null,
    post: l.post
      ? {
          id: l.post.id,
          status: l.post.status,
          scheduledAt: l.post.scheduledAt.toISOString(),
          publishedAt: l.post.publishedAt?.toISOString() ?? null,
          errorMsg: l.post.errorMsg,
          targets: l.post.targets.map((t) => ({
            platform: t.platform,
            status: t.status,
            permalink: t.permalink,
            displayName: t.socialAccount?.displayName ?? null,
          })),
        }
      : null,
  };
}

/** The owner's voice for the script writer — from the default persona, if any. */
export async function scriptVoiceFor(userId: string, fallbackName: string | null): Promise<ScriptVoice> {
  const persona = await prisma.persona.findFirst({
    where: { userId },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    select: { name: true, lang: true, tone: true },
  });
  const tone = persona ? normalizeTone(persona.tone) : {};
  return {
    name: persona?.name || fallbackName || 'автор',
    lang: persona?.lang || 'ru',
    examples: tone.examples ?? [],
    taboo: tone.taboo ?? [],
  };
}

// ── Video from a HeyGen-account look ─────────────────────────────────────

export type StartVideoResult =
  | { ok: true; videoId: string; cost: number }
  | { ok: false; status: number; body: Record<string, unknown> };

/**
 * Same charging contract as POST /api/videos: charge → create row → enqueue,
 * refund + mark failed when the queue is down. The worker refunds on failure.
 */
export async function startLookVideo(opts: {
  userId: string;
  look: { id: string; type: string; name: string; image: string | null; engine: 'avatar_v' | 'avatar_iv' };
  voiceId: string;
  script: string;
  aspect: '9:16' | '1:1' | '16:9';
  language: string;
}): Promise<StartVideoResult> {
  // Avatar V slot; heygenVersion picks the v3 engine for account looks.
  const engine = 'heygen-v5' as const;
  const cfg = engineConfig(engine);
  try {
    await chargeTokens({ userId: opts.userId, amount: cfg.cost, reason: `video:${engine}:pipeline` });
  } catch (e) {
    if (e instanceof InsufficientTokensError) {
      return { ok: false, status: 402, body: { error: 'insufficient_tokens', have: e.have, need: e.need } };
    }
    throw e;
  }

  const video = await prisma.videoGeneration.create({
    data: {
      userId: opts.userId,
      avatarId: null,
      heygenAvatarId: opts.look.id,
      heygenAvatarType: opts.look.type,
      heygenAvatarName: opts.look.name,
      heygenAvatarImage: opts.look.image,
      engine,
      script: opts.script,
      voiceId: opts.voiceId,
      language: opts.language,
      aspect: opts.aspect,
      quality: '1080p',
      background: null,
      subtitles: false,
      heygenVersion: opts.look.engine === 'avatar_iv' ? 'IV' : 'V',
      status: 'pending',
      tokensCost: cfg.cost,
    },
  });

  try {
    await queueForName(cfg.queueName).add('generate', { videoId: video.id, userId: opts.userId }, { jobId: video.id });
  } catch (e) {
    console.error('[pipeline] video enqueue failed', e);
    await refundTokens({ userId: opts.userId, amount: cfg.cost, reason: `video:${engine}:enqueue-failed`, refId: video.id });
    await prisma.videoGeneration.update({ where: { id: video.id }, data: { status: 'failed', errorMsg: 'enqueue_failed' } });
    return { ok: false, status: 500, body: { error: 'enqueue_failed' } };
  }
  return { ok: true, videoId: video.id, cost: cfg.cost };
}
