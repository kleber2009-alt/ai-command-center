// Расширение ниши через Claude. Вход — короткая фраза от юзера
// («психология отношений», «продажи b2b»), выход — массив hashtags
// для скрейпа Apify + keywords для будущего keyword-search actor'а.
//
// На этапе 1 используется только hashtags (актор apify/instagram-scraper
// принимает /explore/tags/<tag>/). Keywords живут в кэше для UI
// (чипы-подсказки под полем поиска, см. ТЗ §5).

import { env } from '@/lib/env';

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const MAX_TOKENS = 600;
const MAX_KEYWORDS = 12;
const MAX_HASHTAGS = 10;

export type NicheExpansion = {
  keywords: string[];
  hashtags: string[];
  source: 'claude' | 'fallback';
};

/**
 * Простой fallback на случай отсутствия Claude — просто берёт исходную
 * фразу и нарезает на слова + чистит. Не идеально, но позволяет не
 * блокировать /research если ANTHROPIC_API_KEY временно отвалился.
 */
function fallbackExpand(niche: string): NicheExpansion {
  const slug = niche
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  return {
    keywords: slug.slice(0, MAX_KEYWORDS),
    hashtags: slug.map((s) => s.replace(/\s+/g, '')).slice(0, MAX_HASHTAGS),
    source: 'fallback',
  };
}

export async function expandNiche(niche: string): Promise<NicheExpansion> {
  const cleaned = (niche || '').trim();
  if (!cleaned) return { keywords: [], hashtags: [], source: 'fallback' };

  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) return fallbackExpand(cleaned);

  const system = `Ты — ассистент для ресёрча вирусного контента в Instagram. Тебе дают короткое описание ниши на любом языке, ты возвращаешь JSON:
{"keywords": ["...", "..."], "hashtags": ["...", "..."]}

Правила:
- keywords: 6-12 ёмких слов/словосочетаний на языке ниши, описывающих смежные темы (синонимы, поджанры, аудитория, болевые точки). Это будут чипы-подсказки в UI поиска.
- hashtags: 6-10 РЕАЛЬНЫХ популярных Instagram-хэштегов БЕЗ #, латиницей или транслитом, по которым реально публикуют контент в этой нише. Не выдумывай — если ниша русская и хэштеги обычно англоязычные, давай англоязычные.
- Без пояснений, без markdown, без преамбулы. Только JSON.`;

  let res: Response;
  try {
    res = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: env.ANTHROPIC_PARSER_MODEL,
        max_tokens: MAX_TOKENS,
        system,
        messages: [{ role: 'user', content: cleaned }],
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    console.warn(`[expand-niche] fetch failed: ${(e as Error).message}`);
    return fallbackExpand(cleaned);
  }
  if (!res.ok) {
    // Полный body важен для отладки: 400 от Anthropic может означать что
    // угодно (закончились кредиты, неверная модель, плохой ключ) — статус
    // сам по себе бесполезен. Режем до 400 символов чтобы не засорить логи.
    const body = await res.text().catch(() => '');
    console.warn(`[expand-niche] claude ${res.status} ${body.slice(0, 400)}`);
    return fallbackExpand(cleaned);
  }

  let data: { content?: Array<{ text?: string }> };
  try {
    data = await res.json();
  } catch {
    return fallbackExpand(cleaned);
  }
  const text = (data.content?.[0]?.text || '').trim();
  let parsed: { keywords?: unknown; hashtags?: unknown };
  try {
    parsed = JSON.parse(text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim());
  } catch {
    return fallbackExpand(cleaned);
  }

  const sanitize = (arr: unknown, max: number, stripHash: boolean): string[] => {
    if (!Array.isArray(arr)) return [];
    return arr
      .map((v) => String(v || '').trim())
      .filter(Boolean)
      .map((v) => (stripHash ? v.replace(/^#/, '') : v))
      .slice(0, max);
  };

  const keywords = sanitize(parsed.keywords, MAX_KEYWORDS, false);
  const hashtags = sanitize(parsed.hashtags, MAX_HASHTAGS, true);

  if (hashtags.length === 0 && keywords.length === 0) return fallbackExpand(cleaned);
  return { keywords, hashtags, source: 'claude' };
}
