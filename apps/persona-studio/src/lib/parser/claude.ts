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

/**
 * Переписать caption «залетевшего» поста в новый сценарий reels по структуре
 * Хук → Боль → Раскрытие → CTA. На выходе — сплошной текст ~100–150 слов на
 * русском, который HeyGen-аватар произнесёт без правок. Без markdown, без
 * заголовков, без эмодзи, без хэштегов.
 *
 * Используется когда пользователь жмёт «Создать видео» на карточке парсера:
 * результат кэшируется в ParserItem.rewrittenScript и подставляется в
 * VideoForm как initialScript.
 */
export async function rewriteScript(args: {
  niche: string;
  userName: string;
  caption: string;
  fitWhy?: string | null;
}): Promise<{ ok: true; script: string } | { ok: false; error: string }> {
  if (!isClaudeConfigured()) {
    return { ok: false, error: 'ANTHROPIC_API_KEY missing' };
  }
  const caption = (args.caption || '').trim();
  if (!caption) return { ok: false, error: 'empty caption' };

  const system = `Ты — сценарист коротких вертикальных видео (Instagram Reels / TikTok / Shorts) для эксперта ${args.userName}.

Ниша эксперта: ${args.niche || 'не указана'}

Ниже — оригинальный пост конкурента, который сейчас «залетает» в этой нише. Твоя задача — написать НОВЫЙ оригинальный сценарий для эксперта ${args.userName} по той же теме и механике, но полностью переписанный его голосом. НЕ копируй конкурента дословно — используй как референс по структуре и теме.

Сценарий следует классической структуре reels (~30–45 секунд эфирного времени, ~100–150 слов):

1. ХУК (3–5 секунд, ~10–15 слов): провокационный вопрос или утверждение, которое цепляет в первую секунду.
2. БОЛЬ (5–10 секунд, ~20–30 слов): описание проблемы, с которой сталкивается зритель.
3. РАСКРЫТИЕ (15–25 секунд, ~50–80 слов): суть, инсайт или механика решения.
4. CTA (3–5 секунд, ~10–15 слов): конкретное действие — подписаться, написать в комменты, перейти по ссылке.

ВАЖНО:
- Верни ТОЛЬКО готовый текст сценария на русском.
- Никаких заголовков типа «Хук:», «Боль:», markdown, нумерации.
- Один сплошной текст с естественными переходами, который аватар будет произносить.
- Без эмодзи, без хэштегов, без упоминания «подпишись на мой канал» если нет канала — заменяй на универсальное «напиши в комменты».
- Естественный разговорный русский, короткие предложения.`;

  const userMsg = `Оригинальный пост конкурента:
"""
${caption.slice(0, 1500)}
"""${args.fitWhy ? `\n\nЗачем мы переписываем этот пост (контекст от стратега): ${args.fitWhy}` : ''}

Сценарий:`;

  const res = await chat(system, userMsg);
  if (!res.ok) {
    return { ok: false, error: `claude ${res.status}: ${res.details.slice(0, 200)}` };
  }
  // Чистим возможные markdown-обёртки или преамбулы вида «Вот сценарий:».
  const cleaned = res.text
    .replace(/^```(?:\w+)?\s*/i, '')
    .replace(/```\s*$/, '')
    .replace(/^(вот\s+сценарий[:.\s]*|сценарий[:.\s]*)/i, '')
    .trim();
  if (cleaned.length < 30) {
    return { ok: false, error: `claude returned too-short script (${cleaned.length} chars)` };
  }
  return { ok: true, script: cleaned };
}
