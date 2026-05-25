import { CLIP_DETECTION } from '../constants.js';

/**
 * Clip detection prompt (§5.3). Claude receives the full transcript and finds
 * self-contained viral fragments. Returns strict JSON.
 */
export function renderClipDetectionPrompt(transcriptText: string): string {
  return `Ты — продюсер вирусных коротких видео.
Тебе дан полный транскрипт длинного видео. Найди от ${CLIP_DETECTION.minClips} до ${CLIP_DETECTION.maxClips} самостоятельных, вирусных фрагментов длительностью ${CLIP_DETECTION.minClipMs / 1000}–${CLIP_DETECTION.maxClipMs / 1000} секунд каждый.

Каждый фрагмент должен:
- иметь сильный хук в первые 3 секунды,
- быть понятным без остального контекста,
- содержать законченную мысль, инсайт или эмоцию.

Транскрипт (с таймингами в ms):
{{TRANSCRIPT}}

Верни строго JSON-массив, без markdown:
[
  {
    "start_ms": number,
    "end_ms": number,
    "title": "краткий заголовок клипа",
    "hook_score": number,        // 0..1 — сила хука первых 3 сек
    "retention_score": number,   // 0..1 — удержание до конца
    "emotional_score": number,   // 0..1 — эмоциональный заряд
    "viral_score": number,       // 0..1 — общий вирусный потенциал
    "reasoning": "почему этот фрагмент сработает, 1 предложение"
  }
]`.replace('{{TRANSCRIPT}}', transcriptText);
}

/** Hook analysis for an individual clip's first 3 seconds (§5.7). */
export function renderHookAnalysisPrompt(openingText: string): string {
  return `Оцени силу хука (первые 3 секунды) этого фрагмента для коротких видео.
Текст начала: "${openingText}"

Верни строго JSON:
{
  "hook_strength": number,   // 0..100
  "recommendation": "одна конкретная рекомендация, как усилить хук"
}`;
}
