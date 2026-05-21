// BullMQ job queue wiring. Lazy singletons so we don't open Redis connections
// during build/SSG. The worker process imports `getWorker`; web handlers
// import `getQueue` to enqueue.

import { Queue, Worker, QueueEvents, type Job } from "bullmq";
import IORedis from "ioredis";

const QUEUE_NAME = "ai-jobs";

let _connection: IORedis | null = null;
function connection(): IORedis {
  if (_connection) return _connection;
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL is not set");
  _connection = new IORedis(url, { maxRetriesPerRequest: null });
  return _connection;
}

let _queue: Queue<AIJobPayload> | null = null;
export function getQueue(): Queue<AIJobPayload> {
  if (_queue) return _queue;
  _queue = new Queue<AIJobPayload>(QUEUE_NAME, { connection: connection() });
  return _queue;
}

let _events: QueueEvents | null = null;
export function getQueueEvents(): QueueEvents {
  if (_events) return _events;
  _events = new QueueEvents(QUEUE_NAME, { connection: connection() });
  return _events;
}

export interface AIJobPayload {
  jobId: string;          // ai_jobs.id (uuid)
  userId: string;
  toolId: string;
  provider: string;
  model: string;
  input: Record<string, unknown>;
  costTokens: number;     // reserved amount
}

export type AIJob = Job<AIJobPayload>;

export { Worker, QUEUE_NAME };
