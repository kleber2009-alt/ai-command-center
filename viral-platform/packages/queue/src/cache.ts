import { sharedRedis } from './connection.js';

/**
 * Redis-backed cache matching the BrollCache shape (@vp/broll) and any other
 * string KV need. TTL is in seconds (§4.4).
 */
export const redisCache = {
  async get(key: string): Promise<string | null> {
    return sharedRedis().get(key);
  },
  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await sharedRedis().set(key, value, 'EX', ttlSeconds);
  },
};
