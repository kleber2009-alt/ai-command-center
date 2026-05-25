import type { CaptionPreset } from './types.js';

// --- Models (§ "Production models" / spec §1) ---
export const MODELS = {
  smart: process.env.CLAUDE_MODEL_SMART ?? 'claude-sonnet-4-6',
  cheap: process.env.CLAUDE_MODEL_CHEAP ?? 'claude-haiku-4-5-20251001',
  embedding: process.env.EMBEDDING_MODEL ?? 'text-embedding-3-large',
} as const;

/** text-embedding-3-large dimensionality; pgvector column + HNSW index (§6). */
export const EMBEDDING_DIM = 3072;

// --- Upload limits (§5.1, §10) ---
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB
export const MAX_DURATION_MS = 2 * 60 * 60 * 1000; // 2 hours
export const ALLOWED_VIDEO_MIME = ['video/mp4', 'video/quicktime'] as const;
/** Magic-byte prefixes used to verify uploads beyond the file extension (§10). */
export const MAX_CONCURRENT_PROJECTS_PER_USER = 3; // antifraud (§10)
export const API_RATE_LIMIT_PER_MIN = 100; // (§10)

// --- B-roll engine tuning (§4.2) ---
export const BROLL = {
  /** Semantic segment target range. */
  segmentMinMs: 3_000,
  segmentMaxMs: 8_000,
  /** A pause longer than this is treated as a thought boundary. */
  pauseThresholdMs: 400,
  /** No more than one B-roll insert per this window of speech. */
  minSpacingMs: 8_000,
  insertMinMs: 1_500,
  insertMaxMs: 4_000,
  /** Asset must exceed insert length by this safety margin. */
  assetMarginMs: 500,
  /** B-roll may cover at most this fraction of a clip's duration. */
  maxCoverageRatio: 0.4,
  /** Below this length an insert renders as picture-in-picture, not fullscreen. */
  pipThresholdMs: 2_000,
  fadeMs: 200,
  /** Candidates pulled per provider before ranking. */
  topPerProvider: 10,
  /** Final shortlist size after cosine ranking. */
  topRanked: 3,
  /** Diversity: reject a candidate too similar to a recently-used one. */
  diversitySimilarityCeiling: 0.92,
} as const;

// --- Cache TTLs in seconds (§4.4) ---
export const CACHE_TTL = {
  assetEmbedding: 30 * 24 * 60 * 60,
  queryEmbedding: 7 * 24 * 60 * 60,
  pexelsSearch: 24 * 60 * 60,
} as const;

// --- Clip detection (§5.3) ---
export const CLIP_DETECTION = {
  minClips: 5,
  maxClips: 20,
  minClipMs: 15_000,
  maxClipMs: 90_000,
} as const;

/** Viral Score weights (§5.7): hook 40 / pacing 20 / emotional 20 / density 20. */
export const VIRAL_SCORE_WEIGHTS = {
  hook: 0.4,
  pacing: 0.2,
  emotional: 0.2,
  density: 0.2,
} as const;

// --- Credits & plans (§9) ---
export const CREDIT_COSTS = {
  transcribePerMinute: 1,
  clipDetectionPerProject: 2,
  brollPlanPerClip: 1,
  render1080pPerClip: 2,
  render4kPerClip: 5,
} as const;

export const PLANS = {
  free: { credits: 30, priceUsd: 0, watermark: true, seats: 1 },
  creator: { credits: 500, priceUsd: 19, watermark: false, seats: 1 },
  pro: { credits: 2000, priceUsd: 49, watermark: false, seats: 1 },
  agency: { credits: 8000, priceUsd: 149, watermark: false, seats: 5 },
} as const;

export type PlanId = keyof typeof PLANS;

export const CAPTION_PRESETS: CaptionPreset[] = [
  'hormozi',
  'mrbeast',
  'podcast',
  'cinematic',
  'neon',
  'minimal',
];

/** Signed-URL lifetime for R2 objects (§10). */
export const SIGNED_URL_TTL_S = 60 * 60;
