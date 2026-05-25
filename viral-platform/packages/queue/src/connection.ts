import { Redis } from 'ioredis';

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';

/**
 * BullMQ requires maxRetriesPerRequest: null on the connection it blocks on.
 * We share one connection for queues/workers in a process and a separate one
 * for pub/sub (a subscribing connection can't issue other commands).
 */
export function createRedis(): Redis {
  return new Redis(redisUrl, { maxRetriesPerRequest: null });
}

let shared: Redis | undefined;
export function sharedRedis(): Redis {
  if (!shared) shared = createRedis();
  return shared;
}
