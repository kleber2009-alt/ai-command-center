// Shared types между server (route.ts) и client (research-client.tsx).
// Все сериализованные — Date → string, ровно как уходит в JSON-ответе.

export type ResearchReelView = {
  id: string;
  url: string;
  thumbnailUrl: string | null;
  caption: string | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  postedAt: string | null;
  virality: number | null;
  engagementRate: number | null;
  velocity: number | null;
  viralScore: number | null;
  reach: number | null;
  author: {
    id: string;
    username: string;
    followers: number | null;
    medianViews: number | null;
    avatarUrl: string | null;
  };
};

export type SortField = 'viral_score' | 'views' | 'virality' | 'engagement' | 'date';
export type Period = 'all' | '7d' | '30d' | '90d';

export type ResearchFilters = {
  sortBy: SortField;
  period: Period;
};

export type SearchResponse = {
  ok: true;
  cacheHit: boolean;
  niche: string;
  keywords: string[];
  hashtags: string[];
  summary: string | null;
  reels: ResearchReelView[];
  stats?: {
    scraped: number;
    candidates: number;
    indexed: number;
    authors: number;
    durationMs: number;
  };
  errors?: string[];
};

export type SearchError = { ok: false; error: string; message?: string };
