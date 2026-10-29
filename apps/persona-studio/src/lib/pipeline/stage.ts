// Stage of a pipeline, derived from the rows it links to. Pure — unit-tested.
//
// reel:  no script → source; script → script; video running → video;
//        video done → montage (or ready when montage was skipped);
//        montage running → montage; montage done → ready;
//        post scheduled/publishing → scheduled; post published → published;
//        any linked failure → error with a readable message.
// carousel: the carousel branch sets its own stage (PATCH); only the linked
//        post moves it to scheduled / published / error.

import { jobErrorText } from '@/lib/error-text';
import { MONTAGE_NONE, type PipelineKind, type PipelineStage } from './types';

type Linked = { status: string; errorMsg?: string | null } | null | undefined;

export type StageInput = {
  kind: PipelineKind | string;
  stage: string;
  script: string | null;
  montageStyle: string | null;
  video?: Linked;
  montage?: Linked;
  post?: Linked;
};

export type StageResult = { stage: PipelineStage; errorMsg: string | null };

const RUNNING = new Set(['pending', 'processing', 'queued']);

function postStage(post: NonNullable<Linked>): StageResult | null {
  if (post.status === 'published') return { stage: 'published', errorMsg: null };
  if (post.status === 'scheduled' || post.status === 'publishing') return { stage: 'scheduled', errorMsg: null };
  if (post.status === 'partial') {
    // some channels went out — count as published, keep the note
    return { stage: 'published', errorMsg: post.errorMsg ?? 'Опубликовано не во все каналы.' };
  }
  if (post.status === 'failed') {
    return { stage: 'error', errorMsg: jobErrorText(post.errorMsg, 'Публикация не удалась — проверьте каналы и повторите.') };
  }
  // canceled → back to ready (the media is still there)
  return null;
}

export function deriveStage(p: StageInput): StageResult {
  if (p.post) {
    const s = postStage(p.post);
    if (s) return s;
  }

  if (p.kind !== 'reel') {
    // carousel: keep what the carousel branch stored; a canceled post → ready
    if (p.post && p.post.status === 'canceled') return { stage: 'ready', errorMsg: null };
    const stored = (p.stage || 'source') as PipelineStage;
    return { stage: stored === 'scheduled' || stored === 'published' ? 'ready' : stored, errorMsg: null };
  }

  if (p.montage) {
    if (p.montage.status === 'completed') return { stage: 'ready', errorMsg: null };
    if (p.montage.status === 'failed') {
      return { stage: 'error', errorMsg: jobErrorText(p.montage.errorMsg, 'Монтаж не удался, токены возвращены. Выберите стиль и повторите.') };
    }
    return { stage: 'montage', errorMsg: null };
  }

  if (p.video) {
    if (p.video.status === 'failed') {
      return { stage: 'error', errorMsg: jobErrorText(p.video.errorMsg, 'Видео не получилось, токены возвращены. Попробуйте ещё раз.') };
    }
    if (p.video.status === 'completed') {
      return { stage: p.montageStyle === MONTAGE_NONE ? 'ready' : 'montage', errorMsg: null };
    }
    if (RUNNING.has(p.video.status)) return { stage: 'video', errorMsg: null };
    return { stage: 'video', errorMsg: null };
  }

  if (p.script && p.script.trim()) return { stage: 'script', errorMsg: null };
  return { stage: 'source', errorMsg: null };
}

/** Which wizard step the stage belongs to (index into REEL_STEPS). */
export const REEL_STEPS = ['source', 'script', 'avatar', 'video', 'montage', 'publish'] as const;
export type ReelStep = (typeof REEL_STEPS)[number];

export function stepForStage(stage: PipelineStage, hasAvatarAndVoice: boolean): ReelStep {
  switch (stage) {
    case 'source':
      return 'source';
    case 'script':
      return hasAvatarAndVoice ? 'avatar' : 'script';
    case 'video':
      return 'video';
    case 'montage':
      return 'montage';
    case 'ready':
    case 'scheduled':
    case 'published':
      return 'publish';
    default:
      return 'video';
  }
}
