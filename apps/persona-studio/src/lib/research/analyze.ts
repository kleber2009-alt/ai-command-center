// Глубокий анализ ролика «почему залетело» (ТЗ §6.2). Вход:
// caption + метрики + (опционально) транскрипт. Выход — структурированный
// JSON c hooks/storytelling/format/style/whyViral/recommendations,
// который рендерится в UI блоками.
//
// Используется один раз на (userId, reelId) — повторный вызов
// предположительно бессмысленный (анализ детерминирован по входу).
// Caller сам должен проверить кэш в БД перед charge.

import { claudeChat, parseJsonResponse } from './claude';

const HOOK_FORMULAS = [
  'вопрос',
  'кейс',
  'личный опыт',
  'негатив',
  'обучение',
  'проблема',
  'против течения',
  'секрет',
  'список',
  'сравнение',
] as const;

export type HookFormula = typeof HOOK_FORMULAS[number];

export type AnalyzedHook = {
  text: string;
  formula: HookFormula | string; // на всякий случай позволяем off-list
  strength: number; // 1..10
};

export type AnalysisResult = {
  hooks: AnalyzedHook[];
  storytelling: {
    structure: string;
    beats: string[];
  };
  format: {
    type: string;
    duration_band: string;
    pacing: string;
  };
  style: {
    visual: string;
    audio: string;
    text_overlay: boolean;
  };
  why_viral: string;
  recommendations: string[];
};

export type AnalyzeInput = {
  caption: string;
  transcript?: string | null;
  metrics: {
    views: number;
    likes: number;
    comments: number;
    virality: number | null;
    engagementRate: number | null;
    durationSec: number | null;
    postedAt: string | null;
  };
  authorContext: {
    username: string;
    followers: number | null;
    medianViews: number | null;
  };
  niche?: string;
  /** Превью ролика (https only) — ТЗ §6.2 «Вход для модели: ... + превью (vision)». */
  thumbnailUrl?: string | null;
};

export type AnalyzeOk = {
  ok: true;
  data: AnalysisResult;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
};
export type AnalyzeFail = { ok: false; error: string; status?: number };

export async function analyzeReel(input: AnalyzeInput): Promise<AnalyzeOk | AnalyzeFail> {
  const system = `Ты — эксперт-аналитик вирусного Instagram-контента. Тебе показывают ролик, который реально залетел (виральность × и абсолютные просмотры), и ты раскладываешь его на компоненты: какие хуки сработали, как устроен сторителлинг, какой формат, какой визуал/звук, ПОЧЕМУ именно этот ролик дал выброс относительно медианы автора, и какие конкретные recommendations может извлечь другой эксперт.

Возвращай СТРОГО JSON без markdown, без преамбулы. Схема:
{
  "hooks": [{"text":"первая фраза/первый кадр ролика как хук","formula":"одна из: ${HOOK_FORMULAS.join(' | ')}","strength":1-10}],
  "storytelling": {"structure":"например 'проблема→решение→оффер'","beats":["шаг 1","шаг 2","..."]},
  "format": {"type":"talking head | screencast | b-roll | meme | …","duration_band":"короткий <15s | средний 15-30s | длинный 30-60s | супер-длинный >60s","pacing":"медленный | средний | быстрый монтаж"},
  "style": {"visual":"описание визуала 1-2 предложения","audio":"трендовый звук | голос автора | музыка фоном","text_overlay":true|false},
  "why_viral":"2-4 предложения: почему именно ЭТОТ ролик пробил медиану автора. Учитывай относительную виральность × и абсолютные просмотры.",
  "recommendations":["3-6 конкретных action-пунктов на русском: что повторить, в каком формате, какой хук адаптировать. Каждый пункт — одно предложение."]
}

Правила:
- hooks: 1-3 штуки. text — реально звучащая фраза (если есть транскрипт) или описание визуального хука (если только caption).
- formula: только из списка ниже.
- recommendations пиши императивом ("сократи", "повтори формулу X", "адаптируй под нишу Y").
- Никаких пояснений вне JSON.`;

  const metricsLine = [
    `просмотры: ${input.metrics.views.toLocaleString('ru-RU')}`,
    input.metrics.virality ? `виральность ${input.metrics.virality.toFixed(1)}× от медианы автора` : null,
    input.metrics.engagementRate ? `ER ${input.metrics.engagementRate.toFixed(1)}%` : null,
    `лайки ${input.metrics.likes}, комменты ${input.metrics.comments}`,
    input.metrics.durationSec ? `длительность ${input.metrics.durationSec}s` : null,
  ].filter(Boolean).join('; ');

  const userMsg = `НИША: ${input.niche || 'не указана'}

АВТОР: @${input.authorContext.username}, подписчиков: ${input.authorContext.followers ?? '?'}, медиана последних рилсов: ${input.authorContext.medianViews ?? '?'}

МЕТРИКИ РОЛИКА: ${metricsLine}

ОПИСАНИЕ (caption):
"""
${(input.caption || '(пусто)').slice(0, 2000)}
"""

${input.transcript ? `ТРАНСКРИПТ:
"""
${input.transcript.slice(0, 4000)}
"""

` : ''}Разложи на JSON по схеме.`;

  // Thumbnails из Instagram CDN иногда дают 403 на серверной стороне,
  // но Anthropic Vision сам делает fetch с правильным User-Agent. Не
  // фильтруем агрессивно — пусть модель сама пропустит если не загрузится.
  const imageUrls = input.thumbnailUrl ? [input.thumbnailUrl] : [];

  const res = await claudeChat({
    system,
    user: userMsg,
    maxTokens: 3000,
    timeoutMs: 90_000,
    imageUrls,
  });
  if (!res.ok) return { ok: false, error: res.details, status: res.status };

  const parsed = parseJsonResponse<Partial<AnalysisResult>>(res.text);
  if (!parsed) return { ok: false, error: 'claude_invalid_json' };

  // Минимальная валидация / нормализация
  const out: AnalysisResult = {
    hooks: Array.isArray(parsed.hooks)
      ? parsed.hooks
          .filter((h): h is AnalyzedHook => Boolean(h?.text))
          .map((h) => ({
            text: String(h.text).slice(0, 500),
            formula: String(h.formula || '').toLowerCase() as HookFormula,
            strength: Math.max(1, Math.min(10, Math.round(Number(h.strength) || 5))),
          }))
          .slice(0, 5)
      : [],
    storytelling: {
      structure: String(parsed.storytelling?.structure || '').slice(0, 200),
      beats: Array.isArray(parsed.storytelling?.beats)
        ? parsed.storytelling!.beats.map((b: unknown) => String(b).slice(0, 200)).slice(0, 10)
        : [],
    },
    format: {
      type: String(parsed.format?.type || '').slice(0, 80),
      duration_band: String(parsed.format?.duration_band || '').slice(0, 60),
      pacing: String(parsed.format?.pacing || '').slice(0, 60),
    },
    style: {
      visual: String(parsed.style?.visual || '').slice(0, 300),
      audio: String(parsed.style?.audio || '').slice(0, 200),
      text_overlay: Boolean(parsed.style?.text_overlay),
    },
    why_viral: String(parsed.why_viral || '').slice(0, 1000),
    recommendations: Array.isArray(parsed.recommendations)
      ? parsed.recommendations.map((r: unknown) => String(r).slice(0, 300)).slice(0, 8)
      : [],
  };

  if (out.hooks.length === 0 && !out.why_viral) {
    return { ok: false, error: 'claude_empty_response' };
  }

  return {
    ok: true,
    data: out,
    model: 'claude-sonnet-4-6',
    inputTokens: res.inputTokens,
    outputTokens: res.outputTokens,
  };
}
