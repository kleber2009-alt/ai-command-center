import { Queue, type QueueOptions } from 'bullmq';
import IORedis from 'ioredis';

const url = process.env.REDIS_URL ?? 'redis://localhost:6379/3';

let _connection: IORedis | null = null;

export function connection() {
  if (_connection) return _connection;
  _connection = new IORedis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
  });
  return _connection;
}

function options(): QueueOptions {
  return {
    connection: connection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: { age: 60 * 60, count: 1000 },
      removeOnFail: { age: 7 * 24 * 60 * 60, count: 5000 },
    },
  };
}

export const QUEUE_NAMES = {
  avatarGeneration: 'avatar-generation',
  coverGeneration: 'cover-generation',
  heygenVideo: 'heygen-video',
  omnihumanVideo: 'omnihuman-video',
} as const;

export type AvatarGenerationJob = {
  generationId: string;
  userId: string;
};

export type CoverGenerationJob = {
  coverId: string;
  userId: string;
};

/** Unified video job — воркер сам читает engine из VideoGeneration row. */
export type VideoJob = {
  videoId: string;
  userId: string;
};

// Backward-compat alias.
export type HeygenVideoJob = VideoJob;

let _avatarQueue: Queue<AvatarGenerationJob> | null = null;
let _coverQueue: Queue<CoverGenerationJob> | null = null;
let _heygenQueue: Queue<VideoJob> | null = null;
let _omnihumanQueue: Queue<VideoJob> | null = null;

export function avatarQueue() {
  if (!_avatarQueue) {
    _avatarQueue = new Queue<AvatarGenerationJob>(QUEUE_NAMES.avatarGeneration, options());
  }
  return _avatarQueue;
}

export function coverQueue() {
  if (!_coverQueue) {
    _coverQueue = new Queue<CoverGenerationJob>(QUEUE_NAMES.coverGeneration, options());
  }
  return _coverQueue;
}

export function heygenQueue() {
  if (!_heygenQueue) {
    _heygenQueue = new Queue<VideoJob>(QUEUE_NAMES.heygenVideo, options());
  }
  return _heygenQueue;
}

export function omnihumanQueue() {
  if (!_omnihumanQueue) {
    _omnihumanQueue = new Queue<VideoJob>(QUEUE_NAMES.omnihumanVideo, options());
  }
  return _omnihumanQueue;
}

/** Engine-aware dispatcher — pass the queueName from EngineConfig. */
export function queueForName(name: string): Queue<VideoJob> {
  if (name === QUEUE_NAMES.omnihumanVideo) return omnihumanQueue();
  return heygenQueue();
}

// Legacy alias — старый код звал videoQueue().
export const videoQueue = heygenQueue;
