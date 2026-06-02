import { api } from '@/api/client';
import { loadQueue, replaceQueue, QueuedAnswer } from './offline';

/**
 * Background sync (spec 5): when connectivity returns, replay queued offline
 * answers to the server in order, preserving each answer's original time zone.
 * Answers that still fail (e.g. server-side lock, or an answer already recorded)
 * are dropped if the server reports them as conflicts; transient/network
 * failures are kept for the next attempt.
 *
 * A module-level guard prevents overlapping flushes.
 */
let inFlight = false;

export async function syncAnswerQueue(): Promise<number> {
  if (inFlight) return 0;
  inFlight = true;
  try {
    const queue = await loadQueue();
    if (queue.length === 0) return 0;

    const remaining: QueuedAnswer[] = [];
    let synced = 0;

    for (const a of queue) {
      try {
        await api.answer(a.itemId, a.selectedKey, a.tz);
        synced++;
      } catch (e: any) {
        // 423 LOCKED / duplicate => the answer is already accounted for or no
        // longer applicable; drop it. Anything else is transient -> keep.
        const msg = String(e?.message ?? '');
        const permanent = /locked|already|duplicate|not found|409|423/i.test(msg);
        if (!permanent) remaining.push(a);
      }
    }

    await replaceQueue(remaining);
    return synced;
  } finally {
    inFlight = false;
  }
}
