import { type Job, Queue, Worker, type WorkerOptions } from 'bullmq';

export type { Job } from 'bullmq';
import { createRedis, sharedRedis } from './connection.js';
import type { JobPayloads, QueueName } from './jobs.js';

// Retry policy from §3: 3 attempts, exponential backoff.
const DEFAULT_JOB_OPTS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 2_000 },
  removeOnComplete: { age: 24 * 3600, count: 1000 },
  removeOnFail: { age: 7 * 24 * 3600 },
};

const queues = new Map<QueueName, Queue>();

export function getQueue<N extends QueueName>(name: N): Queue<JobPayloads[N]> {
  let q = queues.get(name);
  if (!q) {
    q = new Queue(name, { connection: sharedRedis(), defaultJobOptions: DEFAULT_JOB_OPTS });
    queues.set(name, q);
  }
  return q as Queue<JobPayloads[N]>;
}

export async function enqueue<N extends QueueName>(
  name: N,
  data: JobPayloads[N],
  jobId?: string,
): Promise<string> {
  // jobId enables idempotent enqueue: re-adding the same id is a no-op.
  // Cast away the indexed-generic data type for BullMQ's conditional name
  // signature; the function signature already enforces `data` for callers.
  const job = await (getQueue(name) as Queue).add(name, data, jobId ? { jobId } : undefined);
  return job.id ?? '';
}

export function createWorker<N extends QueueName>(
  name: N,
  processor: (job: Job<JobPayloads[N]>) => Promise<void>,
  opts: Partial<WorkerOptions> = {},
): Worker<JobPayloads[N]> {
  // Each worker uses its own blocking connection.
  return new Worker<JobPayloads[N]>(name, processor, {
    connection: createRedis(),
    concurrency: 2,
    ...opts,
  });
}
