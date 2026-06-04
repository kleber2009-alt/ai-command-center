// Поисковый кэш. Ключ = (нормализованная ниша, sha1 от фильтров).
// TTL — несколько часов: ниже не имеет смысла (повторный поиск той же
// нишы в течение нескольких часов почти гарантированно даст тот же
// корпус), выше — теряем актуальность («залетевшие сейчас» перестают
// быть свежими).

import { createHash } from 'node:crypto';
import { prisma } from '@/lib/prisma';

const DEFAULT_TTL_HOURS = 6;

export type ResearchFilters = {
  // период публикации
  period?: 'all' | '7d' | '30d' | '90d';
  language?: string;
  postType?: 'reel' | 'image' | 'carousel';
  durationBand?: 'short' | 'medium' | 'long' | null;
  // Пороги вхождения в корпус (задаются пользователем ДО поиска).
  // Меняют какие рилсы попадают в выборку → обязаны быть в filtersHash,
  // иначе разные пороги отдадут один и тот же кэш.
  minViews?: number;
  minLikes?: number;
  minComments?: number;
  minShares?: number;
  // сортировка влияет на отдачу, но НЕ на корпус — поэтому в filtersHash
  // её можно НЕ включать. Включаем только то, что меняет какие рилсы
  // попадают в выборку. Сортировка применяется поверх кэша.
};

export function normalizeNiche(niche: string): string {
  return niche
    .toLowerCase()
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

export function hashFilters(filters: ResearchFilters): string {
  // Стабильная сериализация: сортируем ключи, иначе {a:1,b:2} и {b:2,a:1}
  // дадут разные хеши.
  const stable = Object.keys(filters).sort().reduce<Record<string, unknown>>((acc, k) => {
    const v = (filters as Record<string, unknown>)[k];
    if (v !== undefined && v !== null && v !== '') acc[k] = v;
    return acc;
  }, {});
  return createHash('sha1').update(JSON.stringify(stable)).digest('hex').slice(0, 16);
}

export async function getCachedSearch(niche: string, filters: ResearchFilters) {
  const cached = await prisma.researchSearchCache.findUnique({
    where: {
      niche_filtersHash: {
        niche: normalizeNiche(niche),
        filtersHash: hashFilters(filters),
      },
    },
  });
  if (!cached) return null;
  if (cached.expiresAt.getTime() < Date.now()) return null;
  return cached;
}

export async function putCachedSearch(args: {
  niche: string;
  filters: ResearchFilters;
  resultReelIds: string[];
  summary?: string | null;
  expansion?: { keywords: string[]; hashtags: string[] } | null;
  ttlHours?: number;
}) {
  const ttl = (args.ttlHours || DEFAULT_TTL_HOURS) * 3_600_000;
  const niche = normalizeNiche(args.niche);
  const filtersHash = hashFilters(args.filters);
  await prisma.researchSearchCache.upsert({
    where: { niche_filtersHash: { niche, filtersHash } },
    create: {
      niche,
      filtersHash,
      resultReelIds: args.resultReelIds,
      summary: args.summary ?? null,
      expansion: args.expansion ? args.expansion : undefined,
      expiresAt: new Date(Date.now() + ttl),
    },
    update: {
      resultReelIds: args.resultReelIds,
      summary: args.summary ?? null,
      expansion: args.expansion ? args.expansion : undefined,
      expiresAt: new Date(Date.now() + ttl),
    },
  });
}
