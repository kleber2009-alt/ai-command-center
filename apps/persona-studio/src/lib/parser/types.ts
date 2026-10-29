// Общие типы для парсера. ScoredPost — то, что отдаёт scoring.ts и
// принимает claude-rate. Соответствует полям ParserItem в Prisma.

export type PostKind = 'reel' | 'carousel' | 'image' | 'unknown';

export type ScoredPost = {
  url: string;
  shortcode: string | null;
  kind: PostKind;
  owner: string | null;
  thumbnailUrl: string | null;
  caption: string;
  postedAtMs: number | null;
  ageHours: number;
  plays: number;
  likes: number;
  comments: number;
  shares: number;          // reshareCount / shareCount / sharesCount от Apify (0 если поле отсутствует)
  durationSec: number | null; // videoDuration от Apify (null если поле отсутствует)
  engagement: number;
  viewsPerHour: number;
  engPerHour: number;
  engRatio: number;
  velocityScore: number;
  /** Untruncated caption (`caption` is capped at 400 chars for rating prompts). */
  fullCaption: string;
  /** Reel mp4 from the actor (Instagram CDN, expires). null for non-reels. */
  videoUrl: string | null;
  /** Carousel slide image URLs in order (Instagram CDN, expire). [] for non-carousels. */
  slideImages: string[];
};

export type ClaudeRating = {
  score: number;
  why: string;
};

export type RateResult = {
  reels: (ClaudeRating | null)[];
  carousels: (ClaudeRating | null)[];
  summary: string | null;
};
