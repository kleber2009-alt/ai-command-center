// «Уникализировать» for the REEL branch: the owner's OWN reel (transcript or
// caption) → a net-new script in the owner's voice. The idea and facts stay
// (it's the author's own material), the wording, hook and order change so the
// new reel isn't a re-upload. Checked by the §2 similarity gate; one stricter
// retry when the first draft is blocked.

import { claudeChat } from '@/lib/research/claude';
import { transcribeReel } from '@/lib/research/transcribe';
import { checkSimilarity } from '@/lib/studio/similarity';
import { env } from '@/lib/env';
import type { SimilarityResult } from '@/lib/studio/types';

export type ScriptVoice = { name: string; lang: string; examples: string[]; taboo: string[] };

/** System prompt for the rewrite. Pure — unit-tested. */
export function buildUniquifySystem(voice: ScriptVoice, opts: { strict?: boolean; targetSec?: number | null } = {}): string {
  const sec = opts.targetSec && opts.targetSec > 5 ? Math.round(Math.min(Math.max(opts.targetSec, 15), 90)) : 40;
  const words = Math.round(sec * 2.4);
  const lines = [
    'Ты — сценарист коротких вертикальных видео (Reels).',
    `Автор — ${voice.name}. Ниже его СОБСТВЕННЫЙ ролик, который хорошо зашёл. Сделай из него НОВЫЙ ролик для того же автора.`,
    `Язык: ${voice.lang || 'ru'}. Длина: ~${sec} сек (~${words} слов) — HeyGen озвучит текст голосом автора.`,
    'Сохрани главную мысль, факты и пользу. Поменяй всё остальное:',
    '- новый хук в первые 3 секунды (другой приём: вопрос, контраст, цифра, личная история);',
    '- другой порядок и другие формулировки, свои примеры;',
    '- в конце — короткий призыв к действию.',
    'Пиши разговорно, от первого лица, как автор говорит в камеру. Без эмодзи, хэштегов, ремарок, таймкодов и заголовков.',
  ];
  if (opts.strict) {
    lines.push('', 'ВАЖНО: прошлый вариант получился слишком похож на исходник. Перескажи идею полностью другими словами и с другой структурой — ни одной фразы из исходника.');
  }
  if (voice.examples.length) {
    lines.push('', 'Как автор говорит (образцы тона, не копировать):');
    voice.examples.slice(0, 3).forEach((ex) => lines.push(`— ${ex.slice(0, 400)}`));
  }
  if (voice.taboo.length) lines.push('', `Не использовать слова: ${voice.taboo.slice(0, 30).join(', ')}.`);
  lines.push('', 'Верни ТОЛЬКО текст, который автор произнесёт.');
  return lines.join('\n');
}

/** Strip what a model sometimes adds around the spoken text. Pure — unit-tested. */
export function cleanScript(text: string): string {
  return text
    .replace(/^```[a-z]*\n?|```$/gim, '')
    .replace(/^\s*(сценарий|script|текст)\s*:\s*/i, '')
    .replace(/^[ \t]*\[[^\]\n]{1,40}\][ \t]*/gm, '') // [ХУК], [CTA] …
    .replace(/^[ \t]*\(?\d{1,2}[:.]\d{2}(?:[ \t]*[–-][ \t]*\d{1,2}[:.]\d{2})?\)?[ \t]*/gm, '') // 0:00–0:03
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Text of the source reel: Whisper transcript of the mp4 when we can, else the caption. */
export async function resolveReelSourceText(opts: { videoUrl: string | null; caption: string | null; lang?: string }): Promise<{
  text: string;
  from: 'transcript' | 'caption';
}> {
  const caption = (opts.caption ?? '').trim();
  if (opts.videoUrl) {
    const t = await transcribeReel({ videoUrl: opts.videoUrl, caption: opts.caption, lang: opts.lang }).catch(() => null);
    if (t && t.ok && t.source === 'whisper' && t.text.trim().length > 20) {
      return { text: t.text.trim(), from: 'transcript' };
    }
  }
  return { text: caption, from: 'caption' };
}

export type UniquifyResult =
  | { ok: true; script: string; similarity: SimilarityResult; attempts: number }
  | { ok: false; error: string };

export async function uniquifyReelScript(opts: {
  sourceText: string;
  voice: ScriptVoice;
  targetSec?: number | null;
}): Promise<UniquifyResult> {
  const source = opts.sourceText.trim().slice(0, 6000);
  if (source.length < 10) return { ok: false, error: 'no_source_text' };

  let last: { script: string; similarity: SimilarityResult } | null = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await claudeChat({
      system: buildUniquifySystem(opts.voice, { strict: attempt > 1, targetSec: opts.targetSec }),
      user: `Исходный ролик автора:\n"""\n${source}\n"""\n\nНапиши новый сценарий.`,
      maxTokens: 900,
      model: env.ANTHROPIC_DEEP_MODEL,
    });
    if (!res.ok) {
      if (last) break;
      return { ok: false, error: `claude ${res.status}: ${res.details.slice(0, 200)}` };
    }
    const script = cleanScript(res.text);
    if (script.length < 20) {
      if (last) break;
      return { ok: false, error: 'script_too_short' };
    }
    const similarity = await checkSimilarity({ generatedText: script, sourceText: source });
    last = { script, similarity };
    if (similarity.gate !== 'block') return { ok: true, ...last, attempts: attempt };
  }
  return last ? { ok: true, ...last, attempts: 2 } : { ok: false, error: 'script_failed' };
}
