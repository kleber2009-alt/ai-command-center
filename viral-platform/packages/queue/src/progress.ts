import type { ProjectStatus } from '@vp/shared';
import { createRedis, sharedRedis } from './connection.js';

export interface ProgressEvent {
  projectId: string;
  status: ProjectStatus;
  /** 0..100 within the current stage. */
  pct: number;
  message?: string;
  ts: number;
}

const channel = (projectId: string) => `progress:${projectId}`;

/** Publish a pipeline progress event for SSE consumers (§3, §7). */
export async function publishProgress(ev: Omit<ProgressEvent, 'ts'>): Promise<void> {
  const payload: ProgressEvent = { ...ev, ts: Date.now() };
  const r = sharedRedis();
  // Keep a snapshot so a late SSE subscriber gets current state immediately.
  await r.set(`progress:last:${ev.projectId}`, JSON.stringify(payload), 'EX', 3600);
  await r.publish(channel(ev.projectId), JSON.stringify(payload));
}

export async function getLastProgress(projectId: string): Promise<ProgressEvent | null> {
  const raw = await sharedRedis().get(`progress:last:${projectId}`);
  return raw ? (JSON.parse(raw) as ProgressEvent) : null;
}

/**
 * Subscribe to a project's progress stream. Returns an unsubscribe fn.
 * Uses a dedicated connection because a subscribed client can't run commands.
 */
export function subscribeProgress(
  projectId: string,
  onEvent: (ev: ProgressEvent) => void,
): () => Promise<void> {
  const sub = createRedis();
  void sub.subscribe(channel(projectId));
  sub.on('message', (_chan, raw) => {
    try {
      onEvent(JSON.parse(raw) as ProgressEvent);
    } catch {
      // ignore malformed payloads
    }
  });
  return async () => {
    await sub.unsubscribe(channel(projectId));
    sub.disconnect();
  };
}
