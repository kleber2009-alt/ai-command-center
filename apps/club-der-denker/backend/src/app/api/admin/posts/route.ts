import { NextRequest } from 'next/server';
import { serviceClient } from '@/lib/supabase/server';
import { adminGuard } from '@/lib/admin-auth';
import { ok, fail } from '@/lib/http';
import { isLocale } from '@/lib/i18n';
import { z } from 'zod';

/**
 * Admin community-feed CRUD (spec 6): create / edit / delete posts with
 * language, media and audience category. Admin-authored only.
 *
 *  GET    /api/admin/posts            -> all posts (drafts + published) + translations
 *  POST   /api/admin/posts            -> create or update a post (+ one translation)
 *  DELETE /api/admin/posts?id=<uuid>  -> delete a post
 */
export async function GET() {
  const denied = adminGuard();
  if (denied) return denied;

  const db = serviceClient();
  const { data, error } = await db
    .from('cdd_feed_posts')
    .select('id, category_id, media_kind, media_url, published_at, cdd_feed_post_translations(locale, title, body)')
    .order('created_at', { ascending: false });
  if (error) return fail(error.message, 500);
  return ok({ posts: data ?? [] });
}

const Body = z.object({
  id: z.string().uuid().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  mediaKind: z.enum(['text', 'image', 'video']).default('text'),
  mediaUrl: z.string().url().nullable().optional(),
  publish: z.boolean().optional(),
  translation: z.object({ locale: z.string(), title: z.string(), body: z.string() }),
});

export async function POST(req: NextRequest) {
  const denied = adminGuard();
  if (denied) return denied;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail('invalid body', 422);
  if (!isLocale(parsed.data.translation.locale)) return fail('unsupported locale', 422);
  const db = serviceClient();

  const postRow: Record<string, unknown> = {
    category_id: parsed.data.categoryId ?? null,
    media_kind: parsed.data.mediaKind,
    media_url: parsed.data.mediaUrl ?? null,
  };
  if (parsed.data.publish !== undefined) {
    postRow.published_at = parsed.data.publish ? new Date().toISOString() : null;
  }

  let postId = parsed.data.id;
  if (postId) {
    const { error } = await db.from('cdd_feed_posts').update(postRow).eq('id', postId);
    if (error) return fail(error.message, 500);
  } else {
    const { data, error } = await db.from('cdd_feed_posts').insert(postRow).select('id').single();
    if (error) return fail(error.message, 500);
    postId = data.id;
  }

  const { error: tErr } = await db.from('cdd_feed_post_translations').upsert(
    {
      post_id: postId,
      locale: parsed.data.translation.locale,
      title: parsed.data.translation.title,
      body: parsed.data.translation.body,
    },
    { onConflict: 'post_id,locale' },
  );
  if (tErr) return fail(tErr.message, 500);

  return ok({ id: postId });
}

export async function DELETE(req: NextRequest) {
  const denied = adminGuard();
  if (denied) return denied;

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return fail('id required', 422);

  const db = serviceClient();
  const { error } = await db.from('cdd_feed_posts').delete().eq('id', id);
  if (error) return fail(error.message, 500);
  return ok({ deleted: true });
}
