// Pipeline («ветка») — one item from «Мой блог» on its way to a new post.
// Client-safe types shared by the reel wizard (src/components/pipeline/*) and
// the carousel branch (src/components/pipeline/carousel-pipeline.tsx).

export type PipelineKind = 'reel' | 'carousel';

export const PIPELINE_STAGES = [
  'source',
  'script',
  'video',
  'montage',
  'ready',
  'scheduled',
  'published',
  'error',
] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export type PipelineGate = 'pass' | 'warn' | 'block';

/** «Без монтажа» — the user publishes the raw HeyGen video. */
export const MONTAGE_NONE = 'none';

export type PipelineSourceView = {
  id: string;
  url: string;
  kind: string; // reel | carousel
  source: string; // own | competitors
  owner: string | null;
  thumbnailUrl: string | null;
  caption: string | null;
  plays: number;
  likes: number;
  comments: number;
  shares: number;
  durationSec: number | null;
  videoUrl: string | null;
  slideImages: string[];
  ageHours: number;
};

export type PipelineVideoView = {
  id: string;
  status: string; // pending | processing | completed | failed
  videoUrl: string | null;
  errorMsg: string | null;
  tokensCost: number;
  createdAt: string;
};

export type PipelineMontageView = {
  id: string;
  style: string;
  status: string;
  resultUrl: string | null;
  progress: string | null;
  errorMsg: string | null;
  tokensCost: number;
  createdAt: string;
};

export type PipelinePostView = {
  id: string;
  status: string; // scheduled | publishing | published | partial | failed | canceled
  scheduledAt: string;
  publishedAt: string | null;
  errorMsg: string | null;
  targets: { platform: string; status: string; permalink: string | null; displayName: string | null }[];
};

export type PipelineView = {
  id: string;
  kind: PipelineKind;
  stage: PipelineStage;
  title: string | null;
  sourceText: string | null;
  script: string | null;
  similarity: number | null;
  gate: PipelineGate | null;
  heygenAvatarId: string | null;
  heygenAvatarName: string | null;
  heygenAvatarImage: string | null;
  voiceId: string | null;
  voiceName: string | null;
  montageStyle: string | null;
  videoGenerationId: string | null;
  montageId: string | null;
  carouselDraftId: string | null;
  scheduledPostId: string | null;
  errorMsg: string | null;
  createdAt: string;
  updatedAt: string;
  source: PipelineSourceView | null;
  video: PipelineVideoView | null;
  montage: PipelineMontageView | null;
  post: PipelinePostView | null;
};

/** Token prices shown before each paid step. */
export type PipelineCosts = { script: number; video: number; montage: number };

export const STAGE_LABEL: Record<PipelineStage, string> = {
  source: 'Источник',
  script: 'Сценарий',
  video: 'Видео',
  montage: 'Монтаж',
  ready: 'Готово к публикации',
  scheduled: 'Запланировано',
  published: 'Опубликовано',
  error: 'Ошибка',
};
