// Core domain types shared across web, workers, and the broll engine.
// These are framework-agnostic on purpose: the broll package depends on
// these types but never on Next.js or the DB.

export type ExportFormat = '9:16' | '1:1' | '16:9';
export type RenderQuality = '1080p' | '4k';

export type BRollProvider = 'pexels' | 'pixabay' | 'user';
export type OverlayStyle = 'fullscreen' | 'picture-in-picture' | 'split';
export type BRollStyle = 'literal' | 'metaphorical';

/** A single word with word-level timing, as returned by the transcriber. */
export interface TranscriptWord {
  word: string;
  startMs: number;
  endMs: number;
  speaker?: number;
  confidence?: number;
}

export interface Transcript {
  language: string;
  speakersCount: number;
  words: TranscriptWord[];
  /** Optional provider-supplied paragraph boundaries (ms). */
  paragraphs?: { startMs: number; endMs: number; text: string }[];
}

/**
 * A semantic "thought" block produced by step 1 of the B-roll engine
 * (transcript segmentation, §4.2).
 */
export interface TranscriptSegment {
  startMs: number;
  endMs: number;
  text: string;
  wordCount: number;
}

/** The B-roll insert plan item — the engine's primary output (§4.1). */
export interface BRollInsert {
  startMs: number;
  endMs: number;
  query: string;
  source: BRollProvider;
  assetId: string;
  assetUrl: string;
  thumbnailUrl: string;
  confidence: number; // 0..1
  overlayStyle: OverlayStyle;
  reason: string;
}

export interface BRollPlan {
  clipId: string;
  version: number;
  inserts: BRollInsert[];
}

/** LLM verdict for one transcript segment (step 2, §4.2 / prompt §4.3). */
export interface BRollCandidate {
  segment: TranscriptSegment;
  shouldInsert: boolean;
  reasoning: string;
  keywords: string[];
  visualConcept: string;
  style: BRollStyle;
  suggestedDurationMs: number;
  insertAtMs: number;
}

/** A stock asset returned by Pexels / Pixabay (step 3, §4.2). */
export interface StockAsset {
  id: string;
  provider: BRollProvider;
  providerAssetId: string;
  url: string;
  thumbnailUrl: string;
  durationMs: number;
  width: number;
  height: number;
  tags: string[];
  description: string;
}

/** A ranked asset with its similarity to the query concept (step 4, §4.2). */
export interface RankedAsset {
  asset: StockAsset;
  similarity: number; // cosine, 0..1
}

export interface Clip {
  id: string;
  projectId: string;
  startMs: number;
  endMs: number;
  hookScore: number; // 0..1
  viralScore: number; // 0..1
  retentionScore: number; // 0..1
  emotionalScore: number; // 0..1
  title: string;
  reasoning: string;
}

/** Caption styling presets (§5.4). */
export type CaptionPreset = 'hormozi' | 'mrbeast' | 'podcast' | 'cinematic' | 'neon' | 'minimal';

/** A silence span to be removed at render time (§5.5). */
export interface SilenceSpan {
  startMs: number;
  endMs: number;
}
