// Минимальный Claude-клиент для fit-to-niche оценки постов. Без npm SDK —
// прямой fetch к /v1/messages с ретраями на 408/429/5xx, дизайн повторяет
// apps/infra-worker/lib/anthropic.js.

import { env } from '@/lib/env';
import type { ScoredPost, RateResult, ClaudeRating } from './types';

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 8000;
const RETRY_STATUSES = new Set([408, 429, 500, 502, 503, 504, 529]);
const MAX_CLAUDE_TOKENS = 1500;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function isClaudeConfigured(): boolean {
  return Boolean(env.ANTHROPIC_API_KEY);
}

type ChatResult =
  | { ok: true; text: string }
  | { ok: false; status: number; details: string };

async function chat(system: string, user: string): Promise<ChatResult> {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, status: 503, details: 'ANTHROPIC_API_KEY missing' };

  const body = JSON.stringify({
    model: env.ANTHROPIC_PARSER_MODEL,
    max_tokens: MAX_CLAUDE_TOKENS,
    system,
    messages: [{ role: 'user', content: user }],
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
      const data = (await res.json()) as { content?: Array<{ text?: string }> };
      const text = (data.content?.[0]?.text || '').trim();
      return { ok: true, text };
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
 * Оценить релевантность постов нише через Claude. Возвращает массивы
 * параллельные входным reels/carousels (либо null если Claude ничего не
 * сказал). Никогда не бросает — при ошибке возвращает все null.
 */
export async function rateWithClaude(args: {
  niche: string;
  userName: string;
  reels: ScoredPost[];
  carousels: ScoredPost[];
}): Promise<RateResult> {
  const fallback: RateResult = {
    reels: args.reels.map(() => null),
    carousels: args.carousels.map(() => null),
    summary: null,
  };
  if (args.reels.length === 0 && args.carousels.length === 0) return fallback;
  if (!isClaudeConfigured()) return fallback;

  type Packed = {
    idx: string;
    type: string;
    author: string | null;
    age_h: number;
    views: number | null;
    likes: number;
    comments: number;
    velocity: number;
    hook: string;
  };
  const pack = (arr: ScoredPost[], prefix: string): Packed[] =>
    arr.map((p, i) => ({
      idx: `${prefix}${i + 1}`,
      type: p.kind,
      author: p.owner,
      age_h: p.ageHours,
      views: p.plays || null,
      likes: p.likes,
      comments: p.comments,
      velocity: p.velocityScore,
      hook: p.caption.slice(0, 200),
    }));

  const items = [...pack(args.reels, 'R'), ...pack(args.carousels, 'C')];

  const system = `Ты — контент-стратег для эксперта ${args.userName}. Ниша: ${args.niche || 'не указана'}.
Тебе показывают «залетевшие» посты конкурентов за последние дни.
Твоя задача — оценить каждый пост по шкале 1-10: насколько вероятно, что аналогичный по теме/механике пост сработает в блоге ${args.userName} (учитывая нишу выше).

Возвращай СТРОГО JSON-массив без markdown, без пояснений, без преамбулы. Формат:
[{"idx":"R1","score":8,"why":"одно предложение"},{"idx":"C1","score":6,"why":"..."}]

Правила:
- score: целое 1-10 (10 = почти гарантированно зайдёт, 1 = чужая аудитория).
- why: 6-12 слов на русском, конкретно почему оценка такая.
- Включи ВСЕ idx из входа, ни одного не пропусти.
- В конце добавь объект {"idx":"summary","why":"2-3 строки общего наблюдения по трендам"}.`;

  const res = await chat(system, `JSON-вход:\n${JSON.stringify(items)}`);
  if (!res.ok) {
    console.warn(`[parser-claude] failed: ${res.status} ${res.details.slice(0, 150)}`);
    return fallback;
  }

  let parsed: unknown;
  try {
    const cleaned = res.text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/, '')
      .trim();
    parsed = JSON.parse(cleaned);
  } catch (e) {
    console.warn(`[parser-claude] json parse: ${(e as Error).message}`);
    return fallback;
  }
  if (!Array.isArray(parsed)) return fallback;

  const byIdx = new Map<string, ClaudeRating>();
  let summary: string | null = null;
  for (const o of parsed as Array<{ idx?: string; score?: number; why?: string }>) {
    if (!o || typeof o !== 'object') continue;
    if (o.idx === 'summary') {
      summary = String(o.why || '').slice(0, 600);
      continue;
    }
    if (typeof o.idx === 'string' && typeof o.score === 'number') {
      byIdx.set(o.idx, {
        score: Math.round(o.score),
        why: String(o.why || '').slice(0, 200),
      });
    }
  }

  return {
    reels: args.reels.map((_, i) => byIdx.get(`R${i + 1}`) || null),
    carousels: args.carousels.map((_, i) => byIdx.get(`C${i + 1}`) || null),
    summary,
  };
}
