// Recurring background jobs for the Research module:
//
//   - radar-sweep: every 15 min — find enabled ResearchRadar rows whose
//     (now - lastRunAt) > intervalHrs and run them via lib/research/run-radar.
//
//   - watchlist-sweep: every hour — find ResearchAuthor rows that are
//     referenced by any ResearchWatchlist entry AND whose lastIndexedAt
//     is older than the watchlist row's refreshInterval — re-index them
//     via lib/research/index-author force=true.
//
// Both sweeps are idempotent: lastRunAt / lastIndexedAt updates inside
// the called function gate re-execution. The sweep itself just enumerates.
//
// Job uniqueness keys (jobId) prevent duplicate runs on the same
// radar/author within the same sweep tick.

import { Queue, Worker, type WorkerOptions } from 'bullmq';
import { connection } from '@/lib/queue';
import { prisma } from '@/lib/prisma';
import { runRadar } from '@/lib/research/run-radar';
import { indexAuthor } from '@/lib/research/index-author';

const QUEUE_NAME = 'research-cron';
const TICK_RADAR_MS = 15 * 60 * 1000;
const TICK_WATCHLIST_MS = 60 * 60 * 1000;
const CONCURRENCY = 2;

type RadarSweepJob = { kind: 'radar-sweep' };
type WatchlistSweepJob = { kind: 'watchlist-sweep' };
type RadarRunJob = { kind: 'radar-run'; radarId: string };
type AuthorRefreshJob = { kind: 'author-refresh'; authorId: string };
type CronJob = RadarSweepJob | WatchlistSweepJob | RadarRunJob | AuthorRefreshJob;

let _queue: Queue<CronJob> | null = null;
function researchCronQueue() {
  if (!_queue) {
    _queue = new Queue<CronJob>(QUEUE_NAME, {
      connection: connection(),
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: { age: 24 * 3600, count: 200 },
        removeOnFail: { age: 7 * 24 * 3600, count: 500 },
      },
    });
  }
  return _queue;
}

/**
 * Регистрируем recurring jobs (BullMQ repeat). Идемпотентно — повторный
 * вызов не создаёт дубль (BullMQ дедуплицирует repeat'ы по key).
 */
async function scheduleRecurring(): Promise<void> {
  const queue = researchCronQueue();
  await queue.add(
    'radar-sweep',
    { kind: 'radar-sweep' },
    { repeat: { every: TICK_RADAR_MS }, jobId: 'recurring:radar-sweep' },
  );
  await queue.add(
    'watchlist-sweep',
    { kind: 'watchlist-sweep' },
    { repeat: { every: TICK_WATCHLIST_MS }, jobId: 'recurring:watchlist-sweep' },
  );
  console.log(
    `[research-cron] scheduled radar-sweep every ${TICK_RADAR_MS / 60_000}min, watchlist-sweep every ${TICK_WATCHLIST_MS / 60_000}min`,
  );
}

async function handleRadarSweep(): Promise<{ enqueued: number }> {
  const radars = await prisma.researchRadar.findMany({
    where: { enabled: true },
    select: { id: true, intervalHrs: true, lastRunAt: true },
  });
  const due = radars.filter((r) => {
    if (!r.lastRunAt) return true;
    return Date.now() - r.lastRunAt.getTime() >= r.intervalHrs * 3_600_000;
  });
  const queue = researchCronQueue();
  for (const r of due) {
    await queue.add(
      'radar-run',
      { kind: 'radar-run', radarId: r.id },
      // jobId предотвращает запуск второго run'а того же радара в той же
      // 15-минутной волне sweep'а
      { jobId: `radar-run:${r.id}:${Math.floor(Date.now() / TICK_RADAR_MS)}` },
    );
  }
  return { enqueued: due.length };
}

async function handleWatchlistSweep(): Promise<{ enqueued: number }> {
  // Получаем все watchlist-записи + связанного автора. Для каждой пары
  // (user→author) проверяем устарела ли индексация по refreshInterval.
  // Дедупликация: если один автор в watchlist у двух юзеров с разным
  // интервалом, мы пере-индексируем по самому короткому.
  const entries = await prisma.researchWatchlist.findMany({
    include: { author: { select: { id: true, lastIndexedAt: true } } },
  });
  const byAuthor = new Map<string, { authorId: string; minInterval: number; lastIndexedAt: Date | null }>();
  for (const e of entries) {
    const cur = byAuthor.get(e.author.id);
    if (!cur) {
      byAuthor.set(e.author.id, {
        authorId: e.author.id,
        minInterval: e.refreshInterval,
        lastIndexedAt: e.author.lastIndexedAt,
      });
    } else if (e.refreshInterval < cur.minInterval) {
      cur.minInterval = e.refreshInterval;
    }
  }
  const due = Array.from(byAuthor.values()).filter((a) => {
    if (!a.lastIndexedAt) return true;
    return Date.now() - a.lastIndexedAt.getTime() >= a.minInterval * 3_600_000;
  });
  const queue = researchCronQueue();
  for (const a of due) {
    await queue.add(
      'author-refresh',
      { kind: 'author-refresh', authorId: a.authorId },
      { jobId: `author-refresh:${a.authorId}:${Math.floor(Date.now() / TICK_WATCHLIST_MS)}` },
    );
  }
  return { enqueued: due.length };
}

async function handleRadarRun(radarId: string) {
  const result = await runRadar(radarId, { maxNewAuthors: 5 });
  if (!result.ok) {
    console.warn(`[research-cron] radar-run ${radarId} failed: ${result.error}`);
    return;
  }
  console.log(
    `[research-cron] radar-run ${radarId} done: ${result.newReelIds.length} new of ${result.reelIds.length}`,
  );
}

async function handleAuthorRefresh(authorId: string) {
  const author = await prisma.researchAuthor.findUnique({
    where: { id: authorId },
    select: { username: true },
  });
  if (!author) return;
  const result = await indexAuthor(author.username, { force: true });
  if (result.error) {
    console.warn(`[research-cron] author-refresh @${author.username} error: ${result.error}`);
  } else {
    console.log(
      `[research-cron] author-refresh @${author.username}: median=${result.medianViews ?? '—'} reels=${result.reelCount}`,
    );
  }
}

export function startResearchCronWorker() {
  const opts: WorkerOptions = {
    connection: connection(),
    concurrency: CONCURRENCY,
  };
  const worker = new Worker<CronJob>(
    QUEUE_NAME,
    async (job) => {
      const data = job.data;
      switch (data.kind) {
        case 'radar-sweep': {
          const r = await handleRadarSweep();
          return r;
        }
        case 'watchlist-sweep': {
          const r = await handleWatchlistSweep();
          return r;
        }
        case 'radar-run':
          await handleRadarRun(data.radarId);
          return;
        case 'author-refresh':
          await handleAuthorRefresh(data.authorId);
          return;
        default: {
          const _exhaustive: never = data;
          throw new Error(`unknown kind: ${JSON.stringify(_exhaustive)}`);
        }
      }
    },
    opts,
  );

  worker.on('failed', (job, err) => {
    console.warn(`[research-cron] job ${job?.id} (${job?.name}) failed:`, err.message);
  });

  // Schedule on startup — idempotent, BullMQ дедуплицирует по jobId
  scheduleRecurring().catch((e) => {
    console.error('[research-cron] failed to schedule recurring jobs:', e);
  });

  return worker;
}
