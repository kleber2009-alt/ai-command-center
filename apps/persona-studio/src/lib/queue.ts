import { Queue, QueueEvents, Worker } from "bullmq";
import IORedis from "ioredis";

const url = process.env.REDIS_URL || "redis://localhost:6379";

let _connection: IORedis | null = null;

export function connection() {
  if (_connection) return _connection;
  _connection = new IORedis(url, { maxRetriesPerRequest: null });
  return _connection;
}

export const QUEUES = {
  AVATAR: "avatar-generation",
  COVER: "cover-generation",
} as const;

type Q = (typeof QUEUES)[keyof typeof QUEUES];

const queueCache = new Map<string, Queue>();

export function getQueue(name: Q): Queue {
  let q = queueCache.get(name);
  if (!q) {
    q = new Queue(name, { connection: connection() });
    queueCache.set(name, q);
  }
  return q;
}

export function getQueueEvents(name: Q) {
  return new QueueEvents(name, { connection: connection() });
}

export type AvatarJobData = {
  generationId: string;
  userId: string;
  uploadId: string;
};

export type CoverJobData = {
  generationId: string;
  userId: string;
  avatarId: string;
  title: string;
  subtitle: string;
  cta: string;
};

export { Worker };
