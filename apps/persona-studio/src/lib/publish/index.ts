// Publish dispatcher — turns one PostTarget into a real post on its platform,
// then rolls up the parent ScheduledPost status.
//
// Called by the post-publish BullMQ worker (one job per PostTarget). Idempotent
// enough for retries: a target already 'published' is skipped.

import { prisma } from '@/lib/prisma';
import { publishQueue } from '@/lib/queue';
import { decryptToken } from './crypto';
import { publishReel, InstagramError } from './instagram';
import { sendChannelVideo } from './telegram-channel';

export class PublishError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'PublishError';
  }
}

/**
 * Immediately enqueue all (pending/failed) targets of a post — used by the
 * create route when scheduledAt<=now and by publish-now. Flips the post to
 * 'publishing' so the cron sweep won't double-claim it. Returns # enqueued.
 */
export async function enqueuePostNow(postId: string): Promise<number> {
  await prisma.scheduledPost.update({
    where: { id: postId },
    data: { status: 'publishing' },
  });
  const targets = await prisma.postTarget.findMany({
    where: { scheduledPostId: postId, status: { in: ['pending', 'failed'] } },
    select: { id: true },
  });
  const queue = publishQueue();
  for (const t of targets) {
    await queue.add('publish', { targetId: t.id }, { jobId: `publish:${t.id}` });
  }
  return targets.length;
}

/**
 * Publish a single target. Updates the PostTarget row in place and then
 * recomputes the parent ScheduledPost status. Returns the final target status.
 */
export async function publishTarget(targetId: string): Promise<'published' | 'failed'> {
  const target = await prisma.postTarget.findUnique({
    where: { id: targetId },
    include: { socialAccount: true, scheduledPost: true },
  });
  if (!target) throw new PublishError('TARGET_NOT_FOUND', `PostTarget ${targetId} not found`);

  // Already done — idempotent no-op (e.g. duplicate job).
  if (target.status === 'published') return 'published';

  const post = target.scheduledPost;
  const account = target.socialAccount;

  await prisma.postTarget.update({
    where: { id: target.id },
    data: { status: 'publishing', attempts: { increment: 1 }, errorMsg: null },
  });

  try {
    if (account.status !== 'active') {
      throw new PublishError('ACCOUNT_INACTIVE', `Канал отключён или токен истёк (${account.status})`);
    }
    if (!post.mediaUrl) {
      throw new PublishError('NO_MEDIA', 'У публикации нет медиа-URL');
    }

    let remoteId: string;
    let permalink: string | null = null;

    if (target.platform === 'instagram') {
      if (!account.accessToken) {
        throw new PublishError('NO_TOKEN', 'У Instagram-аккаунта нет токена');
      }
      const token = decryptToken(account.accessToken);
      const res = await publishReel({
        igUserId: account.externalId,
        token,
        videoUrl: post.mediaUrl,
        caption: post.caption ?? undefined,
      });
      remoteId = res.mediaId;
      permalink = res.permalink;
    } else if (target.platform === 'telegram') {
      const res = await sendChannelVideo({
        chatId: account.externalId,
        videoUrl: post.mediaUrl,
        caption: post.caption ?? undefined,
      });
      remoteId = String(res.messageId);
      permalink = res.permalink;
    } else {
      throw new PublishError('UNKNOWN_PLATFORM', `Платформа не поддерживается: ${target.platform}`);
    }

    await prisma.postTarget.update({
      where: { id: target.id },
      data: { status: 'published', remoteId, permalink, publishedAt: new Date(), errorMsg: null },
    });

    // If IG auth failed mid-flight elsewhere we'd mark expired — handled in catch.
    await rollupPostStatus(post.id);
    return 'published';
  } catch (err) {
    const msg = errorMessage(err);

    // Auth failures on IG → mark the account expired so the UI prompts reconnect.
    if (
      target.platform === 'instagram' &&
      err instanceof InstagramError &&
      /190|access token|expired|OAuth/i.test(`${err.code} ${err.message}`)
    ) {
      await prisma.socialAccount.update({
        where: { id: account.id },
        data: { status: 'expired' },
      });
    }

    await prisma.postTarget.update({
      where: { id: target.id },
      data: { status: 'failed', errorMsg: msg.slice(0, 500) },
    });
    await rollupPostStatus(post.id);
    // Re-throw so BullMQ records the failure / retries per job options.
    throw err instanceof Error ? err : new PublishError('PUBLISH_FAILED', msg);
  }
}

/**
 * Recompute ScheduledPost.status from its targets:
 *   all published        → published
 *   none published, some failed (no pending) → failed
 *   mix of published+failed (no pending)     → partial
 *   still pending/publishing                  → publishing (leave as-is)
 */
async function rollupPostStatus(postId: string): Promise<void> {
  const targets = await prisma.postTarget.findMany({
    where: { scheduledPostId: postId },
    select: { status: true },
  });
  if (targets.length === 0) return;

  const published = targets.filter((t) => t.status === 'published').length;
  const failed = targets.filter((t) => t.status === 'failed').length;
  const settled = published + failed;

  if (settled < targets.length) return; // still in flight — keep 'publishing'

  let status: string;
  if (failed === 0) status = 'published';
  else if (published === 0) status = 'failed';
  else status = 'partial';

  await prisma.scheduledPost.update({
    where: { id: postId },
    data: {
      status,
      publishedAt: published > 0 ? new Date() : null,
      errorMsg: failed > 0 ? `${failed}/${targets.length} каналов не опубликовано` : null,
    },
  });
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return `${(err as { code?: string }).code ?? err.name}: ${err.message}`;
  return String(err);
}
