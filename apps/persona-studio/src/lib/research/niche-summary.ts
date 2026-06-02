// Niche-aggregate summary (Модуль 4 ТЗ §8). Claude сводит топ-N
// рилсов ниши → «общие паттерны вирусности»: доминирующие хук-формулы,
// длительности, темы, типы монтажа. Это короткий "общий обзор", который
// рендерится отдельной карточкой над результатами поиска.
//
// Намеренно НЕ вызывает analyze-reel per-ролик (это 5 кр./ролик и
// долго). Работает только по captions + метрикам выборки.

import { claudeChat, parseJsonResponse } from './claude';
import { env } from '@/lib/env';

export type NicheSummary = {
  summary: string;
  dominant_hooks: string[];
  dominant_formats: string[];
  dominant_topics: string[];
  duration_band: string;
  outlier_examples: Array<{ reel_id: string; why: string }>;
};

type ReelDigest = {
  id: string;
  views: number;
  virality: number | null;
  engagement: number | null;
  duration: number | null;
  caption: string;
};

export async function summarizeNiche(opts: {
  niche: string;
  reels: ReelDigest[];
  maxReels?: number;
}): Promise<{ ok: true; data: NicheSummary } | { ok: false; error: string }> {
  if (!env.ANTHROPIC_API_KEY) return { ok: false, error: 'no_api_key' };
  if (opts.reels.length < 3) return { ok: false, error: 'not_enough_reels' };

  // Берём топ-N по виральности (не по абсолютным просмотрам — нам важна
  // именно паттерновость выбросов в нише).
  const top = [...opts.reels]
    .sort((a, b) => (b.virality || 0) - (a.virality || 0))
    .slice(0, opts.maxReels ?? 12);

  const snapshot = top.map((r) => ({
    id: r.id,
    views: r.views,
    virality: r.virality,
    er: r.engagement,
    duration: r.duration,
    caption: (r.caption || '').slice(0, 250),
  }));

  const system = `Ты — аналитик вирусного Instagram-контента. Тебе дают нишу и snapshot из 10-15 самых "залетевших" рилсов этой ниши. Ты должен извлечь ПАТТЕРНЫ — что общее у этих выбросов, что повторяется.

Возвращай СТРОГО JSON без markdown:
{
  "summary": "3-5 предложений на русском. Что общего у залётных рилсов в этой нише, какие темы / форматы / хуки доминируют.",
  "dominant_hooks": ["3-5 хук-формул которые повторяются: вопрос, секрет, личный опыт, ..."],
  "dominant_formats": ["3-5 форматов: talking head 30s, скринкаст, b-roll монтаж, ..."],
  "dominant_topics": ["3-5 самых популярных тем"],
  "duration_band": "доминирующая длительность ('15-30s', '30-60s', 'смесь')",
  "outlier_examples": [{"reel_id":"<id из snapshot.id>","why":"одно предложение почему именно этот выстрелил"}]
}

Правила:
- outlier_examples max 3 — самые ярые выбросы.
- reel_id ОБЯЗАТЕЛЬНО берёшь из snapshot[].id — не выдумывай.
- Никакого текста вне JSON.`;

  const userMsg = `Ниша: ${opts.niche}\n\nSNAPSHOT (топ-${top.length} по виральности):\n${JSON.stringify(snapshot, null, 2)}`;
  const res = await claudeChat({
    system,
    user: userMsg,
    maxTokens: 2000,
    timeoutMs: 60_000,
    // Используем Haiku — задача аналитическая, но не такая глубокая как
    // per-reel analyze. Экономим.
    model: env.ANTHROPIC_PARSER_MODEL,
  });
  if (!res.ok) return { ok: false, error: res.details };

  const parsed = parseJsonResponse<Partial<NicheSummary>>(res.text);
  if (!parsed?.summary) return { ok: false, error: 'invalid_response' };

  return {
    ok: true,
    data: {
      summary: String(parsed.summary).slice(0, 1500),
      dominant_hooks: Array.isArray(parsed.dominant_hooks)
        ? parsed.dominant_hooks.map((h: unknown) => String(h).slice(0, 80)).slice(0, 8)
        : [],
      dominant_formats: Array.isArray(parsed.dominant_formats)
        ? parsed.dominant_formats.map((f: unknown) => String(f).slice(0, 80)).slice(0, 8)
        : [],
      dominant_topics: Array.isArray(parsed.dominant_topics)
        ? parsed.dominant_topics.map((t: unknown) => String(t).slice(0, 80)).slice(0, 8)
        : [],
      duration_band: String(parsed.duration_band || '').slice(0, 40),
      outlier_examples: Array.isArray(parsed.outlier_examples)
        ? parsed.outlier_examples
            .filter((o): o is { reel_id: string; why: string } => Boolean(o?.reel_id))
            .map((o) => ({
              reel_id: String(o.reel_id),
              why: String(o.why || '').slice(0, 300),
            }))
            .slice(0, 5)
        : [],
    },
  };
}
