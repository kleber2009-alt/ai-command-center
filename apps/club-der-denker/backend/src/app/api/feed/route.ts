import { NextRequest } from 'next/server';
import { serviceClient } from '@/lib/supabase/server';
import { normalizeLocale } from '@/lib/i18n';
import { ok, fail } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { evaluateCommunityAccess } from '@/lib/engine/community';

/**
 * GET /api/feed?locale=de&category=<slug>
 * Read-only community feed (spec 3.4). Access is gated by the community engine:
 * the 28-day window, an active subscription, or the final-level lock. When
 * locked, returns showPaywall so the client renders the subscription window
 * instead of posts.
 */
export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok) return fail('unauthorized', 401);

  const locale = normalizeLocale(req.nextUrl.searchParams.get('locale'));
  const category = req.nextUrl.searchParams.get('category');
  const db = serviceClient();

  const { data: user } = await db
    .from('cdd_users')
    .select('level, community_access_until')
    .eq('id', auth.userId)
    .single();
  if (!user) return fail('user not found', 404);

  // Active subscription expiry (latest active community_subscription).
  const { data: sub } = await db
    .from('cdd_purchases')
    .select('expires_at')
    .eq('user_id', auth.userId)
    .eq('product', 'community_subscription')
    .eq('status', 'active')
    .order('expires_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Purchase date = community_access_until - 28 days, stored at purchase time.
  const purchasedAt = user.community_access_until
    ? new Date(new Date(user.community_access_until).getTime() - 28 * 86_400_000)
    : null;

  const access = evaluateCommunityAccess({
    purchasedAt,
    subscriptionActiveUntil: sub?.expires_at ? new Date(sub.expires_at) : null,
    level: user.level,
  });

  if (!access.canRead) {
    return ok({ locked: true, showPaywall: access.showPaywall, reason: access.reason, posts: [] });
  }

  let query = db
    .from('cdd_feed_posts')
    .select('id, category_id, media_kind, media_url, published_at, cdd_feed_post_translations(title, body, locale)')
    .not('published_at', 'is', null)
    .lte('published_at', new Date().toISOString())
    .order('published_at', { ascending: false })
    .limit(50);

  if (category) {
    const { data: cat } = await db.from('cdd_feed_categories').select('id').eq('slug', category).maybeSingle();
    if (cat) query = query.eq('category_id', cat.id);
  }

  const { data, error } = await query;
  if (error) return fail(error.message, 500);

  const posts = (data ?? []).map((row: any) => {
    const tr = row.cdd_feed_post_translations?.find((t: any) => t.locale === locale)
      ?? row.cdd_feed_post_translations?.[0];
    return {
      id: row.id,
      categoryId: row.category_id,
      mediaKind: row.media_kind,
      mediaUrl: row.media_url,
      publishedAt: row.published_at,
      title: tr?.title ?? '',
      body: tr?.body ?? '',
    };
  });

  return ok({ locked: false, showPaywall: false, posts });
}
