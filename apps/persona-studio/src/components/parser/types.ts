// Shared types for parser UI components. Serializable (Prisma rows → JSON).

export type ParserConfigSerialized = {
  id: string;
  userId: string;
  nicheDescription: string | null;
  competitors: string[];
  hashtags: string[];
  postedWithinDays: number;
  perTargetLimit: number;
  minPlays: number;
  minLikes: number;
  minComments: number;
  reelsCount: number;
  carouselsCount: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ParserRunSerialized = {
  id: string;
  userId: string;
  status: string;
  postsScanned: number;
  reelsFound: number;
  carouselsFound: number;
  claudeSummary: string | null;
  errorMsg: string | null;
  startedAt: string;
  completedAt: string | null;
};

export type ParserItemSerialized = {
  id: string;
  userId: string;
  runId: string;
  url: string;
  shortcode: string | null;
  kind: string;
  owner: string | null;
  thumbnailUrl: string | null;
  caption: string | null;
  plays: number;
  likes: number;
  comments: number;
  ageHours: number;
  velocityScore: number;
  fitScore: number | null;
  fitWhy: string | null;
  status: string;
  videoGenerationId: string | null;
  createdAt: string;
};
