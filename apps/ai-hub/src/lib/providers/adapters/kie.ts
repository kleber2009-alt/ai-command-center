// kie.ai adapter — unified marketplace для Nano Banana 2, Veo, Kling и десятков
// других моделей. Запросы async: createTask возвращает taskId сразу, finalный
// результат приходит либо callback'ом на webhookUrl, либо через GET recordInfo.
//
// Известное API (проверено probe-вызовом 2026-05-19):
//   POST https://api.kie.ai/api/v1/playground/createTask
//        Authorization: Bearer <KIE_API_KEY>
//        body: { model, input: {...}, callBackUrl?: string }
//        → { code: 200, msg: "success", data: { taskId, recordId } }
//
//   GET  https://api.kie.ai/api/v1/playground/recordInfo?taskId=<id>
//        Authorization: Bearer <KIE_API_KEY>
//        → { code: 200, data: { state: waiting|processing|success|failed,
//                               resultJson, creditsConsumed, ... } }
//
// state values seen: "waiting", "processing", "success", "failed"
// resultJson = JSON-string с { resultUrls: [...] } или { image_url: ... }
// rate limit: 20 new tasks / 10 sec.

import { createHmac, timingSafeEqual } from "node:crypto";
import { ProviderError, type ProviderAdapter, type ProviderResult, type SubmitArgs } from "../types";
import { child } from "@/lib/logger";

const KIE_BASE = "https://api.kie.ai/api/v1";
const SUBMIT_TIMEOUT_MS = 30_000;
const STATUS_TIMEOUT_MS = 15_000;
const log = child("provider.kie");

interface KieCreateResp {
  code: number;
  msg: string;
  data?: { taskId: string; recordId?: string };
}

interface KieRecordResp {
  code: number;
  data?: {
    taskId: string;
    model: string;
    state: "waiting" | "processing" | "success" | "failed";
    resultJson: string;                       // JSON-string when success
    failCode: string | null;
    failMsg: string | null;
    creditsConsumed: number;
    costTime: number | null;
    completeTime: number | null;
    createTime: number;
  };
}

export const kieAdapter: ProviderAdapter = {
  id: "kie",

  async submit({ model, input, webhookUrl, jobId }: SubmitArgs): Promise<ProviderResult> {
    const key = process.env.KIE_API_KEY;
    if (!key) throw new ProviderError("kie", "MISSING_KEY", "KIE_API_KEY env not set");

    // kie.ai is case-sensitive on enum values:
    //   aspect_ratio: lowercase ("auto", "1:1", "16:9", ...) — "Auto" rejected
    //   output_format: lowercase ("jpg", "png") — "JPG"/"PNG" rejected
    //   resolution:    uppercase ("1K", "2K", "4K") — lowercase rejected
    // UI uses friendly-cased labels; we normalize here before sending.
    const normalized: Record<string, unknown> = { ...input };
    if (typeof normalized.aspect_ratio === "string") {
      normalized.aspect_ratio = (normalized.aspect_ratio as string).toLowerCase();
    }
    if (typeof normalized.output_format === "string") {
      normalized.output_format = (normalized.output_format as string).toLowerCase();
    }

    const body: Record<string, unknown> = { model, input: normalized };
    if (webhookUrl) {
      // Embed jobId in callback URL так же как у fal — webhook handler
      // достанет jobId из query string.
      const wh = new URL(webhookUrl);
      wh.searchParams.set("jobId", jobId);
      body.callBackUrl = wh.toString();
    }

    const res = await fetch(`${KIE_BASE}/playground/createTask`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new ProviderError("kie", `HTTP_${res.status}`, errText.slice(0, 500));
    }

    const data = (await res.json()) as KieCreateResp;
    if (data.code !== 200 || !data.data?.taskId) {
      throw new ProviderError("kie", `API_${data.code}`, data.msg ?? "unknown");
    }

    log.info("kie task created", { taskId: data.data.taskId, model });
    return { status: "queued", providerJobId: data.data.taskId };
  },

  async getStatus(providerJobId: string): Promise<ProviderResult> {
    const key = process.env.KIE_API_KEY;
    if (!key) throw new ProviderError("kie", "MISSING_KEY", "KIE_API_KEY env not set");

    const res = await fetch(
      `${KIE_BASE}/playground/recordInfo?taskId=${encodeURIComponent(providerJobId)}`,
      {
        headers: { "Authorization": `Bearer ${key}` },
        signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
      }
    );
    if (!res.ok) throw new ProviderError("kie", `HTTP_${res.status}`, await res.text());

    const data = (await res.json()) as KieRecordResp;
    if (!data.data) {
      return { status: "queued", providerJobId };
    }

    const { state, resultJson, failCode, failMsg, creditsConsumed } = data.data;

    if (state === "success") {
      // resultJson is a JSON-string; parse defensively.
      let parsed: unknown = null;
      try { parsed = resultJson ? JSON.parse(resultJson) : null; } catch { parsed = resultJson; }
      return {
        status: "completed",
        providerJobId,
        output: parsed,
        costUsd: creditsConsumed ? creditsConsumed / 100 : undefined,    // rough — credits ≈ cents
      };
    }
    if (state === "failed") {
      return {
        status: "failed", providerJobId,
        error: { code: failCode ?? "FAILED", message: failMsg ?? "kie job failed" },
      };
    }
    return {
      status: state === "processing" ? "processing" : "queued",
      providerJobId,
    };
  },

  async parseWebhook(headers, body, secret) {
    // kie.ai webhook delivery format — signature scheme не задокументирован
    // явно, поэтому используем HMAC SHA-256 от raw body со shared secret
    // (стандартный паттерн; поправим если их формат другой).
    // Структура payload основана на recordInfo response.

    const sigHeader = headers["x-kie-signature"] || headers["kie-signature"];

    const rawBody = typeof body === "string" ? body : JSON.stringify(body);

    if (sigHeader && typeof sigHeader === "string") {
      const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
      const valid = expected.length === sigHeader.length &&
        timingSafeEqual(Buffer.from(expected), Buffer.from(sigHeader));
      if (!valid) return null;
    }
    // If no signature header — fall through (trust query-param jobId for now).
    // Когда kie выкатит signed callbacks, добавим проверку.

    const parsed = (typeof body === "string" ? JSON.parse(body) : body) as {
      code?: number;
      data?: {
        taskId: string;
        state: string;
        resultJson?: string;
        failCode?: string | null;
        failMsg?: string | null;
        creditsConsumed?: number;
      };
    };

    const d = parsed.data;
    if (!d?.taskId) return null;

    if (d.state === "success") {
      let output: unknown = null;
      try { output = d.resultJson ? JSON.parse(d.resultJson) : null; } catch { output = d.resultJson; }
      return {
        providerJobId: d.taskId, jobId: null,
        result: {
          status: "completed", providerJobId: d.taskId, output,
          costUsd: d.creditsConsumed ? d.creditsConsumed / 100 : undefined,
        },
      };
    }
    if (d.state === "failed") {
      return {
        providerJobId: d.taskId, jobId: null,
        result: {
          status: "failed", providerJobId: d.taskId,
          error: { code: d.failCode ?? "FAILED", message: d.failMsg ?? "kie job failed" },
        },
      };
    }
    return {
      providerJobId: d.taskId, jobId: null,
      result: { status: d.state === "processing" ? "processing" : "queued", providerJobId: d.taskId },
    };
  },
};
