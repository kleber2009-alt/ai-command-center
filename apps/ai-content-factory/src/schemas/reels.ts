// JSON Schema + TypeScript types for an Instagram Reels script (25–45 s,
// scenes 3–7 s each, each scene tied to a footage tag).

import type { JSONSchemaType } from 'ajv';

// Field contract injected into the reels-script prompt so Claude emits
// schema-valid JSON. Mirrors the schema below.
export const REELS_CONTRACT = `Верни СТРОГО валидный JSON ровно по этой форме, без лишних полей:
{
  "hook": "первая фраза, 3–4 секунды, максимум 110 символов",
  "scenes": [
    {
      "text": "что говорит герой / что озвучивает голос за кадром",
      "duration": 4,
      "footageTag": "один из тегов из data/assets/footage-tags.json"
    }
  ],
  "cta": "финальный призыв с кодовым словом",
  "subtitles": ["короткие фразы для жёстких субтитров", "по одной на сцену"]
}
Сцен 5–9 штук. Сумма duration всех сцен + длина hook должна укладываться в 25–45 секунд.`;

export interface ReelsScene {
  text: string;
  /** Seconds. */
  duration: number;
  footageTag: string;
}

export interface ReelsScript {
  hook: string;
  scenes: ReelsScene[];
  cta: string;
  subtitles: string[];
}

export const reelsSchema: JSONSchemaType<ReelsScript> = {
  type: 'object',
  additionalProperties: false,
  required: ['hook', 'scenes', 'cta', 'subtitles'],
  properties: {
    hook: { type: 'string', minLength: 1, maxLength: 200 },
    scenes: {
      type: 'array',
      minItems: 3,
      maxItems: 12,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text', 'duration', 'footageTag'],
        properties: {
          text: { type: 'string', minLength: 1 },
          duration: { type: 'number', minimum: 1, maximum: 12 },
          footageTag: { type: 'string', minLength: 1 },
        },
      },
    },
    cta: { type: 'string', minLength: 1 },
    subtitles: {
      type: 'array',
      minItems: 1,
      items: { type: 'string', minLength: 1 },
    },
  },
};

export function totalDuration(script: ReelsScript): number {
  return script.scenes.reduce((sum, s) => sum + s.duration, 0);
}

/** Pretty-print the script as Markdown for Telegram fallback delivery. */
export function formatScript(script: ReelsScript): string {
  const lines: string[] = [];
  lines.push(`🎬 *РИЛС · сценарий*`);
  lines.push('');
  lines.push(`*Хук (0–3 с):*`);
  lines.push(`> ${script.hook}`);
  lines.push('');
  lines.push(`*Сцены:*`);
  let cursor = 3;
  for (let i = 0; i < script.scenes.length; i++) {
    const s = script.scenes[i]!;
    const start = cursor;
    const end = cursor + s.duration;
    cursor = end;
    lines.push(`${i + 1}. [${start}–${end} с] \`${s.footageTag}\``);
    lines.push(`   ${s.text}`);
  }
  lines.push('');
  lines.push(`*CTA:*`);
  lines.push(`> ${script.cta}`);
  lines.push('');
  lines.push(`*Субтитры (жёсткие):*`);
  for (const sub of script.subtitles) lines.push(`• ${sub}`);
  lines.push('');
  lines.push(`_Total: ~${Math.round(cursor)} с_`);
  return lines.join('\n');
}
