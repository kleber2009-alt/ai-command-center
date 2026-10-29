// GET /api/blog/items?kind=reel|carousel&sort=score|recent|comments|views|shares|likes
// «Мой блог» feed: the owner's own posts ranked against his own medians
// (see src/lib/blog/rank.ts), plus the saved handle and the last run.

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { BLOG_SORTS, loadBlogState, type BlogSort } from '@/lib/blog/items';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const kindRaw = req.nextUrl.searchParams.get('kind');
  const kind = kindRaw === 'reel' || kindRaw === 'carousel' ? kindRaw : undefined;
  const sortRaw = req.nextUrl.searchParams.get('sort') as BlogSort | null;
  const sort = sortRaw && BLOG_SORTS.includes(sortRaw) ? sortRaw : 'score';

  const state = await loadBlogState(ctx.user.id, { kind, sort });
  return NextResponse.json(state);
}
