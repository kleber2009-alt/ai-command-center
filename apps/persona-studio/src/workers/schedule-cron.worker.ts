// schedule-cron worker — autoposting scheduler.
//
//   publish-sweep: every PUBLISH_CRON_TICK_MS (default 1 min) — atomically
//   claim ScheduledPost rows whose scheduledAt has passed (status scheduled →
//   publishing), then enqueue one post-publish job per PostTarget.
//
// Idempotency: the updateMany status guard means only one sweep can claim a
// given post (the WHERE status='scheduled' no longer matches after the flip).
// The post-publish job itself is also idempotent per target (publishTarget
// skips already-published targets).

import { Queue, Worker, type WorkerOptions } from 'bullmq';
import { connection } from '@/lib/queue';
import { prisma } from '@/lib/prisma';
import { publishQueue } from '@/lib/queue';
import { env } from '@/lib/env';
import { collectDue } from '@/lib/measure/collect';

const QUEUE_NAME = 'schedule-cron';
const TICK_MS = env.PUBLISH_CRON_TICK_MS || 60_000;
const METRICS_TICK_MS = env.METRICS_CRON_TICK_MS || 21_600_000;
const CONCURRENCY = 1;

type PublishSweepJob = { kind: 'publish-sweep' };
type MetricsSweepJob = { kind: 'metrics-sweep' };
type CronJob = PublishSweepJob | MetricsSweepJob;

let _queue: Queue<CronJob> | null = null;
function scheduleCronQueue() {
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

async function scheduleRecurring(): Promise<void> {
  const queue = scheduleCronQueue();
  await queue.add(
    'publish-sweep',
    { kind: 'publish-sweep' },
    { repeat: { every: TICK_MS }, jobId: 'recurring:publish-sweep' },
  );
  await queue.add(
    'metrics-sweep',
    { kind: 'metrics-sweep' },
    { repeat: { every: METRICS_TICK_MS }, jobId: 'recurring:metrics-sweep' },
  );
  console.log(
    `[schedule-cron] scheduled publish-sweep every ${Math.round(TICK_MS / 1000)}s, metrics-sweep every ${Math.round(METRICS_TICK_MS / 60000)}m`,
  );
}

async function handleMetricsSweep(): Promise<{ collected: number; skipped: number }> {
  return collectDue();
}

async function handlePublishSweep(): Promise<{ posts: number; targets: number }> {
  const now = new Date();

  // Claim due posts atomically: scheduled → publishing.
  const due = await prisma.scheduledPost.findMany({
    where: { status: 'scheduled', scheduledAt: { lte: now } },
    select: { id: true },
    take: 100,
  });
  if (due.length === 0) return { posts: 0, targets: 0 };

  let enqueued = 0;
  for (const post of due) {
    // Per-post guard: only the sweep that flips scheduled→publishing proceeds.
    const claimed = await prisma.scheduledPost.updateMany({
      where: { id: post.id, status: 'scheduled' },
      data: { status: 'publishing' },
    });
    if (claimed.count === 0) continue; // another sweep got it

    const targets = await prisma.postTarget.findMany({
      where: { scheduledPostId: post.id, status: { in: ['pending', 'failed'] } },
      select: { id: true },
    });
    const queue = publishQueue();
    for (const t of targets) {
      await queue.add('publish', { targetId: t.id }, { jobId: `publish-${t.id}` });
      enqueued++;
    }
  }
  return { posts: due.length, targets: enqueued };
}

export function startScheduleCronWorker() {
  const opts: WorkerOptions = {
    connection: connection(),
    concurrency: CONCURRENCY,
  };
  const worker = new Worker<CronJob>(
    QUEUE_NAME,
    async (job) => {
      if (job.data.kind === 'publish-sweep') {
        const r = await handlePublishSweep();
        if (r.targets > 0) {
          console.log(`[schedule-cron] swept ${r.posts} posts → ${r.targets} targets enqueued`);
        }
        return r;
      }
      if (job.data.kind === 'metrics-sweep') {
        const r = await handleMetricsSweep();
        if (r.collected > 0) {
          console.log(`[schedule-cron] metrics-sweep collected ${r.collected} (skipped ${r.skipped})`);
        }
        return r;
      }
    },
    opts,
  );

  worker.on('failed', (job, err) => {
    console.warn(`[schedule-cron] job ${job?.id} (${job?.name}) failed:`, err.message);
  });

  scheduleRecurring().catch((e) => {
    console.error('[schedule-cron] failed to schedule recurring jobs:', e);
  });

  return worker;
}
