// Общий Claude-клиент для модулей research (analyze, analyze-page, hooks).
// Отдельно от lib/parser/claude.ts, потому что:
//   - там Haiku для классификации, здесь Sonnet (deep model) для анализа;
//   - там специфичные промпты (rate, rewrite, slides), которые лучше
//     не смешивать с research-промптами.

import { env } from '@/lib/env';

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 8000;
const RETRY_STATUSES = new Set([408, 429, 500, 502, 503, 504, 529]);

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export type ChatResult =
  | { ok: true; text: string; inputTokens?: number; outputTokens?: number }
  | { ok: false; status: number; details: string };

export function isClaudeConfigured(): boolean {
  return Boolean(env.ANTHROPIC_API_KEY);
}

/**
 * Универсальный chat-вызов. По умолчанию использует ANTHROPIC_DEEP_MODEL
 * (Sonnet) — для analyze/page-analyze это критично. Хуки и расширение
 * ниши явно передают `claude-haiku` чтобы сэкономить.
 *
 * Vision: если передан `imageUrls[]`, они добавляются к user-сообщению как
 * image-блоки (ТЗ §6.2 — превью идёт в модель). Anthropic поддерживает
 * url-источник (`source: { type: 'url', url }`) — НЕ скачиваем сами.
 */
export async function claudeChat(opts: {
  system: string;
  user: string;
  maxTokens?: number;
  model?: string;
  timeoutMs?: number;
  /** Опциональные image URL для vision. Только https. Игнорируем data: и недоступные ссылки на сервере Anthropic. */
  imageUrls?: string[];
}): Promise<ChatResult> {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, status: 503, details: 'ANTHROPIC_API_KEY missing' };

  type ContentBlock =
    | { type: 'text'; text: string }
    | { type: 'image'; source: { type: 'url'; url: string } };

  let messageContent: string | ContentBlock[] = opts.user;
  const validImages = (opts.imageUrls || []).filter(
    (u) => typeof u === 'string' && /^https:\/\//.test(u),
  );
  if (validImages.length > 0) {
    messageContent = [
      ...validImages.map<ContentBlock>((url) => ({ type: 'image', source: { type: 'url', url } })),
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
