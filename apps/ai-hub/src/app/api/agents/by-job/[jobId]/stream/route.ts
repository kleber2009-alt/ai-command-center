// SSE stream of agent_events for an agent_run tied to the given ai_job.
//
// Flow:
//   - Resolve agent_run by job_id (poll briefly if worker hasn't created it yet)
//   - Send `connected` + `snapshot` events with all events seen so far
//   - Long-poll DB for new events (seq > last_seen_seq) every 700ms
//   - Close on run_completed / run_failed (sent as final event) or timeout (3 min)
//
// Auth: must be owner of the run (or admin).

import { sql } from "drizzle-orm";
import { requireUser } from "@/lib/auth-helpers";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const POLL_INTERVAL_MS = 700;
const RUN_LOOKUP_TIMEOUT_MS = 10_000;
const TOTAL_TIMEOUT_MS = 3 * 60_000;                   // 3 min — orchestrator should be done by then

export async function GET(_req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { user, response } = await requireUser();
  if (!user) return response!;

  const { jobId } = await params;
  const startedAt = Date.now();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(eventName: string, data: unknown) {
        const lines = [
          `event: ${eventName}`,
          `data: ${JSON.stringify(data)}`,
          ``, ``,
        ].join("\n");
        try { controller.enqueue(encoder.encode(lines)); } catch { /* closed */ }
      }
      function close() {
        try { controller.close(); } catch { /* already closed */ }
      }

      send("connected", { jobId, t: new Date().toISOString() });

      // ---------- 1) Resolve agent_run.id by job_id ----------
      let runId: string | null = null;
      let runOwner: string | null = null;
      let runStatus: string | null = null;
      const lookupDeadline = startedAt + RUN_LOOKUP_TIMEOUT_MS;
      while (Date.now() < lookupDeadline) {
        const rows = await db.execute<{ id: string; user_id: string; status: string }>(sql`
          select id, user_id, status from agent_runs
          where job_id = ${jobId}::uuid
          order by created_at desc limit 1
        `);
        const row = (rows as unknown as Array<{ id: string; user_id: string; status: string }>)[0];
        if (row) { runId = row.id; runOwner = row.user_id; runStatus = row.status; break; }
        await new Promise((r) => setTimeout(r, 400));
      }

      if (!runId) {
        send("error", { code: "RUN_NOT_FOUND", message: "Agent run never started" });
        close();
        return;
      }
      if (runOwner !== user.id && user.role !== "admin") {
        send("error", { code: "FORBIDDEN", message: "Not your run" });
        close();
        return;
      }
      send("run", { runId, status: runStatus });

      // ---------- 2) Initial snapshot of all existing events ----------
      let lastSeq = 0;
      const seedRows = await db.execute<{ seq: number; phase: string; event_type: string; payload: unknown; created_at: Date }>(sql`
        select seq, phase, event_type, payload, created_at
        from agent_events
        where run_id = ${runId}::uuid
        order by seq asc
      `);
      const seed = seedRows as unknown as Array<{ seq: number; phase: string; event_type: string; payload: unknown; created_at: Date }>;
      for (const ev of seed) {
        send("event", ev);
        lastSeq = Number(ev.seq);
      }

      // ---------- 3) Long-poll new events ----------
      let terminated = false;
      while (!terminated && Date.now() - startedAt < TOTAL_TIMEOUT_MS) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        const newRows = await db.execute<{ seq: number; phase: string; event_type: string; payload: unknown; created_at: Date }>(sql`
          select seq, phase, event_type, payload, created_at
          from agent_events
          where run_id = ${runId}::uuid and seq > ${lastSeq}
          order by seq asc
        `);
        const events = newRows as unknown as Array<{ seq: number; phase: string; event_type: string; payload: unknown; created_at: Date }>;
        for (const ev of events) {
          send("event", ev);
          lastSeq = Number(ev.seq);
          if (ev.event_type === "run_completed" || ev.event_type === "run_failed") terminated = true;
        }

        // Also check agent_run.status — covers cases where the orchestrator
        // crashed before emitting run_failed (worker would mark the underlying
        // ai_job refunded but no failure event landed).
        if (!terminated) {
          const statusRows = await db.execute<{ status: string; error_message: string | null }>(sql`
            select status, error_message from agent_runs where id=${runId}::uuid limit 1
          `);
          const r = (statusRows as unknown as Array<{ status: string; error_message: string | null }>)[0];
          if (r && (r.status === "completed" || r.status === "failed")) {
            send("run", { runId, status: r.status, error: r.error_message });
            terminated = true;
          }
        }
      }

      if (!terminated) send("error", { code: "TIMEOUT", message: "stream window expired" });
      close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":  "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection":    "keep-alive",
      "X-Accel-Buffering": "no",                       // Disable buffering for nginx/caddy
    },
  });
}
