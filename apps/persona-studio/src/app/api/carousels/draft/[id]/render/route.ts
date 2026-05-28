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

import { isValidCoverType, type CoverType } from '@/lib/carousel/prompts';

type SlideJson = {
  title: string;
  body: string;
  accent?: string;
  image?: string;
  coverType?: CoverType;
  imageMode?: 'composite' | 'replace';
};

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

  // ?onlyIndex=N — рендерить только один слайд (0-based). Если задан,
  // обновляем imageUrls по позиции, не трогая остальные PNG'и. Полезно
  // когда юзер поправил текст одного слайда и не хочет ждать полный run.
  const onlyIndexRaw = req.nextUrl.searchParams.get('onlyIndex');
  const onlyIndex = onlyIndexRaw != null ? Number(onlyIndexRaw) : null;
  if (onlyIndexRaw != null && (!Number.isFinite(onlyIndex) || onlyIndex! < 0)) {
    return NextResponse.json({ error: 'bad_only_index' }, { status: 400 });
  }

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
  if (onlyIndex != null && onlyIndex >= slides.length) {
    return NextResponse.json({ error: 'only_index_out_of_range', message: `Нет слайда ${onlyIndex + 1}.` }, { status: 400 });
  }
  // Валидация: при single-render — только этот слайд; при full — все.
  const indicesToValidate = onlyIndex != null ? [onlyIndex] : slides.map((_, i) => i);
  for (const i of indicesToValidate) {
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
    // Аватар нужен только если cover-слайд попадает в render (либо full,
    // либо onlyIndex === 0). Иначе экономим fetch на ~200KB.
    const needsAvatar = onlyIndex == null || onlyIndex === 0;
    const avatarUri =
      needsAvatar && draft.coverAvatar?.imageUrl
        ? await avatarToDataUri(draft.coverAvatar.imageUrl)
        : null;

    const style = isValidStyle(draft.style) ? draft.style : DEFAULT_STYLE;

    const renderOne = async (i: number): Promise<string> => {
      const s = slides[i];
      const kind = slideKindFor(i, slides.length);
      const coverType = isValidCoverType(s.coverType) ? s.coverType : undefined;

      // ── REPLACE mode: AI-картинка САМА = финал слайда. Скипаем satori.
      // Требование: imageMode='replace' + есть валидный s.image. Иначе
      // деградируем до satori-composite, чтобы не выкинуть пользователю
      // ошибку при недогенерированной картинке.
      if (s.imageMode === 'replace' && s.image) {
        // Перезаливаем bytes в наш S3-ключ слайда чтобы IG/Caddy видели
        // стабильный URL (kie CDN URL'ы протекают через ?v= но не lifecycle).
        const fetched = await fetch(s.image, {
          signal: AbortSignal.timeout(60_000),
        });
        if (!fetched.ok) {
          throw new Error(`replace_fetch_failed: HTTP ${fetched.status} for ${s.image}`);
        }
        const buf = Buffer.from(await fetched.arrayBuffer());
        const contentType = fetched.headers.get('content-type') || 'image/jpeg';
        const ext = (contentType.split('/')[1] || 'jpg').replace(/[^a-z0-9]/gi, '').slice(0, 4) || 'jpg';
        const key = `carousels/${user.id}/${draft.id}/${String(i + 1).padStart(2, '0')}.${ext}`;
        const baseUrl = await uploadBuffer({
          key,
          body: buf,
          contentType,
          cacheControl: 'public, max-age=2592000',
        });
        return `${baseUrl}?v=${Date.now()}`;
      }

      // ── COMPOSITE mode (default): satori как раньше.
      // Cover-слайд: для type=avatar (или undefined) хочется аватар-фон.
      // Для object/ui — фотка-скриншот из s.image (если есть) идёт как
      // mediaDataUri внутрь shared cover-type рендера. Split — без медиа.
      // Reveal/CTA — старое поведение: media из s.image внизу карточкой.
      const wantsAvatarBg =
        kind === 'cover' && (!coverType || coverType === 'avatar');
      const mediaSource =
        kind !== 'cover'
          ? s.image
          : coverType === 'object' || coverType === 'ui'
            ? s.image
            : undefined;
      const mediaUri = mediaSource ? await avatarToDataUri(mediaSource) : null;
      const png = await renderSlide({
        index: i + 1,
        total: slides.length,
        kind,
        title: s.title.trim(),
        body: s.body.trim(),
        style,
        avatarDataUri: wantsAvatarBg ? avatarUri || undefined : undefined,
        mediaDataUri: mediaUri || undefined,
        coverType,
      });
      // ?v=<timestamp> чтобы IG/Caddy не закэшировали старую версию по тому
      // же S3-ключу. Ключ остаётся стабильным (один PNG на позицию).
      const key = `carousels/${user.id}/${draft.id}/${String(i + 1).padStart(2, '0')}.png`;
      const baseUrl = await uploadBuffer({
        key,
        body: png,
        contentType: 'image/png',
        cacheControl: 'public, max-age=2592000',
      });
      return `${baseUrl}?v=${Date.now()}`;
    };

    let newUrls: string[];
    if (onlyIndex != null) {
      // Берём существующие, обновляем одну позицию. Если массив короче
      // (например, частично-рендеренное состояние) — расширим.
      const current = Array.isArray(draft.imageUrls) ? [...draft.imageUrls] : [];
      while (current.length < slides.length) current.push('');
      current[onlyIndex] = await renderOne(onlyIndex);
      newUrls = current;
    } else {
      newUrls = [];
      for (let i = 0; i < slides.length; i++) {
        newUrls.push(await renderOne(i));
      }
    }

    const updated = await prisma.carouselDraft.update({
      where: { id },
      data: {
        status: 'rendered',
        imageUrls: newUrls,
        completedAt: new Date(),
        errorMsg: null,
      },
    });

    return NextResponse.json({
      ok: true,
      draftId: updated.id,
      imageUrls: newUrls,
      onlyIndex,
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
