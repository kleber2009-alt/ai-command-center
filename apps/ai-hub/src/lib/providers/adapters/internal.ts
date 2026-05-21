// Internal adapter — synchronous tools that run inside our own infra
// (no external provider job-ID, no webhooks).
//
// Routing: tool.model selects the handler.
//   "ig-research" → Apify scrape + Claude analysis → structured report
//
// All work is done synchronously inside submit() → result.status="completed"
// or "failed", inline output. The worker writes output to ai_jobs.output as-is.

import { sql } from "drizzle-orm";
import { ProviderError, type ProviderAdapter, type ProviderResult, type SubmitArgs } from "../types";
import { db } from "@/lib/db";
import { runIgResearch } from "@/lib/research/ig";
import { generateReels } from "@/lib/agents/reels";
import { runReelsAgentV1 } from "@/lib/agents/reels-v1";

export const internalAdapter: ProviderAdapter = {
  id: "internal",

  async submit({ model, input, jobId }: SubmitArgs): Promise<ProviderResult> {
    if (model === "ig-research") {
      try {
        const username = String((input as Record<string, unknown>).username ?? "").trim();
        if (!username) return { status: "failed", providerJobId: jobId,
          error: { code: "INVALID_INPUT", message: "username required" } };

        const report = await runIgResearch(username);
        return {
          status: "completed",
          providerJobId: jobId,
          output: { report, source: "ai-hub-internal", version: "v0" },
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { status: "failed", providerJobId: jobId,
          error: { code: "INTERNAL_ERROR", message: msg } };
      }
    }

    if (model === "reels-agent-v1") {
      // Multi-agent orchestrator. Creates agent_run + emits events per phase
      // so the UI SSE stream can render the live timeline.
      try {
        const inp = input as Record<string, unknown>;
        const niche = String(inp.niche ?? "").trim();
        const topic = String(inp.topic ?? "").trim();
        const tone  = String(inp.tone  ?? "premium").trim();
        const language = (String(inp.language ?? "ru") === "en" ? "en" : "ru") as "ru" | "en";
        if (!niche || !topic) return { status: "failed", providerJobId: jobId,
          error: { code: "INVALID_INPUT", message: "niche and topic required" } };

        // Look up the user owning this job so agent_run gets the right user_id.
        const ownerRows = await db.execute<{ user_id: string }>(sql`
          select user_id from ai_jobs where id = ${jobId}::uuid limit 1
        `);
        const userRow = (ownerRows as unknown as Array<{ user_id: string }>)[0];
        if (!userRow) throw new Error("ai_job not found for agent run");

        // Create agent_run BEFORE first event so SSE has a row to attach to.
        const runRows = await db.execute<{ id: string }>(sql`
          insert into agent_runs (user_id, job_id, agent_type, input)
          values (${userRow.user_id}, ${jobId}::uuid, 'reels-agent-v1', ${JSON.stringify({ niche, topic, tone, language })}::jsonb)
          returning id
        `);
        const runId = (runRows as unknown as Array<{ id: string }>)[0]?.id;
        if (!runId) throw new Error("failed to create agent_run");

        const pkg = await runReelsAgentV1(runId, { niche, topic, tone, language });
        return {
          status: "completed",
          providerJobId: runId,                            // surface runId so /api/jobs returns it
          output: { reels_v1: pkg, run_id: runId },
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { status: "failed", providerJobId: jobId,
          error: { code: "INTERNAL_ERROR", message: msg } };
      }
    }

    if (model === "reels-creator") {
      try {
        const inp = input as Record<string, unknown>;
        const niche = String(inp.niche ?? "").trim();
        const topic = String(inp.topic ?? "").trim();
        const tone  = String(inp.tone  ?? "premium").trim();
        const language = (String(inp.language ?? "ru") === "en" ? "en" : "ru") as "ru" | "en";
        if (!niche || !topic) return { status: "failed", providerJobId: jobId,
          error: { code: "INVALID_INPUT", message: "niche and topic required" } };

        const reels = await generateReels({ niche, topic, tone, language });
        return {
          status: "completed",
          providerJobId: jobId,
          output: { reels, source: "ai-hub-internal", version: "v0" },
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { status: "failed", providerJobId: jobId,
          error: { code: "INTERNAL_ERROR", message: msg } };
      }
    }

    throw new ProviderError("internal", "UNKNOWN_MODEL", `Internal model not registered: ${model}`);
  },

  async getStatus(providerJobId: string): Promise<ProviderResult> {
    // Internal jobs complete synchronously inside submit() — status polls
    // shouldn't happen, but if they do, mark complete.
    return { status: "completed", providerJobId };
  },

  async parseWebhook() { return null; },
};
