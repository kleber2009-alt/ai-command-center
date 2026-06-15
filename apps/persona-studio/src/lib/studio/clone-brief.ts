// «Клонировать формат» (Мастер-ТЗ §2 + §4). Из находки Research строим бриф,
// перенося ТОЛЬКО структуру: архетип хука, формат, длину, язык. Дословный
// текст источника (caption/транскрипт) в бриф НЕ копируется — он net-new
// генерируется на стадии сценария под персону пользователя.

import { prisma } from '@/lib/prisma';

export type CloneStructure = {
  hookArchetype: string | null;
  format: string | null;
  lengthSec: number | null;
  lang: string;
  topic: string | null; // тематический угол (ниша-теги, не текст источника)
};

// Достаём строковое значение из Json-поля анализа по нескольким возможным ключам.
function pickString(obj: unknown, keys: string[]): string | null {
  if (!obj || typeof obj !== 'object') return null;
  const rec = obj as Record<string, unknown>;
  for (const k of keys) {
    const v = rec[k];
    if (typeof v === 'string' && v.trim()) return v.trim().slice(0, 120);
  }
  return null;
}

const POST_TYPE_TO_FORMAT: Record<string, string> = {
  reel: 'talking-head',
  image: 'single-image',
  carousel: 'carousel',
};

/**
 * Выводит структуру брифа из reel + (если есть) последнего анализа.
 * Возвращает null, если reel не принадлежит юзеру / не найден.
 */
export async function deriveCloneStructure(opts: {
  reelId: string;
  fallbackLang?: string;
}): Promise<CloneStructure | null> {
  const reel = await prisma.researchReel.findUnique({
    where: { id: opts.reelId },
    select: {
      postType: true,
      durationSec: true,
      language: true,
      nicheTags: true,
      analyses: {
        select: { hooks: true, format: true },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });
  if (!reel) return null;

  const analysis = reel.analyses[0];
  const hookArchetype =
    pickString(analysis?.hooks, ['archetype', 'type', 'formula', 'name']) ?? null;
  const format =
    pickString(analysis?.format, ['type', 'name', 'format']) ??
    POST_TYPE_TO_FORMAT[reel.postType] ??
    reel.postType;

  // topic — наш тематический угол из ниша-тегов (не дословный текст источника)
  const topic = reel.nicheTags.length ? reel.nicheTags.slice(0, 5).join(', ') : null;

  return {
    hookArchetype,
    format,
    lengthSec: reel.durationSec ?? null,
    lang: reel.language || opts.fallbackLang || 'ru',
    topic,
  };
}
