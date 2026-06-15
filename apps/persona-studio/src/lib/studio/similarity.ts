// Сквозное требование §2 (Мастер-ТЗ) — антиплагиат / трансформация.
//
// «Клон» переносит ПРИЁМ, а не текст. Перед сохранением сгенерированного
// сценария считаем cosine между эмбеддингом net-new текста и текстом
// источника (caption / транскрипт исходного reel):
//   ≥0.85          → block  («слишком похоже на источник, переформулируй»)
//   0.75 … 0.85    → warn   (предупреждение, публикация разрешена)
//   <0.75          → pass
//
// Эмбеддинги — тот же Voyage, что и в research-дедупе (lib/research/embeddings).
// Если VOYAGE_API_KEY не настроен или источника нет — gate='pass' с
// similarity=null (не блокируем пайплайн, фиксируем reason для аудита).

import { prisma } from '@/lib/prisma';
import { embedText, isEmbeddingsConfigured } from '@/lib/research/embeddings';
import type { SimilarityGate, SimilarityResult } from './types';

export const SIMILARITY_BLOCK = 0.85;
export const SIMILARITY_WARN = 0.75;

export function gateFor(similarity: number): SimilarityGate {
  if (similarity >= SIMILARITY_BLOCK) return 'block';
  if (similarity >= SIMILARITY_WARN) return 'warn';
  return 'pass';
}

/** Косинусная близость двух векторов одинаковой размерности. */
export function cosine(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Текст источника-вдохновения: улучшенный транскрипт → транскрипт → caption. */
async function resolveSourceText(sourceReelId: string): Promise<string | null> {
  const reel = await prisma.researchReel.findUnique({
    where: { id: sourceReelId },
    select: {
      caption: true,
      transcripts: {
        // improved=true сначала (текст почищен Claude), иначе любой свежий
        select: { text: true },
        orderBy: [{ improved: 'desc' }, { createdAt: 'desc' }],
        take: 1,
      },
    },
  });
  if (!reel) return null;
  const tr = reel.transcripts[0];
  return (tr?.text || reel.caption || '').trim() || null;
}

/**
 * Проверка близости сгенерированного текста к источнику.
 * Передай либо готовый `sourceText`, либо `sourceReelId` (текст подтянем сами).
 */
export async function checkSimilarity(opts: {
  generatedText: string;
  sourceText?: string | null;
  sourceReelId?: string | null;
}): Promise<SimilarityResult> {
  const generated = (opts.generatedText || '').trim();
  if (generated.length < 8) {
    return { similarity: null, gate: 'pass', reason: 'generated_too_short' };
  }

  let sourceText = (opts.sourceText || '').trim() || null;
  if (!sourceText && opts.sourceReelId) {
    sourceText = await resolveSourceText(opts.sourceReelId);
  }

  if (!isEmbeddingsConfigured() || !sourceText) {
    return { similarity: null, gate: 'pass', reason: 'no_embeddings_or_source' };
  }

  const [g, s] = await Promise.all([embedText(generated), embedText(sourceText)]);
  if (!g.ok || !s.ok) {
    return { similarity: null, gate: 'pass', reason: 'embed_failed' };
  }

  const sim = cosine(g.vector, s.vector);
  const rounded = Number(sim.toFixed(3));
  return { similarity: rounded, gate: gateFor(sim) };
}

/**
 * Записать провенанс ассета (§2 — прозрачность и аудит «откуда контент»).
 * Возвращает созданную строку. Вызывать после генерации сценария/ассета.
 */
export async function recordProvenance(opts: {
  userId: string;
  result: SimilarityResult;
  assetId?: string | null;
  assetType?: string; // generation | script | content_item
  sourceReelId?: string | null;
}) {
  return prisma.provenance.create({
    data: {
      userId: opts.userId,
      assetId: opts.assetId ?? null,
      assetType: opts.assetType ?? 'generation',
      sourceReelId: opts.sourceReelId ?? null,
      similarity: opts.result.similarity,
      gate: opts.result.gate,
      reason: opts.result.reason ?? null,
    },
  });
}
