// Reels Creator agent (v0). One-shot Claude pipeline:
//   input  : { niche, topic, tone, language }
//   output : { hook, slides[5]: {angle, voiceover, visual_brief}, caption, hashtags[7..10] }
//
// "Multi-agent" sounds fancier than what this is — for v0 it's a single
// structured Claude call. The point is: user gets a complete Reels package
// (hook → outline → captions → hashtags → per-slide visual briefs) that maps
// 1:1 to other tools (each visual_brief can be sent straight to nano-banana-2
// via prefill).

import { chat, extractJson } from "@/lib/anthropic";

export interface ReelsPackage {
  hook: { text: string; type: string; why_works: string };
  slides: Array<{
    n: number;
    angle: string;
    voiceover: string;
    visual_brief: string;
  }>;
  caption: string;
  hashtags: string[];
  cta: string;
  estimated_duration_sec: number;
  meta: { language: string; model: string };
}

export interface ReelsInput {
  niche: string;
  topic: string;
  tone: string;
  language: "ru" | "en";
}

export async function generateReels(input: ReelsInput): Promise<ReelsPackage> {
  const SYSTEM = `Ты — senior creator-strategist для Instagram Reels.
По нише, теме и тону создаёшь полный пакет Reels: hook → 5 кадров с voiceover и визуальным брифом → caption → hashtags → CTA.

Главное:
- Hook должен быть конкретным, без воды. 1-2 секунды на захват внимания.
- 5 слайдов: каждый = один сильный кадр + ровно 1-2 фразы voiceover (3-5 секунд на слайд = 15-25 сек ролик).
- visual_brief должен быть достаточно конкретным чтобы прямо отдать в image-генерацию (фоны, освещение, композиция, стиль).
- Caption: текст под пост, не слишком длинный (2-4 предложения).
- Hashtags: 7-10 штук, mix of broad + niche.
- CTA: чёткое действие в комментариях.

Возвращай СТРОГО JSON по схеме — никакого markdown, никакого текста снаружи.`;

  const SCHEMA = `{
  "hook": { "text": "сам hook (1-2 предложения)", "type": "вопрос|шок|статистика|обещание|история", "why_works": "почему этот hook сработает для ниши" },
  "slides": [
    { "n": 1, "angle": "название/угол слайда", "voiceover": "1-2 фразы голосового сопровождения", "visual_brief": "детальный image-prompt: композиция, свет, стиль, объекты" }
  ],
  "caption": "текст под пост",
  "hashtags": ["#tag1", "#tag2", ...],
  "cta": "конкретное действие",
  "estimated_duration_sec": 15-25
}`;

  const USER = `Ниша: ${input.niche}
Тема ролика: ${input.topic}
Тон/настроение: ${input.tone}
Язык контента: ${input.language === "ru" ? "русский" : "english"}

Создай Reels-пакет. Верни строго JSON:
${SCHEMA}`;

  const ai = await chat({
    system: SYSTEM,
    messages: [{ role: "user", content: USER }],
    maxTokens: 2500,
  });

  const parsed = extractJson<{
    hook: { text: string; type: string; why_works: string };
    slides: Array<{ n: number; angle: string; voiceover: string; visual_brief: string }>;
    caption: string;
    hashtags: string[];
    cta: string;
    estimated_duration_sec: number;
  }>(ai.text);

  if (!parsed) throw new Error(`Claude returned non-JSON: ${ai.text.slice(0, 300)}`);

  return {
    ...parsed,
    meta: { language: input.language, model: ai.model ?? "claude-haiku-4-5" },
  };
}
