// GET /api/research/export?format=csv|json&ids=<csv> — экспорт ResearchReel'ов
// в CSV или JSON. ids опционально — если не задано, отдаём последний
// результат поиска юзера из ResearchSearch.

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

const CSV_COLUMNS: Array<{ key: string; label: string }> = [
  { key: 'rank', label: '#' },
  { key: 'author', label: 'author' },
  { key: 'url', label: 'url' },
  { key: 'caption', label: 'caption' },
  { key: 'views', label: 'views' },
  { key: 'likes', label: 'likes' },
  { key: 'comments', label: 'comments' },
  { key: 'shares', label: 'shares' },
  { key: 'virality', label: 'virality_x' },
  { key: 'engagement', label: 'engagement_pct' },
  { key: 'viralScore', label: 'viral_score' },
  { key: 'medianViews', label: 'author_median_views' },
  { key: 'followers', label: 'author_followers' },
  { key: 'postedAt', label: 'posted_at' },
];

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(req: NextRequest) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const url = new URL(req.url);
  const format = (url.searchParams.get('format') || 'csv').toLowerCase();
  const idsParam = url.searchParams.get('ids');

  let reelIds: string[];
  if (idsParam) {
    reelIds = idsParam.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 500);
  } else {
    const last = await prisma.researchSearch.findFirst({
      where: { userId: ctx.user.id },
      orderBy: { createdAt: 'desc' },
    });
    reelIds = last?.resultReelIds ?? [];
  }
  if (reelIds.length === 0) {
    return NextResponse.json({ error: 'no_results', message: 'Нет результатов для экспорта.' }, { status: 404 });
  }

  const reels = await prisma.researchReel.findMany({
    where: { id: { in: reelIds } },
    include: { author: { select: { username: true, followers: true, medianViews: true } } },
  });
  const byId = new Map(reels.map((r) => [r.id, r]));
  const ordered = reelIds.map((id) => byId.get(id)).filter((r): r is NonNullable<typeof r> => Boolean(r));

  if (format === 'json') {
    return NextResponse.json({
      ok: true,
      reels: ordered.map((r) => ({
        id: r.id,
        url: r.url,
        author: r.author.username,
        followers: r.author.followers,
        medianViews: r.author.medianViews,
        caption: r.caption,
        views: r.views,
        likes: r.likes,
        comments: r.comments,
        shares: r.shares,
        virality: r.virality,
        engagementRate: r.engagementRate,
        viralScore: r.viralScore,
        postedAt: r.postedAt?.toISOString() ?? null,
      })),
    });
  }

  // CSV
  const header = CSV_COLUMNS.map((c) => c.label).join(',');
  const rows = ordered.map((r, i) => {
    const cells = {
      rank: i + 1,
      author: '@' + r.author.username,
      url: r.url,
      caption: (r.caption || '').replace(/\n/g, ' ').slice(0, 500),
      views: r.views,
      likes: r.likes,
      comments: r.comments,
      shares: r.shares,
      virality: r.virality?.toFixed(2) ?? '',
      engagement: r.engagementRate?.toFixed(2) ?? '',
      viralScore: r.viralScore?.toFixed(1) ?? '',
      medianViews: r.author.medianViews ?? '',
      followers: r.author.followers ?? '',
      postedAt: r.postedAt?.toISOString() ?? '',
    };
    return CSV_COLUMNS.map((c) => csvEscape(cells[c.key as keyof typeof cells])).join(',');
  });
  const csv = '﻿' + [header, ...rows].join('\n');
  const filename = `research-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
