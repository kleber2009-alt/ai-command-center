// Shared types for carousel UI. Serializable (Prisma JSON → JS).

import type { CoverType } from '@/lib/carousel/prompts';
export type { CoverType } from '@/lib/carousel/prompts';

export type SlideImageStatus = 'pending' | 'done' | 'failed';

/**
 * Как использовать `image` при финальном рендере карусели:
 *   - 'composite' (default) — satori рисует typography поверх, image идёт
 *     как mockup-карточка / cover-фон (текущее поведение).
 *   - 'replace'             — пропускаем satori, image сам по себе и есть
 *     финальный PNG слайда. Подходит когда Nano Banana 2 нарисовала готовую
 *     editorial-композицию с типографикой.
 */
export type SlideImageMode = 'composite' | 'replace';

export type SlideShape = {
  title: string;
  body: string;
  accent?: string;
  // Опциональный URL фото/скриншота, который будет нарисован как
  // mockup-карточка внизу слайда (см. render-slide.ts). Загружается
  // через POST /api/carousels/upload-media или генерируется AI через
  // POST /api/carousels/draft/[id]/slide-image.
  image?: string;
  // Тип обложки — применяется только для slide[0]. Остальные слайды
  // игнорируют. Управляет layout-маршрутом в render-slide.ts.
  coverType?: CoverType;
  // AI image generation tracking (Nano Banana / Flux Kontext через kie).
  imageStatus?: SlideImageStatus;
  imageError?: string;
  // Сохранённый prompt (debug + аудит).
  imagePromptUsed?: string;
  // composite | replace — см. SlideImageMode выше.
  imageMode?: SlideImageMode;
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
  style: string;
  status: string;
  imageUrls: string[];
  createdAt: string;
  updatedAt: string;
  coverAvatar?: { id: string; styleLabel: string; imageUrl: string } | null;
  parserItem?: { id: string; url: string; owner: string | null; fitScore: number | null } | null;
};
