// Minimal Claude API wrapper. Server-only.
// Default model: Haiku 4.5 — fast/cheap for analysis tasks; can be overridden.

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

export interface ChatArgs {
  system?: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  model?: string;
  maxTokens?: number;
}

export interface ChatResult {
  text: string;
  model?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
}

export async function chat(args: ChatArgs): Promise<ChatResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const body = {
    model: args.model ?? DEFAULT_MODEL,
    max_tokens: args.maxTokens ?? 2048,
    system: args.system,
    messages: args.messages,
  };

  const res = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Anthropic ${res.status}: ${text.slice(0, 500)}`);
  }
  const data = (await res.json()) as {
    content: Array<{ type: string; text: string }>;
    model: string;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const text = data.content?.[0]?.text?.trim() ?? "";
  return { text, model: data.model, usage: data.usage };
}

/** Force JSON output by parsing fenced ```json ...``` blocks defensively. */
export function extractJson<T = unknown>(text: string): T | null {
  // Try fenced block first
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence ? fence[1].trim() : text.trim();
  // Strip non-JSON noise before/after
  const start = raw.indexOf("{");
  const end   = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(raw.slice(start, end + 1)) as T; }
  catch { return null; }
}
