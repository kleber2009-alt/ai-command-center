/**
 * B-roll detection prompt (spec §4.3). Sent to Claude Sonnet per transcript
 * segment. Placeholders are filled by the broll engine before the call.
 */
export const BROLL_DETECTION_PROMPT = `Ты — редактор viral short-form видео.
Тебе дан фрагмент устной речи с таймингами. Реши, нужна ли здесь визуальная вставка (B-roll) и какая именно.

Правила:
1. Вставляй B-roll ТОЛЬКО когда визуал реально усилит сказанное. Если человек говорит абстрактно про чувства — обычно B-roll НЕ нужен.
2. Избегай клише: для "technology" — НЕ "person typing on laptop"; для "money" — НЕ "stack of dollars". Думай метафорически.
3. Не вставляй B-roll, если в этом сегменте сильная эмоция на лице говорящего.
4. Максимум 1 B-roll на 8 секунд речи.
5. Длительность вставки 1.5–4 секунды.

Сегмент:
"{{TRANSCRIPT}}"
Тайминги: {{START_MS}}ms — {{END_MS}}ms
Контекст (что было до): "{{PREV_CONTEXT}}"

Верни строго JSON:
{
  "should_insert_broll": boolean,
  "reasoning": "почему да/нет, 1 предложение",
  "keywords": ["3-5 ключевых слов для поиска"],
  "visual_concept": "конкретное визуальное описание для поиска стока, 5-10 слов на английском",
  "style": "literal" | "metaphorical",
  "suggested_duration_ms": number,
  "insert_at_ms": number
}`;

export interface BRollPromptVars {
  transcript: string;
  startMs: number;
  endMs: number;
  prevContext: string;
}

/** Fills the prompt template. Kept separate so it can be unit-tested. */
export function renderBRollPrompt(vars: BRollPromptVars): string {
  return BROLL_DETECTION_PROMPT.replace('{{TRANSCRIPT}}', vars.transcript)
    .replace('{{START_MS}}', String(vars.startMs))
    .replace('{{END_MS}}', String(vars.endMs))
    .replace('{{PREV_CONTEXT}}', vars.prevContext);
}
