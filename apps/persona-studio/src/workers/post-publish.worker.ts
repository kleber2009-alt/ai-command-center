// post-publish worker — one job per PostTarget. Delegates to publishTarget()
// which performs the platform call, updates the target row, and rolls up the
// parent ScheduledPost status. publishTarget re-throws on failure so BullMQ
// records / retries per defaultJobOptions (3 attempts, exponential backoff).

import { Worker } from 'bullmq';
import { connection, QUEUE_NAMES, type PublishJob } from '@/lib/queue';
import { publishTarget } from '@/lib/publish';

export function startPostPublishWorker() {
  const worker = new Worker<PublishJob>(
    QUEUE_NAMES.postPublish,
    async (job) => {
      const { targetId } = job.data;
      const result = await publishTarget(targetId);
      return { ok: result === 'published', targetId };
    },
    {
      connection: connection(),
      concurrency: 3,
    },
  );

  worker.on('failed', (job, err) => {
    console.error('[post-publish] job failed', job?.id, err?.message);
  });
  worker.on('completed', (job) => {
    console.log('[post-publish] published target', job?.data.targetId);
  });

  return worker;
}
