// Scheduled-post creation — shared by POST /api/schedule/posts and the
// pipeline wizard (POST /api/pipelines/:id/schedule).
//
// We snapshot the source's final media into mediaUrl (a carousel stores its
// slide PNG URLs newline-separated, in order), fan it out into one PostTarget
// per chosen SocialAccount, and — if scheduledAt is already due — enqueue it
// immediately (otherwise the schedule-cron sweep picks it up).

import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { enqueuePostNow } from '@/lib/publish';
import { INSTAGRAM_CAROUSEL_MAX } from '@/lib/publish/postmypost';

export const ScheduleBody = z.object({
  sourceType: z.enum(['video', 'edit', 'montage', 'carousel']),
  sourceId: z.string().min(1),
  caption: z.string().max(2200).optional(),
  scheduledAt: z.string().datetime(),
  accountIds: z.array(z.string().min(1)).min(1).max(10),
});
export type ScheduleInput = z.infer<typeof ScheduleBody>;

export type ScheduleResult = { status: number; body: Record<string, unknown> };

function res(body: Record<string, unknown>, init?: { status: number }): ScheduleResult {
  return { status: init?.status ?? 200, body };
}

export async function createScheduledPost(userId: string, input: ScheduleInput): Promise<ScheduleResult> {
  const { sourceType, sourceId, caption, scheduledAt, accountIds } = input;

  // Resolve the source mp4 and verify ownership + readiness.
  let mediaUrl: string | null = null;
  if (sourceType === 'video') {
    const v = await prisma.videoGeneration.findFirst({ where: { id: sourceId, userId } });
    if (!v) return res({ error: 'source_not_found' }, { status: 404 });
    if (v.status !== 'completed' || !v.videoUrl) {
      return res({ error: 'source_not_ready', status: v.status }, { status: 409 });
    }
    mediaUrl = v.videoUrl;
  } else if (sourceType === 'edit') {
    const e = await prisma.videoEdit.findFirst({ where: { id: sourceId, userId } });
    if (!e) return res({ error: 'source_not_found' }, { status: 404 });
    if (e.status !== 'completed' || !e.resultUrl) {
      return res({ error: 'source_not_ready', status: e.status }, { status: 409 });
    }
    mediaUrl = e.resultUrl;
  } else if (sourceType === 'montage') {
    const m = await prisma.montage.findFirst({ where: { id: sourceId, userId } });
    if (!m) return res({ error: 'source_not_found' }, { status: 404 });
    if (m.status !== 'completed' || !m.resultUrl) {
      return res({ error: 'source_not_ready', status: m.status }, { status: 409 });
    }
    if (m.format === 'text') return res({ error: 'source_not_video' }, { status: 409 });
    mediaUrl = m.resultUrl;
  } else {
    const c = await prisma.carouselDraft.findFirst({ where: { id: sourceId, userId } });
    if (!c) return res({ error: 'source_not_found' }, { status: 404 });
    const urls = c.imageUrls.filter(Boolean);
    if (urls.length < 2 || urls.length !== c.slidesCount) {
      return res({ error: 'source_not_ready', status: c.status }, { status: 409 });
    }
    mediaUrl = urls.join('\n');
  }

  // Verify all targets belong to the user and are active.
  const accounts = await prisma.socialAccount.findMany({
    where: { id: { in: accountIds }, userId },
  });
  if (accounts.length !== accountIds.length) {
    return res({ error: 'account_not_found' }, { status: 404 });
  }
  const inactive = accounts.find((a) => a.status !== 'active');
  if (inactive) {
    return res(
      { error: 'account_inactive', accountId: inactive.id, status: inactive.status },
      { status: 409 },
    );
  }

  // Carousels go out as a Telegram album or an Instagram carousel (PostMyPost,
  // publication_type POST with several file_ids — 2..10 slides).
  if (sourceType === 'carousel') {
    if (accounts.some((a) => a.platform !== 'telegram' && a.platform !== 'instagram')) {
      return res({ error: 'carousel_telegram_only' }, { status: 409 });
    }
    const slides = (mediaUrl ?? '').split('\n').filter(Boolean).length;
    if (accounts.some((a) => a.platform === 'instagram') && slides > INSTAGRAM_CAROUSEL_MAX) {
      return res({ error: 'carousel_too_many_slides', max: INSTAGRAM_CAROUSEL_MAX }, { status: 409 });
    }
  }

  const when = new Date(scheduledAt);

  const post = await prisma.scheduledPost.create({
    data: {
      userId,
      sourceType,
      videoGenerationId: sourceType === 'video' ? sourceId : null,
      videoEditId: sourceType === 'edit' ? sourceId : null,
      mediaUrl,
      caption: caption ?? null,
      scheduledAt: when,
      status: 'scheduled',
      targets: {
        create: accounts.map((a) => ({
          socialAccountId: a.id,
          platform: a.platform,
          status: 'pending',
        })),
      },
    },
    include: { targets: true },
  });

  // Due now (or in the past) → enqueue immediately instead of waiting a tick.
  if (when.getTime() <= Date.now()) {
    await enqueuePostNow(post.id);
  }

  return res({ ok: true, post }, { status: 201 });
}
