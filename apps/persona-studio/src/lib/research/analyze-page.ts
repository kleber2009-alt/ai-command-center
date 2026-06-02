// Анализ страницы автора (ТЗ §7). Pipeline:
//   1. Убедиться что у автора есть >= N свежих рилсов (caller гарантирует indexAuthor)
//   2. Посчитать distribution виральности, выделить выбросы (top 5)
//   3. Claude Sonnet синтезирует страничный разбор → ResearchPageAnalysis
//
// На вход кладём список последних рилсов автора с уже посчитанными
// метриками. Claude получает компактный JSON-снапшот, не raw caption'ы
// всех рилсов — иначе вылетим за input window.

import { claudeChat, parseJsonResponse } from './claude';

export type PageAnalysisInput = {
  author: {
    username: string;
    followers: number | null;
    medianViews: number | null;
    engagementAvg: number | null;
  };
  reels: Array<{
    id: string;
    caption: string | null;
    views: number;
    likes: number;
    comments: number;
    postedAt: string | null;
    virality: number | null;
    engagementRate: number | null;
    durationSec: number | null;
  }>;
};

export type PageAnalysisResult = {
  summary: string;
  outliers: Array<{ reel_id: string; virality: number; why: string }>;
  cadence: {
    posts_per_week: number;
    best_days: string[];
    best_time: string;
  };
  best_formats: string[];
  best_topics: string[];
  recurring_hooks: string[];
  recommendations: string[];
};

export type PageAnalyzeOk = { ok: true; data: PageAnalysisResult; model: string };
export type PageAnalyzeFail = { ok: false; error: string; status?: number };

function detectCadence(
  reels: Array<{ postedAt: string | null }>,
): { posts_per_week: number; best_days: string[]; best_time: string } {
  const dates = reels
    .map((r) => (r.postedAt ? new Date(r.postedAt) : null))
    .filter((d): d is Date => d !== null);
  if (dates.length === 0) return { posts_per_week: 0, best_days: [], best_time: '' };

  // posts/week — по диапазону от min до max
  const min = Math.min(...dates.map((d) => d.getTime()));
  const max = Math.max(...dates.map((d) => d.getTime()));
  const spanWeeks = Math.max(1, (max - min) / (7 * 86_400_000));
  const ppw = Math.round((dates.length / spanWeeks) * 10) / 10;

  // best_days — наиболее частые дни недели
  const dayCount = new Map<number, number>();
  for (const d of dates) {
    const dow = d.getUTCDay();
    dayCount.set(dow, (dayCount.get(dow) || 0) + 1);
  }
  const dayNames = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
  const bestDays = [...dayCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([dow]) => dayNames[dow]);

  // best_time — среднее часа публикации (грубо)
  const avgHour = Math.round(
    dates.reduce((a, d) => a + d.getUTCHours(), 0) / dates.length,
  );
  const bestTime = `${String(avgHour).padStart(2, '0')}:00 UTC`;

  return { posts_per_week: ppw, best_days: bestDays, best_time: bestTime };
}

export async function analyzePage(input: PageAnalysisInput): Promise<PageAnalyzeOk | PageAnalyzeFail> {
  if (input.reels.length === 0) {
    return { ok: false, error: 'no_reels' };
  }

  // Отсортируем по виральности убыванием и выделим outliers — топ 5
  const sorted = [...input.reels].sort(
    (a, b) => (b.virality || 0) - (a.virality || 0),
  );
  const outliers = sorted.slice(0, Math.min(5, sorted.length));
  const cadence = detectCadence(input.reels);

  // Компактный snapshot для Claude: только outliers + агрегаты, не весь
  // массив рилсов.
  const snapshot = {
    author: input.author,
    total_reels: input.reels.length,
    median_views: input.author.medianViews,
    engagement_avg: input.author.engagementAvg,
    cadence,
    outliers: outliers.map((r) => ({
      id: r.id,
      virality: r.virality,
      views: r.views,
      er: r.engagementRate,
      duration: r.durationSec,
      caption: (r.caption || '').slice(0, 300),
    })),
  };

  const system = `Ты — аналитик Instagram-аккаунтов. Тебе дают снапшот автора: медиана просмотров, средний ER, ритм публикаций, и 5 топ-выбросов (рилсов с самой высокой виральностью × относительно его медианы).

Возвращай СТРОГО JSON без markdown:
{
  "summary": "2-4 предложения. На каком формате растёт аккаунт, какая медиана, какие выбросы пробивают.",
  "outliers": [{"reel_id":"<id из snapshot.outliers[].id>","virality":<число>,"why":"одно предложение почему именно этот ролик выстрелил"}],
  "cadence": {"posts_per_week":<число>,"best_days":["..."],"best_time":"HH:MM"},
  "best_formats": ["talking head 30s","скринкаст",...],
  "best_topics": ["короткие темы которые перформят, 3-5 штук"],
  "recurring_hooks": ["формулы хуков которые повторяются: вопрос, секрет, ..."],
  "recommendations": ["3-6 action-пунктов императивом: что копировать у этого автора, какие форматы/темы пробовать"]
}

Правила:
- outliers reel_id ОБЯЗАТЕЛЬНО берёшь из snapshot.outliers[].id (cuid строки) — не выдумывай.
- summary, recommendations — на русском.
- cadence можешь скорректировать если данные в snapshot.cadence выглядят шумными, но обычно копируй as-is.
- Никакого текста вне JSON.`;

  const userMsg = `SNAPSHOT:\n${JSON.stringify(snapshot, null, 2)}`;
  const res = await claudeChat({ system, user: userMsg, maxTokens: 3000, timeoutMs: 90_000 });
  if (!res.ok) return { ok: false, error: res.details, status: res.status };

  const parsed = parseJsonResponse<Partial<PageAnalysisResult>>(res.text);
  if (!parsed) return { ok: false, error: 'claude_invalid_json' };

  const out: PageAnalysisResult = {
    summary: String(parsed.summary || '').slice(0, 1500),
    outliers: Array.isArray(parsed.outliers)
      ? parsed.outliers
          .filter((o): o is { reel_id: string; virality: number; why: string } =>
            Boolean(o?.reel_id),
          )
          .map((o) => ({
            reel_id: String(o.reel_id),
            virality: Number(o.virality) || 0,
            why: String(o.why || '').slice(0, 300),
          }))
          .slice(0, 10)
      : [],
    cadence: {
      posts_per_week: Number(parsed.cadence?.posts_per_week) || cadence.posts_per_week,
      best_days: Array.isArray(parsed.cadence?.best_days)
        ? parsed.cadence!.best_days.map((d: unknown) => String(d)).slice(0, 7)
        : cadence.best_days,
      best_time: String(parsed.cadence?.best_time || cadence.best_time).slice(0, 30),
    },
    best_formats: Array.isArray(parsed.best_formats)
      ? parsed.best_formats.map((f: unknown) => String(f).slice(0, 100)).slice(0, 10)
      : [],
    best_topics: Array.isArray(parsed.best_topics)
      ? parsed.best_topics.map((t: unknown) => String(t).slice(0, 100)).slice(0, 10)
      : [],
    recurring_hooks: Array.isArray(parsed.recurring_hooks)
      ? parsed.recurring_hooks.map((h: unknown) => String(h).slice(0, 80)).slice(0, 10)
      : [],
    recommendations: Array.isArray(parsed.recommendations)
      ? parsed.recommendations.map((r: unknown) => String(r).slice(0, 300)).slice(0, 8)
      : [],
  };

  if (!out.summary) return { ok: false, error: 'claude_empty_response' };

  return { ok: true, data: out, model: 'claude-sonnet-4-6' };
}
