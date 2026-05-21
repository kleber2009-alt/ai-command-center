// ═══════════════════════════════════════════════════════════════════
// lib/voice-analyzer.ts
// ───────────────────────────────────────────────────────────────────
// Port of voice_analyzer.py: takes transcript text → asks Claude for a
// structured brand-voice profile → returns parsed JSON + cost meta.
// Same SYSTEM_PROMPT and USER_PROMPT, so output schema stays identical
// to what aisales-app-v2/code/utils/voice_analyzer.py produces.
// ═══════════════════════════════════════════════════════════════════

import { complete, DEFAULT_MODEL } from './anthropic';

const PRICE_INPUT = 3.0; // USD per 1M tokens (Sonnet 4.6)
const PRICE_OUTPUT = 15.0;

const SYSTEM_PROMPT = `Ты — лингвист-аналитик голоса бренда. Твоя задача — извлечь из транскриптов подкастов человека структурированный профиль его голоса для AI-агентов продаж.

Это критично: AI-агенты будут говорить с клиентами от его имени, и ошибка в голосе = клиенты заметят что говорит не он.

Извлекай ТОЧНО то что есть в транскрипте, НЕ ВЫДУМЫВАЙ. Если чего-то нет — оставь поле пустым массивом или null.`;

const USER_PROMPT_TEMPLATE = (transcripts: string) => `# ТРАНСКРИПТ(Ы)

${transcripts}

---

# ЗАДАЧА

Извлеки структурированный профиль голоса. Верни СТРОГО валидный JSON:

\`\`\`json
{
  "identity": {
    "name": "имя если упомянуто, иначе null",
    "what_i_do": "одна строка чем занимается",
    "target_audience": "кому продаёт / для кого работает",
    "differentiation": "что отличает от конкурентов (1-2 фразы)",
    "business_age_or_scale": "возраст бизнеса или масштаб если упомянут"
  },
  "tone_of_voice": {
    "addressing": "ты | вы | смешанно",
    "formality": "casual | neutral | formal",
    "energy": "high | medium | low",
    "humor": "много | умеренно | редко | нет",
    "emoji_usage": "много | 1-2 на сообщение | редко | нет",
    "typical_length": "короткие фразы | средние | длинные размышления",
    "first_person_share": 0
  },
  "values": ["ценность 1 — 1 фраза + краткое раскрытие", "ценность 2"],
  "red_lines": ["чего никогда не делает 1"],
  "favorite_phrases": ["фраза 1 — точная цитата как говорит"],
  "banned_phrases": ["слова/обороты которые НЕ употребляет"],
  "style_examples": [
    { "context": "о чём говорил", "quote": "точная цитата 1-3 предложения", "demonstrates": "что показывает (тон, ценности, стиль)" }
  ],
  "themes": [{ "theme": "тема которая часто поднимается", "weight": 0.0 }],
  "vocabulary_notes": "наблюдения о словаре — профжаргон, англицизмы, etc"
}
\`\`\`

# ПРАВИЛА

1. Только то что есть в транскрипте. Никаких выдумок.
2. Цитаты — точные. Не перефразируй.
3. favorite_phrases — это его реальные обороты, не общие.
4. Если поле трудно вывести из контекста — null или пустой массив.
5. tone_of_voice.first_person_share — % предложений где говорит «я» (0.0-1.0).
6. values · red_lines — выводи из контекста, описывай суть.
7. style_examples — 5-10 штук, разные ситуации.
8. themes — top 5-10 по частоте.

Только JSON. Никакого текста до или после.`;

const MAX_TRANSCRIPT_CHARS = 150_000;

export type VoiceProfile = Record<string, unknown>;

export type AnalysisResult =
  | {
      ok: true;
      profile: VoiceProfile;
      meta: {
        model: string;
        input_tokens: number;
        output_tokens: number;
        cost_usd: number;
        elapsed_ms: number;
        transcript_chars: number;
      };
    }
  | { ok: false; status: number; code: string; details?: string };

export async function analyzeTranscripts(transcript: string): Promise<AnalysisResult> {
  if (!transcript.trim()) return { ok: false, status: 400, code: 'transcript_required' };

  const truncated = transcript.length > MAX_TRANSCRIPT_CHARS
    ? transcript.slice(0, MAX_TRANSCRIPT_CHARS)
    : transcript;

  const t0 = Date.now();
  const res = await complete({
    system: SYSTEM_PROMPT,
    user: USER_PROMPT_TEMPLATE(truncated),
    maxTokens: 4096,
    temperature: 0.4,
    model: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
  });
  const elapsedMs = Date.now() - t0;

  if (!res.ok) {
    return { ok: false, status: res.status, code: 'anthropic_failed', details: res.details };
  }

  const start = res.text.indexOf('{');
  const end = res.text.lastIndexOf('}');
  if (start === -1 || end === -1) {
    return {
      ok: false,
      status: 502,
      code: 'no_json_in_response',
      details: res.text.slice(0, 300),
    };
  }

  let profile: VoiceProfile;
  try {
    profile = JSON.parse(res.text.slice(start, end + 1));
  } catch (e) {
    return {
      ok: false,
      status: 502,
      code: 'json_parse_failed',
      details: (e as Error).message,
    };
  }

  const costUsd =
    (res.inputTokens / 1_000_000) * PRICE_INPUT +
    (res.outputTokens / 1_000_000) * PRICE_OUTPUT;

  return {
    ok: true,
    profile,
    meta: {
      model: res.model,
      input_tokens: res.inputTokens,
      output_tokens: res.outputTokens,
      cost_usd: Math.round(costUsd * 1_000_000) / 1_000_000,
      elapsed_ms: elapsedMs,
      transcript_chars: truncated.length,
    },
  };
}
