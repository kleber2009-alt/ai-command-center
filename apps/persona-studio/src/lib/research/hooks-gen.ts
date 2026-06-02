// Генератор хуков по формуле + нише (ТЗ §9 источник 2). 1 кр./формула.
// Caller вызывает с одной формулой за раз; UI обычно даст массив формул
// и батч идёт через Promise.all с отдельным charge на каждую.

import { claudeChat, parseJsonResponse } from './claude';
import { getFormula, isValidFormulaSlug } from './hook-formulas';
import { env } from '@/lib/env';

export type GenHookResult =
  | { ok: true; hooks: Array<{ text: string }>; formula: string }
  | { ok: false; error: string; status?: number };

const COUNT_PER_FORMULA = 5;

export async function generateHooks(opts: {
  formula: string;
  niche?: string;
  language?: string;
}): Promise<GenHookResult> {
  if (!isValidFormulaSlug(opts.formula)) {
    return { ok: false, error: 'invalid_formula' };
  }
  const def = getFormula(opts.formula);
  if (!def) return { ok: false, error: 'invalid_formula' };

  const lang = opts.language || 'ru';
  const langName = lang === 'ru' ? 'русском' : lang;

  const system = `Ты — копирайтер коротких видео (Instagram Reels). Тебе дают одну хук-формулу и нишу. Возвращаешь JSON-массив ${COUNT_PER_FORMULA} разных хуков на ${langName} языке, каждый из которых:

- следует логике формулы "${def.label}" (${def.description})
- первая фраза, которая произносится/показывается на экране за 1-3 секунды
- 5-15 слов, естественный разговорный язык, БЕЗ эмодзи и хэштегов
- адаптирован под нишу (если задана) — используй её лексику и боли

Формат строго:
[{"text":"первый хук"},{"text":"второй хук"},...]

Никакого текста вне JSON.`;

  const userMsg = `Формула: "${def.label}" — ${def.description}
Шаблон-пример: "${def.template}"
Ниша: ${opts.niche || 'не указана (универсально)'}

Сгенерируй ${COUNT_PER_FORMULA} хуков.`;

  const res = await claudeChat({
    system,
    user: userMsg,
    maxTokens: 1500,
    timeoutMs: 45_000,
    // Хуки дёшевы — используем Haiku
    model: env.ANTHROPIC_PARSER_MODEL,
  });
  if (!res.ok) return { ok: false, error: res.details, status: res.status };

  const parsed = parseJsonResponse<Array<{ text?: string }>>(res.text);
  if (!Array.isArray(parsed)) return { ok: false, error: 'claude_invalid_json' };

  const hooks = parsed
    .map((h) => (typeof h?.text === 'string' ? h.text.trim() : ''))
    .filter((t) => t.length >= 10 && t.length <= 300)
    .map((text) => ({ text }))
    .slice(0, COUNT_PER_FORMULA);

  if (hooks.length === 0) return { ok: false, error: 'claude_empty_response' };

  return { ok: true, hooks, formula: opts.formula };
}
