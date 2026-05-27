// POST /api/carousels/draft/:id/render — отрисовать ВСЕ слайды черновика
// в PNG (satori + resvg), залить в S3, записать imageUrls обратно в БД.
//
// Шаги:
//  1. Достаём черновик + аватар (для cover слайда)
//  2. Если есть аватар — fetch его S3-объект как base64 data URI
//  3. Для каждого слайда: kind ∈ {cover, reveal, cta} → renderSlide → Buffer
//  4. uploadBuffer в S3 по ключу carousels/<userId>/<draftId>/<idx>.png
//  5. Update CarouselDraft { status:'rendered', imageUrls, completedAt }
//
// Синхронный — обычно 3–8 сек на 6 слайдов. runtime=nodejs обязателен
// (satori, resvg, prisma, S3 SDK — всё это server-only).

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { renderSlide, type SlideKind } from '@/lib/carousel/render-slide';
import { isValidStyle, DEFAULT_STYLE } from '@/lib/carousel/styles';
import { uploadBuffer } from '@/lib/storage';
import { s3, BUCKET } from '@/lib/storage';
import { GetObjectCommand } from '@aws-sdk/client-s3';

export const runtime = 'nodejs';
export const maxDuration = 120;

type SlideJson = { title: string; body: string; accent?: string };

const slideKindFor = (index: number, total: number): SlideKind => {
  if (index === 0) return 'cover';
  if (index === total - 1) return 'cta';
  return 'reveal';
};

/**
 * Скачать аватар из S3 и вернуть его как data URI (base64). Satori не
 * фетчит произвольные URL надёжно — лучше прокачать байты заранее.
 */
async function avatarToDataUri(imageUrlOrKey: string): Promise<string | null> {
  try {
    // imageUrl может быть и полным URL и S3 key. Различаем по протоколу.
    let bytes: Buffer;
    let contentType = 'image/jpeg';
    if (/^https?:\/\//.test(imageUrlOrKey)) {
      const res = await fetch(imageUrlOrKey, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) return null;
      contentType = res.headers.get('content-type') || contentType;
      bytes = Buffer.from(await res.arrayBuffer());
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const obj = await (s3 as any).send(new GetObjectCommand({ Bucket: BUCKET, Key: imageUrlOrKey }));
      contentType = obj.ContentType || contentType;
      const stream = obj.Body as ReadableStream<Uint8Array> | null;
      if (!stream) return null;
      const reader = stream.getReader();
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }
      bytes = Buffer.concat(chunks);
    }
    return `data:${contentType};base64,${bytes.toString('base64')}`;
  } catch (e) {
    console.warn('[carousel/render] avatar fetch failed:', (e as Error).message);
    return null;
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await getCurrentUserOrApiKey(req);
  if (!auth) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const user = auth.user;
  const { id } = await ctx.params;

  const draft = await prisma.carouselDraft.findFirst({
    where: { id, userId: user.id },
    include: {
      coverAvatar: { select: { id: true, imageUrl: true } },
    },
  });
  if (!draft) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const slides = Array.isArray(draft.slides) ? (draft.slides as unknown as SlideJson[]) : [];
  if (slides.length < 2) {
    return NextResponse.json({ error: 'not_enough_slides', message: 'Нужно минимум 2 слайда.' }, { status: 400 });
  }
  // Валидация — нельзя рендерить пустые
  for (let i = 0; i < slides.length; i++) {
    const s = slides[i];
    if (!s?.title?.trim() || !s?.body?.trim()) {
      return NextResponse.json(
        { error: 'empty_slide', message: `Слайд ${i + 1} не заполнен (title/body).` },
        { status: 400 },
      );
    }
  }

  await prisma.carouselDraft.update({
    where: { id },
    data: { status: 'rendering', errorMsg: null },
  });

  try {
    const avatarUri = draft.coverAvatar?.imageUrl
      ? await avatarToDataUri(draft.coverAvatar.imageUrl)
      : null;

    const style = isValidStyle(draft.style) ? draft.style : DEFAULT_STYLE;

    // Последовательно рендерим — satori CPU-heavy, параллельность
    // в одном Node-процессе ничего не ускорит и риск OOM выше.
    const urls: string[] = [];
    for (let i = 0; i < slides.length; i++) {
      const s = slides[i];
      const kind = slideKindFor(i, slides.length);
      const png = await renderSlide({
        index: i + 1,
        total: slides.length,
        kind,
        title: s.title.trim(),
        body: s.body.trim(),
        style,
        avatarDataUri: kind === 'cover' ? avatarUri || undefined : undefined,
      });
      const key = `carousels/${user.id}/${draft.id}/${String(i + 1).padStart(2, '0')}.png`;
      const url = await uploadBuffer({
        key,
        body: png,
        contentType: 'image/png',
        cacheControl: 'public, max-age=2592000',
      });
      urls.push(url);
    }

    const updated = await prisma.carouselDraft.update({
      where: { id },
      data: {
        status: 'rendered',
        imageUrls: urls,
        completedAt: new Date(),
        errorMsg: null,
      },
    });

    return NextResponse.json({
      ok: true,
      draftId: updated.id,
      imageUrls: urls,
      status: updated.status,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[carousel/render] failed', e);
    await prisma.carouselDraft.update({
      where: { id },
      data: { status: 'failed', errorMsg: msg.slice(0, 1000) },
    });
    return NextResponse.json({ error: 'render_failed', message: msg }, { status: 500 });
  }
}
