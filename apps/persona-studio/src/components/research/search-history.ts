// История поисков Research — персистится в localStorage, чтобы выдача не
// пропадала при обновлении страницы. Храним весь SearchResponse, чтобы
// открыть прошлую выдачу мгновенно, без повторного скрейпа.

import type { Period, SearchResponse, SortField } from './types';

const STORAGE_KEY = 'persona:research:history:v1';
const MAX_ENTRIES = 20;

export type SearchHistoryEntry = {
  id: string;
  niche: string;
  at: number; // epoch ms
  period: Period;
  sortBy: SortField;
  count: number; // сколько рилсов в выдаче
  cacheHit: boolean;
  // Пороги, с которыми был сделан поиск (для восстановления и показа).
  minViews?: number;
  minLikes?: number;
  minComments?: number;
  minShares?: number;
  response: SearchResponse;
};

function isBrowser() {
  return typeof window !== 'undefined' && !!window.localStorage;
}

export function loadHistory(): SearchHistoryEntry[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is SearchHistoryEntry =>
        e && typeof e.id === 'string' && typeof e.niche === 'string' && e.response,
    );
  } catch {
    return [];
  }
}

function persist(entries: SearchHistoryEntry[]): SearchHistoryEntry[] {
  if (!isBrowser()) return entries;
  let list = entries.slice(0, MAX_ENTRIES);
  // localStorage может переполниться (quota) — сбрасываем самые старые записи,
  // пока запись не пройдёт.
  while (list.length > 0) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      return list;
    } catch {
      list = list.slice(0, list.length - 1);
    }
  }
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* noop */
  }
  return [];
}

// Добавляет/обновляет запись. Дедуп по (niche+period+sortBy) — повторный
// поиск той же ниши обновляет существующую запись и поднимает её наверх.
export function addHistoryEntry(
  params: {
    niche: string;
    period: Period;
    sortBy: SortField;
    minViews?: number;
    minLikes?: number;
    minComments?: number;
    minShares?: number;
    at: number;
    response: SearchResponse;
  },
): SearchHistoryEntry[] {
  const { niche, period, sortBy, minViews, minLikes, minComments, minShares, at, response } =
    params;
  const entry: SearchHistoryEntry = {
    id: `${at}-${Math.round(at % 100000)}`,
    niche,
    at,
    period,
    sortBy,
    count: response.reels.length,
    cacheHit: response.cacheHit,
    minViews,
    minLikes,
    minComments,
    minShares,
    response,
  };
  const existing = loadHistory().filter(
    (e) =>
      !(
        e.niche.toLowerCase() === niche.toLowerCase() &&
        e.period === period &&
        e.sortBy === sortBy
      ),
  );
  return persist([entry, ...existing]);
}

export function removeHistoryEntry(id: string): SearchHistoryEntry[] {
  return persist(loadHistory().filter((e) => e.id !== id));
}

export function clearHistory(): SearchHistoryEntry[] {
  if (isBrowser()) {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* noop */
    }
  }
  return [];
}
