import { AUTH_DISABLED, DEMO_USER_ID } from '@/lib/auth';
import { auth } from '@clerk/nextjs/server';
import { db, projects } from '@vp/db';
import { getLastProgress, subscribeProgress } from '@vp/queue';
import { and, eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

/**
 * SSE pipeline-progress stream for a project (§3, §7). Pushes the last known
 * snapshot immediately, then every published ProgressEvent until the client
 * disconnects. Replaces polling.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = AUTH_DISABLED ? DEMO_USER_ID : (await auth()).userId;
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { id } = await params;
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, userId)))
    .limit(1);
  if (!project) return new Response('Not found', { status: 404 });

  const encoder = new TextEncoder();
  let unsubscribe: (() => Promise<void>) | undefined;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      const last = await getLastProgress(id);
      if (last) send(last);

      unsubscribe = subscribeProgress(id, (ev) => {
        send(ev);
        if (ev.status === 'ready_for_review' || ev.status === 'done' || ev.status === 'failed') {
          void unsubscribe?.().then(() => controller.close());
        }
      });
    },
    async cancel() {
      await unsubscribe?.();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
