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

/** Vision tagging output for a library asset (§4.4.3). */
export const assetTaggingSchema = z.object({
  description: z.string().default(''),
  tags: z.array(z.string()).default([]),
  scene_type: z
    .enum(['indoor', 'outdoor', 'abstract', 'product', 'person', 'screen'])
    .catch('abstract'),
  mood: z.array(z.string()).default([]),
  dominant_colors: z.array(z.string()).default([]),
  has_faces: z.boolean().default(false),
  has_text_overlay: z.boolean().default(false),
  motion_intensity: z.enum(['static', 'slow', 'medium', 'fast']).catch('static'),
  usability_score: z.number().min(0).max(100).default(50),
});
export type AssetTaggingRaw = z.infer<typeof assetTaggingSchema>;

export const brollMode = z.enum(['auto_stock', 'my_library', 'hybrid']);

// --- API input schemas (tRPC, §7) ---

export const createProjectInput = z.object({
  r2Key: z.string().min(1),
  filename: z.string().min(1),
  durationMs: z.number().int().positive(),
  sizeBytes: z.number().int().positive(),
  brollMode: brollMode.default('auto_stock'),
  libraryCollectionId: z.string().uuid().optional(),
});

export const setBrollModeInput = z.object({
  projectId: z.string().uuid(),
  brollMode,
  libraryCollectionId: z.string().uuid().nullish(),
});

export const listProjectsInput = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(20),
});

export const stockAssetInput = z.object({
  id: z.string().min(1),
  provider: z.enum(['pexels', 'pixabay', 'user_library']),
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

export const brollSearchLibraryInput = z.object({
  query: z.string().min(2),
  durationMs: z.number().int().positive().optional(),
  collectionId: z.string().uuid().optional(),
});

// --- Library API input schemas (§7) ---

export const createCollectionInput = z.object({ name: z.string().min(1).max(80) });
export const renameCollectionInput = z.object({
  collectionId: z.string().uuid(),
  name: z.string().min(1).max(80),
});
export const collectionIdInput = z.object({ collectionId: z.string().uuid() });
export const assetIdInput = z.object({ assetId: z.string().uuid() });

export const libraryUploadInitInput = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  collectionId: z.string().uuid().optional(),
});

export const libraryUploadCompleteInput = z.object({
  r2Key: z.string().min(1),
  filename: z.string().min(1),
  contentType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  fileHash: z.string().min(8),
  collectionId: z.string().uuid().optional(),
});

export const listAssetsInput = z.object({
  collectionId: z.string().uuid().optional(),
  type: z.enum(['video', 'image']).optional(),
  tags: z.array(z.string()).optional(),
  search: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(60).default(40),
});

export const updateAssetTagsInput = z.object({
  assetId: z.string().uuid(),
  userTags: z.array(z.string().min(1).max(40)).max(40),
});

export const moveAssetInput = z.object({
  assetId: z.string().uuid(),
  collectionId: z.string().uuid(),
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
