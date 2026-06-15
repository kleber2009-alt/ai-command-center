// Стадия «Сценарий» Модуля B (Мастер-ТЗ §4). Claude пишет NET-NEW сценарий под
// персону пользователя и его нишу — переносит ПРИЁМ источника, а не текст (§2).
// После генерации текст уходит в similarity-gate (см. lib/studio/similarity.ts).

import { claudeChat } from '@/lib/research/claude';
import { env } from '@/lib/env';
import type { PersonaTone } from './types';

export type ScriptBrief = {
  hookArchetype: string | null;
  format: string | null;
  lengthSec: number | null;
  lang: string;
  topic: string | null;
};

export type ScriptPersona = {
  name: string;
  lang: string;
  tone: PersonaTone;
};

const LENGTH_HINT: Record<string, string> = {
  short: '20–30 сек (~50–70 слов)',
  medium: '35–50 сек (~90–130 слов)',
  long: '60–75 сек (~150–190 слов)',
};

function buildSystem(persona: ScriptPersona, brief: ScriptBrief): string {
  const lang = brief.lang || persona.lang || 'ru';
  const lengthFromSec = brief.lengthSec
    ? `${brief.lengthSec} сек`
    : persona.tone.length
      ? LENGTH_HINT[persona.tone.length]
      : '30–45 сек';

  const lines = [
    'Ты — сценарист коротких вертикальных видео (reels/shorts).',
    `Пиши на языке: ${lang}.`,
    'Структура: ХУК (3–5 сек) → БОЛЬ/КОНТЕКСТ → РАСКРЫТИЕ/ИНСАЙТ → ПРИЗЫВ (CTA).',
    `Целевая длина: ${lengthFromSec}.`,
    brief.hookArchetype ? `Архетип хука: ${brief.hookArchetype}.` : '',
    brief.format ? `Формат подачи: ${brief.format}.` : '',
    '',
    'КРИТИЧЕСКИ ВАЖНО (антиплагиат):',
    '- Это ОРИГИНАЛЬНЫЙ сценарий. Не копируй и не перефразируй чужой текст.',
    '- Переноси только ПРИЁМ (структуру хука, ритм, формат), а не формулировки.',
    '- Пиши под персону и её нишу своими словами.',
  ];

  if (persona.tone.examples?.length) {
    lines.push('', `Стиль речи персоны «${persona.name}» (образцы — для тона, не для копирования):`);
    persona.tone.examples.slice(0, 3).forEach((ex) => lines.push(`— ${ex.slice(0, 400)}`));
  }
  if (persona.tone.taboo?.length) {
    lines.push('', `Табу-слова (НЕ использовать): ${persona.tone.taboo.slice(0, 30).join(', ')}.`);
  }

  lines.push('', 'Верни ТОЛЬКО текст сценария — без заголовков, разметки и пояснений.');
  return lines.filter(Boolean).join('\n');
}

export type GenerateScriptResult =
  | { ok: true; script: string; inputTokens?: number; outputTokens?: number }
  | { ok: false; error: string };

/**
 * Генерирует net-new сценарий. Тему/угол берём из brief.topic (наши ниша-теги),
 * НЕ из текста источника.
 */
export async function generateScript(opts: {
  persona: ScriptPersona;
  brief: ScriptBrief;
}): Promise<GenerateScriptResult> {
  const { persona, brief } = opts;
  const system = buildSystem(persona, brief);
  const topic = brief.topic?.trim() || 'актуальная тема в нише персоны';
  const user = `Тема/угол видео: ${topic}.\nНапиши сценарий по структуре выше.`;

  const res = await claudeChat({
    system,
    user,
    maxTokens: 900,
    model: env.ANTHROPIC_DEEP_MODEL,
  });
  if (!res.ok) {
    return { ok: false, error: `claude ${res.status}: ${res.details.slice(0, 200)}` };
  }
  const script = res.text.trim();
  if (script.length < 20) return { ok: false, error: 'script_too_short' };
  return { ok: true, script, inputTokens: res.inputTokens, outputTokens: res.outputTokens };
}
