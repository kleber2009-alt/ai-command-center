// GET /api/research/media — post-level витрина над ResearchReel (ТЗ «Медиа»).
//
// Поиск контента в нише по ключевым словам + фильтры (тип / период /
// виральность / блогер / избранное), сортировки, keyset-пагинация и счётчик
// «Найдено» (exact при сужающих фильтрах, estimated при широких).
//
// Расхождение с буквой ТЗ: ТЗ написано под отдельную схему `spy.reels` с
// Postgres FTS/pgvector. Persona Studio де-факто хранит посты в Prisma-модели
// `ResearchReel` (см. apps/persona-studio/CLAUDE.md → «Принятые отклонения»),
// поэтому `q` ищем через `caption ILIKE` (Prisma `contains`), а виральность —
// по уже посчитанному полю `virality` (views / медиана автора). Семантические
// «похожие» обслуживаются существующим Qdrant-стеком в reel-detail, не здесь.

import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import type { ResearchReelView } from '@/components/research/types';

export const runtime = 'nodejs';

type Sort = 'xn' | 'views' | 'likes' | 'recent';
type TypeFilter = 'all' | 'reel' | 'post' | 'carousel';

const SORTS: Sort[] = ['xn', 'views', 'likes', 'recent'];
const TYPES: TypeFilter[] = ['all', 'reel', 'post', 'carousel'];
const PERIODS: Record<string, number> = { '1': 1, '7': 7, '30': 30 };

function decodeCursor(raw: string | null): string | null {
  if (!raw) return null;
  try {
    return Buffer.from(raw, 'base64').toString('utf8') || null;
  } catch {
    return null;
  }
}

function encodeCursor(id: string): string {
  return Buffer.from(id, 'utf8').toString('base64');
}

// Разбор строки поиска: "фразы в кавычках", -исключения, остальные слова.
// Возвращает позитивные термы (каждый должен встретиться) и исключения.
function parseQuery(raw: string): { positives: string[]; excluded: string[] } {
  const positives: string[] = [];
  const excluded: string[] = [];
  // Сначала вынимаем "фразы" целиком.
  const rest = raw.replace(/"([^"]+)"/g, (_, phrase: string) => {
    const p = phrase.trim();
    if (p) positives.push(p);
    return ' ';
  });
  for (const tok of rest.split(/\s+/).filter(Boolean)) {
    if (tok.startsWith('-') && tok.length > 1) excluded.push(tok.slice(1));
    else positives.push(tok);
  }
  return { positives, excluded };
}

// Один позитивный терм матчится по caption (substring, регистронезависимо)
// ИЛИ по hashtags / nicheTags (точный элемент массива, в нижнем регистре).
function termMatch(t: string): Prisma.ResearchReelWhereInput {
  const lower = t.toLowerCase();
  return {
    OR: [
      { caption: { contains: t, mode: 'insensitive' } },
      { hashtags: { has: lower } },
      { nicheTags: { has: lower } },
    ],
  };
}

// Сортировка → составной orderBy (sortField, id) под keyset-пагинацию.
function orderByFor(sort: Sort): Prisma.ResearchReelOrderByWithRelationInput[] {
  switch (sort) {
    case 'views':
      return [{ views: 'desc' }, { id: 'desc' }];
    case 'likes':
      return [{ likes: 'desc' }, { id: 'desc' }];
    case 'recent':
      return [{ postedAt: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }];
    case 'xn':
    default:
      return [{ virality: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }];
  }
}

export async function GET(req: NextRequest) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const userId = ctx.user.id;

  const sp = new URL(req.url).searchParams;
  const q = (sp.get('q') ?? '').trim();
  const sort: Sort = SORTS.includes(sp.get('sort') as Sort) ? (sp.get('sort') as Sort) : 'xn';
  const type: TypeFilter = TYPES.includes(sp.get('type') as TypeFilter)
    ? (sp.get('type') as TypeFilter)
    : 'all';
  const period = sp.get('period') ?? 'all';
  const viral = Number(sp.get('viral') ?? '0') || 0;
  const blogger = (sp.get('blogger') ?? 'all').replace(/^@/, '').trim().toLowerCase();
  const fav = sp.get('fav') === 'true';
  const limit = Math.min(60, Math.max(24, Number(sp.get('limit') ?? '24') || 24));
  const cursorId = decodeCursor(sp.get('cursor'));

  // ── WHERE ──
  const where: Prisma.ResearchReelWhereInput = {};
  if (type !== 'all') where.postType = type === 'post' ? 'image' : type;
  if (period in PERIODS) {
    where.postedAt = { gte: new Date(Date.now() - PERIODS[period] * 86_400_000) };
  }
  if (viral > 0) where.virality = { gte: viral };
  if (q) {
    const { positives, excluded } = parseQuery(q);
    const and: Prisma.ResearchReelWhereInput[] = [];
    for (const t of positives) and.push(termMatch(t));
    for (const x of excluded) {
      and.push({ NOT: { caption: { contains: x, mode: 'insensitive' } } });
    }
    if (and.length) where.AND = and;
  }
  if (blogger && blogger !== 'all') where.author = { is: { username: blogger } };
  if (fav) where.favorites = { some: { userId } };

  // Сужающие фильтры → точный COUNT; иначе оценка (на масштабе persona-studio
  // точный count всё равно дёшев, но контракт ответа сохраняем по ТЗ §3.2).
  const narrowing = Boolean(q) || viral >= 1 || (blogger && blogger !== 'all') || period in PERIODS || fav;

  const [rows, count] = await Promise.all([
    prisma.researchReel.findMany({
      where,
      orderBy: orderByFor(sort),
      take: limit,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      include: {
        author: {
          select: { id: true, username: true, followers: true, medianViews: true, avatarUrl: true },
        },
        favorites: { where: { userId }, select: { id: true } },
      },
    }),
    prisma.researchReel.count({ where }),
  ]);

  const items: Array<ResearchReelView & { isFav: boolean }> = rows.map((r) => ({
    id: r.id,
    url: r.url,
    thumbnailUrl: r.thumbnailUrl,
    caption: r.caption,
    views: r.views,
    likes: r.likes,
    comments: r.comments,
    shares: r.shares,
    durationSec: r.durationSec,
    postType: r.postType,
    language: r.language,
    postedAt: r.postedAt ? r.postedAt.toISOString() : null,
    virality: r.virality,
    engagementRate: r.engagementRate,
    velocity: r.velocity,
    viralScore: r.viralScore,
    reach: r.reach,
    author: {
      id: r.author.id,
      username: r.author.username,
      followers: r.author.followers,
      medianViews: r.author.medianViews,
      avatarUrl: r.author.avatarUrl,
    },
    isFav: r.favorites.length > 0,
  }));

  const nextCursor = items.length === limit ? encodeCursor(items[items.length - 1].id) : null;

  return NextResponse.json({
    ok: true,
    items,
    nextCursor,
    countMode: narrowing ? 'exact' : 'estimated',
    count,
  });
}
