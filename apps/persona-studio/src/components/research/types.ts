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
  durationSec: number | null;
  postType: string;
  language: string | null;
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
export type LanguageFilter = 'all' | 'ru' | 'en' | 'other';
export type PostTypeFilter = 'all' | 'reel' | 'image' | 'carousel';
export type DurationBand = 'all' | 'short' | 'medium' | 'long';

export type ResearchFilters = {
  sortBy: SortField;
  period: Period;
  language: LanguageFilter;
  postType: PostTypeFilter;
  duration: DurationBand;
};

export type NicheSummaryView = {
  summary: string;
  dominant_hooks: string[];
  dominant_formats: string[];
  dominant_topics: string[];
  duration_band: string;
  outlier_examples: Array<{ reel_id: string; why: string }>;
};

export type SearchResponse = {
  ok: true;
  cacheHit: boolean;
  niche: string;
  keywords: string[];
  hashtags: string[];
  summary: string | null;
  nicheSummary?: NicheSummaryView | null;
  reels: ResearchReelView[];
  stats?: {
    scraped: number;
    candidates: number;
    indexed: number;
    authors: number;
    durationMs: number;
    byKind?: {
      reels: number;
      carousels: number;
      images: number;
      unknown: number;
      skipped: number;
    };
  };
  errors?: string[];
};

export type SearchError = { ok: false; error: string; message?: string };

// Превью/аватары Instagram CDN отдаются с CORP same-origin → браузер не
// встраивает их с нашего домена. Проксируем такие URL через свой сервер.
// Не-IG ссылки (если вдруг будут) отдаём как есть.
export function igProxy(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (!/(?:\.cdninstagram\.com|\.fbcdn\.net)/i.test(url)) return url;
  return `/api/research/thumb?u=${encodeURIComponent(url)}`;
}
