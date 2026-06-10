// Общий Claude-клиент для модулей research (analyze, analyze-page, hooks).
// Отдельно от lib/parser/claude.ts, потому что:
//   - там Haiku для классификации, здесь Sonnet (deep model) для анализа;
//   - там специфичные промпты (rate, rewrite, slides), которые лучше
//     не смешивать с research-промптами.

import { env } from '@/lib/env';

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const OPENAI_API = 'https://api.openai.com/v1/chat/completions';
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 8000;
const RETRY_STATUSES = new Set([408, 429, 500, 502, 503, 504, 529]);

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export type ChatResult =
  | { ok: true; text: string; inputTokens?: number; outputTokens?: number }
  | { ok: false; status: number; details: string };

export function isClaudeConfigured(): boolean {
  // Either provider — claudeChat falls back to OpenAI when Anthropic is
  // unavailable (out of credits / auth), so research/radar keeps working.
  return Boolean(env.ANTHROPIC_API_KEY || env.OPENAI_API_KEY);
}

type ChatOpts = {
  system: string;
  user: string;
  maxTokens?: number;
  model?: string;
  timeoutMs?: number;
  /** Опциональные image URL для vision. Только https. */
  imageUrls?: string[];
};

/**
 * Универсальный chat-вызов. По умолчанию использует ANTHROPIC_DEEP_MODEL
 * (Sonnet) — для analyze/page-analyze это критично. Хуки и расширение
 * ниши явно передают `claude-haiku` чтобы сэкономить.
 *
 * Anthropic — основной провайдер; при любой его ошибке (в т.ч. «нет
 * кредитов») тот же запрос прозрачно уходит в OpenAI (OPENAI_DEEP_MODEL,
 * vision-capable). Авто-возврат на Anthropic, когда он снова работает.
 *
 * Vision: `imageUrls[]` добавляются к user-сообщению как image-блоки (ТЗ
 * §6.2) — оба провайдера принимают url-источник, файлы не скачиваем сами.
 */
export async function claudeChat(opts: ChatOpts): Promise<ChatResult> {
  if (env.ANTHROPIC_API_KEY) {
    const r = await anthropicChat(env.ANTHROPIC_API_KEY, opts);
    if (r.ok) return r;
    if (env.OPENAI_API_KEY) {
      console.warn(`[research-claude] anthropic ${r.status} (${r.details.slice(0, 80)}) — falling back to OpenAI`);
      return openaiChat(env.OPENAI_API_KEY, opts);
    }
    return r;
  }
  if (env.OPENAI_API_KEY) return openaiChat(env.OPENAI_API_KEY, opts);
  return { ok: false, status: 503, details: 'no AI provider configured (ANTHROPIC_API_KEY / OPENAI_API_KEY)' };
}

function validImageUrls(imageUrls?: string[]): string[] {
  return (imageUrls || []).filter((u) => typeof u === 'string' && /^https:\/\//.test(u));
}

async function anthropicChat(apiKey: string, opts: ChatOpts): Promise<ChatResult> {
  type ContentBlock =
    | { type: 'text'; text: string }
    | { type: 'image'; source: { type: 'url'; url: string } };

  let messageContent: string | ContentBlock[] = opts.user;
  const images = validImageUrls(opts.imageUrls);
  if (images.length > 0) {
    messageContent = [
      ...images.map<ContentBlock>((url) => ({ type: 'image', source: { type: 'url', url } })),
      { type: 'text', text: opts.user },
    ];
  }

  const body = JSON.stringify({
    model: opts.model || env.ANTHROPIC_DEEP_MODEL,
    max_tokens: opts.maxTokens ?? 4000,
    system: opts.system,
    messages: [{ role: 'user', content: messageContent }],
  });

  let lastStatus = 0;
  let lastDetails = '';
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await fetch(ANTHROPIC_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body,
        signal: AbortSignal.timeout(opts.timeoutMs ?? 90_000),
      });
    } catch (e) {
      lastStatus = 502;
      lastDetails = 'anthropic_unreachable: ' + ((e as Error)?.message || String(e));
      if (attempt < MAX_ATTEMPTS - 1) {
        await sleep(Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS));
        continue;
      }
      return { ok: false, status: lastStatus, details: lastDetails };
    }
    if (res.ok) {
      const data = (await res.json()) as {
        content?: Array<{ text?: string }>;
        usage?: { input_tokens?: number; output_tokens?: number };
      };
      const text = (data.content?.[0]?.text || '').trim();
      return {
        ok: true,
        text,
        inputTokens: data.usage?.input_tokens,
        outputTokens: data.usage?.output_tokens,
      };
    }
    const txt = await res.text().catch(() => '');
    lastStatus = res.status;
    lastDetails = txt.slice(0, 600);
    if (!RETRY_STATUSES.has(res.status) || attempt === MAX_ATTEMPTS - 1) {
      return { ok: false, status: lastStatus, details: lastDetails };
    }
    await sleep(Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS));
  }
  return { ok: false, status: lastStatus, details: lastDetails };
}

async function openaiChat(apiKey: string, opts: ChatOpts): Promise<ChatResult> {
  type Part = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };

  let userContent: string | Part[] = opts.user;
  const images = validImageUrls(opts.imageUrls);
  if (images.length > 0) {
    userContent = [
      { type: 'text', text: opts.user },
      ...images.map<Part>((url) => ({ type: 'image_url', image_url: { url } })),
    ];
  }

  const body = JSON.stringify({
    model: env.OPENAI_DEEP_MODEL,
    max_tokens: opts.maxTokens ?? 4000,
    messages: [
      { role: 'system', content: opts.system },
      { role: 'user', content: userContent },
    ],
  });

  let lastStatus = 0;
  let lastDetails = '';
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await fetch(OPENAI_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body,
        signal: AbortSignal.timeout(opts.timeoutMs ?? 90_000),
      });
    } catch (e) {
      lastStatus = 502;
      lastDetails = 'openai_unreachable: ' + ((e as Error)?.message || String(e));
      if (attempt < MAX_ATTEMPTS - 1) {
        await sleep(Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS));
        continue;
      }
      return { ok: false, status: lastStatus, details: lastDetails };
    }
    if (res.ok) {
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const text = (data.choices?.[0]?.message?.content || '').trim();
      return {
        ok: true,
        text,
        inputTokens: data.usage?.prompt_tokens,
        outputTokens: data.usage?.completion_tokens,
      };
    }
    const txt = await res.text().catch(() => '');
    lastStatus = res.status;
    lastDetails = txt.slice(0, 600);
    if (!RETRY_STATUSES.has(res.status) || attempt === MAX_ATTEMPTS - 1) {
      return { ok: false, status: lastStatus, details: lastDetails };
    }
    await sleep(Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS));
  }
  return { ok: false, status: lastStatus, details: lastDetails };
}

/**
 * Парс JSON-ответа Claude с зачисткой markdown-обёрток (```json ... ```).
 * Возвращает null если не парсится — caller должен fallback'ить.
 */
export function parseJsonResponse<T>(text: string): T | null {
  try {
    const cleaned = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/, '')
      .trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
}
