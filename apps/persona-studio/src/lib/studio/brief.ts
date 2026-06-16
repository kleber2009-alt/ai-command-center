// Сериализаторы Модуля B (Brief/Generation) для клиента.

import type { BriefView, GenerationStage, GenerationStatus, GenerationView, SimilarityGate } from './types';

export const BRIEF_INCLUDE = {
  sourceReel: {
    select: {
      thumbnailUrl: true,
      url: true,
      author: { select: { username: true } },
    },
  },
  generations: { orderBy: { createdAt: 'desc' } },
} as const;

type GenerationRow = {
  id: string;
  briefId: string;
  stage: string;
  status: string;
  script: string | null;
  similarity: number | null;
  gate: string | null;
  videoGenerationId: string | null;
  videoEditId: string | null;
  finalUrl: string | null;
  costCredits: number;
  errorMsg: string | null;
  createdAt: Date;
  updatedAt: Date;
  // опц. join'ы для воркспейса
  videoGeneration?: { status: string; videoUrl: string | null } | null;
  videoEdit?: { status: string; resultUrl: string | null } | null;
};

export function serializeGeneration(g: GenerationRow): GenerationView {
  return {
    id: g.id,
    briefId: g.briefId,
    stage: g.stage as GenerationStage,
    status: g.status as GenerationStatus,
    script: g.script,
    similarity: g.similarity,
    gate: (g.gate as SimilarityGate | null) ?? null,
    videoGenerationId: g.videoGenerationId,
    videoEditId: g.videoEditId,
    finalUrl: g.finalUrl,
    costCredits: g.costCredits,
    errorMsg: g.errorMsg,
    createdAt: g.createdAt.toISOString(),
    updatedAt: g.updatedAt.toISOString(),
    videoStatus: g.videoGeneration?.status ?? null,
    videoUrl: g.videoGeneration?.videoUrl ?? null,
    editStatus: g.videoEdit?.status ?? null,
  };
}

// include для «богатой» генерации (воркспейс-поллинг)
export const GENERATION_INCLUDE = {
  videoGeneration: { select: { status: true, videoUrl: true } },
  videoEdit: { select: { status: true, resultUrl: true } },
} as const;

type BriefRow = {
  id: string;
  personaId: string | null;
  sourceReelId: string | null;
  hookArchetype: string | null;
  format: string | null;
  lengthSec: number | null;
  lang: string;
  topic: string | null;
  status: string;
  createdAt: Date;
  sourceReel: {
    thumbnailUrl: string | null;
    url: string | null;
    author: { username: string } | null;
  } | null;
  generations: GenerationRow[];
};

export function serializeBrief(b: BriefRow): BriefView {
  return {
    id: b.id,
    personaId: b.personaId,
    sourceReelId: b.sourceReelId,
    hookArchetype: b.hookArchetype,
    format: b.format,
    lengthSec: b.lengthSec,
    lang: b.lang,
    topic: b.topic,
    status: b.status,
    createdAt: b.createdAt.toISOString(),
    source: b.sourceReel
      ? {
          thumbnailUrl: b.sourceReel.thumbnailUrl,
          authorUsername: b.sourceReel.author?.username ?? null,
          url: b.sourceReel.url,
        }
      : null,
    generations: b.generations.map(serializeGeneration),
  };
}
