import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PageHero } from '@/components/shell/page-hero';
import { BlogClient } from '@/components/blog/blog-client';
import { loadBlogState, normalizeHandle } from '@/lib/blog/items';
import { isApifyConfigured } from '@/lib/parser/apify';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Мой блог — Persona Studio' };

export default async function BlogPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');

  const state = await loadBlogState(user.id);
  // Prefill: saved handle → connected Instagram account name.
  let handle = state.handle;
  if (!handle) {
    const ig = await prisma.socialAccount.findFirst({
      where: { userId: user.id, platform: 'instagram' },
      select: { displayName: true },
      orderBy: { createdAt: 'asc' },
    });
    handle = normalizeHandle(ig?.displayName) || null;
  }
  const best = state.items.filter((i) => i.best).length;

  return (
    <div className="grid gap-8">
      <PageHero
        icon="trends"
        eyebrow="КОНВЕЙЕР · МОЙ БЛОГ"
        title={
          <>
            Лучшее из твоего блога — <span className="italic text-gold">в новый круг.</span>
          </>
        }
        description="Рилсы и карусели твоего Instagram, отсортированные по твоим же медианам: рилсы — по просмотрам, вовлечению и репостам, карусели — по комментариям (кодовые слова), репостам и лайкам. Выбери пост — и уникализируй его."
        meta={
          <>
            <div className="label">лучших</div>
            <div className="text-[32px] font-extrabold tabular-nums tracking-[-0.02em] text-gold leading-none">{best}</div>
          </>
        }
      />
      <BlogClient initial={{ ...state, handle }} apifyConfigured={isApifyConfigured()} />
    </div>
  );
}
