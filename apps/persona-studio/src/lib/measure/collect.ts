// Module D · авто-коллектор метрик (Мастер-ТЗ §6). Тянет статистику
// опубликованных постов и пишет суточный снимок через recordMetric.
//
// Реальность по площадкам (§9):
//   - instagram: через PostMyPost (remoteId='pmp:<pubId>') — getPublicationStats.
//   - telegram:  Bot API не отдаёт просмотры постов канала → пропускаем
//                (нужен MTProto). Останется ручной ввод.

import { prisma } from '@/lib/prisma';
import { getPublicationStats } from '@/lib/publish/postmypost';
import { recordMetric } from './measure';

export type CollectOutcome =
  | { ok: true; collected: boolean; reason?: string }
  | { ok: false; reason: string };

type TargetRow = {
  id: string;
  platform: string;
  remoteId: string | null;
  scheduledPost: { userId: string };
};

/** Собирает метрики одного таргета (best-effort) и пишет снимок за сегодня. */
export async function collectForTarget(target: TargetRow): Promise<CollectOutcome> {
  if (target.platform === 'instagram' && target.remoteId?.startsWith('pmp:')) {
    const pubId = Number(target.remoteId.slice(4));
    if (!Number.isFinite(pubId)) return { ok: false, reason: 'bad_remote_id' };
    const stats = await getPublicationStats(pubId);
    if (!stats || stats.views == null) return { ok: true, collected: false, reason: 'no_stats_yet' };
    const now = new Date();
    const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    await recordMetric({
      userId: target.scheduledPost.userId,
      postTargetId: target.id,
      day,
      views: stats.views ?? 0,
      likes: stats.likes ?? 0,
      comments: stats.comments ?? 0,
      saves: stats.saves ?? 0,
      shares: stats.shares ?? 0,
      source: 'postmypost',
    });
    return { ok: true, collected: true };
  }
  if (target.platform === 'telegram') {
    return { ok: true, collected: false, reason: 'telegram_views_need_mtproto' };
  }
  return { ok: true, collected: false, reason: 'unsupported_platform' };
}

const SELECT = {
  id: true,
  platform: true,
  remoteId: true,
  scheduledPost: { select: { userId: true } },
} as const;

/** По запросу пользователя — собрать метрики всех его опубликованных постов. */
export async function collectForUser(userId: string): Promise<{ collected: number; skipped: number }> {
  const targets = await prisma.postTarget.findMany({
    where: { status: 'published', scheduledPost: { userId } },
    select: SELECT,
    orderBy: { publishedAt: 'desc' },
    take: 200,
  });
  let collected = 0;
  let skipped = 0;
  for (const t of targets) {
    try {
      const r = await collectForTarget(t);
      if (r.ok && r.collected) collected++;
      else skipped++;
    } catch {
      skipped++;
    }
  }
  return { collected, skipped };
}

/** Cron: собрать метрики недавно опубликованных постов по всем юзерам. */
export async function collectDue(opts?: { sinceDays?: number; limit?: number }): Promise<{
  collected: number;
  skipped: number;
}> {
  const sinceDays = opts?.sinceDays ?? 30;
  const since = new Date(Date.now() - sinceDays * 86_400_000);
  const targets = await prisma.postTarget.findMany({
    where: {
      status: 'published',
      platform: 'instagram', // только то, для чего есть рабочий источник метрик
      publishedAt: { gte: since },
    },
    select: SELECT,
    orderBy: { publishedAt: 'desc' },
    take: opts?.limit ?? 500,
  });
  let collected = 0;
  let skipped = 0;
  for (const t of targets) {
    try {
      const r = await collectForTarget(t);
      if (r.ok && r.collected) collected++;
      else skipped++;
    } catch {
      skipped++;
    }
  }
  return { collected, skipped };
}
