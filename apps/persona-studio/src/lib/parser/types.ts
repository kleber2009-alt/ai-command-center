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
  engagement: number;
  viewsPerHour: number;
  engPerHour: number;
  engRatio: number;
  velocityScore: number;
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
