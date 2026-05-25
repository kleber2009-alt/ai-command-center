// Shared types for carousel UI. Serializable (Prisma JSON → JS).

export type SlideShape = {
  title: string;
  body: string;
  accent?: string;
};

export type CarouselAvatarOption = {
  id: string;
  styleLabel: string;
  imageUrl: string;
};

export type CarouselDraftSerialized = {
  id: string;
  parserItemId: string | null;
  coverAvatarId: string | null;
  slidesCount: number;
  slides: SlideShape[];
  status: string;
  imageUrls: string[];
  createdAt: string;
  updatedAt: string;
  coverAvatar?: { id: string; styleLabel: string; imageUrl: string } | null;
  parserItem?: { id: string; url: string; owner: string | null; fitScore: number | null } | null;
};
