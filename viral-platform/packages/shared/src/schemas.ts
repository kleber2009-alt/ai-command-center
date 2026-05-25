import { z } from 'zod';

// --- LLM output schemas (validated before we trust model JSON) ---

export const brollCandidateSchema = z.object({
  should_insert_broll: z.boolean(),
  reasoning: z.string(),
  keywords: z.array(z.string()).min(1).max(8),
  visual_concept: z.string().min(1),
  style: z.enum(['literal', 'metaphorical']),
  suggested_duration_ms: z.number().int().positive(),
  insert_at_ms: z.number().int().nonnegative(),
});
export type BRollCandidateRaw = z.infer<typeof brollCandidateSchema>;

export const clipDetectionItemSchema = z.object({
  start_ms: z.number().int().nonnegative(),
  end_ms: z.number().int().positive(),
  title: z.string(),
  hook_score: z.number().min(0).max(1),
  retention_score: z.number().min(0).max(1),
  emotional_score: z.number().min(0).max(1),
  viral_score: z.number().min(0).max(1),
  reasoning: z.string(),
});
export const clipDetectionSchema = z.array(clipDetectionItemSchema);
export type ClipDetectionItem = z.infer<typeof clipDetectionItemSchema>;

export const hookAnalysisSchema = z.object({
  hook_strength: z.number().min(0).max(100),
  recommendation: z.string(),
});

// --- API input schemas (tRPC, §7) ---

export const createProjectInput = z.object({
  r2Key: z.string().min(1),
  filename: z.string().min(1),
  durationMs: z.number().int().positive(),
  sizeBytes: z.number().int().positive(),
});

export const listProjectsInput = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(20),
});

export const stockAssetInput = z.object({
  id: z.string().min(1),
  provider: z.enum(['pexels', 'pixabay', 'user']),
  providerAssetId: z.string().min(1),
  url: z.string().url(),
  thumbnailUrl: z.string().url(),
  durationMs: z.number().int().positive(),
  width: z.number().int().nonnegative().default(0),
  height: z.number().int().nonnegative().default(0),
  tags: z.array(z.string()).default([]),
  description: z.string().default(''),
});

export const brollReplaceInput = z.object({
  clipId: z.string().uuid(),
  insertIndex: z.number().int().nonnegative(),
  asset: stockAssetInput,
});

export const brollSearchInput = z.object({
  query: z.string().min(2),
  durationMs: z.number().int().positive(),
});

export const startRenderInput = z.object({
  clipId: z.string().uuid(),
  format: z.enum(['9:16', '1:1', '16:9']),
  quality: z.enum(['1080p', '4k']).default('1080p'),
  captionPreset: z
    .enum(['hormozi', 'mrbeast', 'podcast', 'cinematic', 'neon', 'minimal'])
    .default('hormozi'),
});

export const createCheckoutInput = z.object({
  plan: z.enum(['creator', 'pro', 'agency']),
});
