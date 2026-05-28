// Slide image generation orchestrator (AI Carousel Engine v2).
//
// Связывает prompts.ts → kie (Nano Banana 2 / Flux Kontext) → S3 → запись
// результата в CarouselDraft.slides[index].image. Используется воркером
// (src/workers/slide-image.worker.ts) и потенциально sync-обёрткой.
//
// Поддерживает три режима генерации:
//   - 'hero-avatar'       — Flux Kontext: identity-preserving аватар-фон
//                          для AVATAR cover. Требует draft.coverAvatar.
//   - 'object'            — Nano Banana 2: text-only, генерирует объект
//                          (продукт / 3D-иконка) для OBJECT cover.
//   - 'ui'                — Nano Banana 2: text-only, генерирует UI-скрин
//                          (дашборд / приложение) для UI cover.
//   - 'slide-media'       — Nano Banana 2: editorial visual для reveal/cta
//                          слайдов. Без референса.
//
// На входе мы знаем draftId + slideIndex; всё остальное вытягиваем из БД.

import { prisma } from '@/lib/prisma';
import {
  generateImage,
  generateImageWithFlux,
  toKieReference,
  type KieAspect,
  KieError,
} from '@/lib/kie';
import { keyFor, uploadBuffer } from '@/lib/storage';
import {
  buildSlideImagePrompt,
  buildHeroAvatarPrompt,
  isValidCoverType,
} from './prompts';
import { DEFAULT_STYLE, isValidStyle, type CarouselStyleId } from './styles';

export type SlideImageMode = 'hero-avatar' | 'object' | 'ui' | 'slide-media';

export type SlideImageGenResult = {
  ok: true;
  imageUrl: string;
  taskId: string;
  creditsConsumed?: number;
  prompt: string;
};

export type SlideImageGenError = {
  ok: false;
  code: string;
  message: string;
};

type SlideJson = {
  title: string;
  body: string;
  accent?: string;
  image?: string;
  coverType?: string;
  imageStatus?: 'pending' | 'done' | 'failed';
  imageError?: string;
  imagePromptUsed?: string;
};

const ASPECT_4_5: KieAspect = '3:4'; // kie не поддерживает 4:5 напрямую — берём ближайший портрет

/**
 * Главный orchestrator. Принимает draftId + slideIndex + mode, делает всю
 * работу: builds prompt, dispatches kie, downloads bytes, uploads to S3,
 * patches CarouselDraft.slides[index].image + imageStatus.
 *
 * Возвращает либо success с URL'ом, либо failure с кодом и сообщением.
 * Никогда не бросает — БД всегда останется в консистентном состоянии.
 *
 * NOTE: Эту функцию НЕ дёргают тогда, когда нужно сгенерировать всю
 * карусель — для этого есть batch-режим в воркере (TBD).
 */
export async function generateSlideImage(args: {
  draftId: string;
  userId: string;
  slideIndex: number;
  mode: SlideImageMode;
}): Promise<SlideImageGenResult | SlideImageGenError> {
  const draft = await prisma.carouselDraft.findFirst({
    where: { id: args.draftId, userId: args.userId },
    select: {
      id: true,
      style: true,
      slides: true,
      coverAvatar: { select: { imageUrl: true } },
      parserItem: { select: { caption: true } },
    },
  });
  if (!draft) return fail('draft_not_found', `Draft ${args.draftId} not found`);

  const slides = Array.isArray(draft.slides) ? (draft.slides as unknown as SlideJson[]) : [];
  if (args.slideIndex < 0 || args.slideIndex >= slides.length) {
    return fail('index_out_of_range', `Нет слайда ${args.slideIndex + 1}`);
  }
  const slide = slides[args.slideIndex];
  if (!slide?.title?.trim() || !slide?.body?.trim()) {
    return fail('empty_slide', `Слайд ${args.slideIndex + 1} пуст`);
  }

  const styleId: CarouselStyleId = isValidStyle(draft.style)
    ? (draft.style as CarouselStyleId)
    : DEFAULT_STYLE;

  const isCover = args.slideIndex === 0;
  const isCTA = args.slideIndex === slides.length - 1;
  const kind: 'cover' | 'reveal' | 'cta' = isCover ? 'cover' : isCTA ? 'cta' : 'reveal';
  const coverType = isValidCoverType(slide.coverType) ? slide.coverType : 'avatar';
  const topic =
    draft.parserItem?.caption?.slice(0, 800) ||
    slides
      .map((s) => `${s.title} — ${s.body}`)
      .join(' / ')
      .slice(0, 800) ||
    slide.title;

  // ── Build prompt + dispatch ──────────────────────────────────────────
  let prompt: string;
  let taskBytes: { bytes: Buffer; mime: string; taskId: string; creditsConsumed?: number };

  try {
    if (args.mode === 'hero-avatar') {
      // Identity-preserving avatar для AVATAR cover. Требует coverAvatar.imageUrl.
      const avatarUrl = draft.coverAvatar?.imageUrl;
      if (!avatarUrl) {
        return fail('no_avatar', 'У черновика не выбран аватар — выберите cover-аватар.');
      }
      prompt = buildHeroAvatarPrompt({ styleId, topic });
      // Flux Kontext: identity-preserving, image-to-image.
      const inputRef = await toKieReference({
        fileUrl: avatarUrl,
        mime: 'image/jpeg',
      });
      const out = await generateImageWithFlux({
        prompt,
        inputImageUrl: inputRef,
        aspectRatio: '3:4',
        outputFormat: 'jpeg',
      });
      taskBytes = out;
    } else {
      // Text-only Nano Banana 2 (через playground).
      prompt = buildSlideImagePrompt({
        styleId,
        kind,
        coverType:
          isCover && args.mode !== 'slide-media'
            ? (args.mode === 'object'
                ? 'object'
                : args.mode === 'ui'
                  ? 'ui'
                  : 'avatar')
            : undefined,
        title: slide.title,
        body: slide.body,
        topic,
      });
      const out = await generateImage({
        prompt,
        aspectRatio: ASPECT_4_5,
        resolution: '1K',
        outputFormat: 'jpg',
      });
      taskBytes = out;
    }
  } catch (e) {
    const code = e instanceof KieError ? e.code : 'kie_failed';
    const message = e instanceof Error ? e.message : String(e);
    await patchSlideStatus(args.draftId, args.slideIndex, {
      imageStatus: 'failed',
      imageError: `${code}: ${message}`.slice(0, 400),
    });
    return fail(code, message);
  }

  // ── Upload to S3 ─────────────────────────────────────────────────────
  let imageUrl: string;
  try {
    const ext = taskBytes.mime.split('/')[1] ?? 'jpg';
    const key = keyFor('cover', args.userId, ext); // переиспользуем cover-namespace
    imageUrl = await uploadBuffer({
      key,
      body: taskBytes.bytes,
      contentType: taskBytes.mime,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await patchSlideStatus(args.draftId, args.slideIndex, {
      imageStatus: 'failed',
      imageError: `s3_upload_failed: ${message}`.slice(0, 400),
    });
    return fail('s3_upload_failed', message);
  }

  // ── Patch DB ─────────────────────────────────────────────────────────
  try {
    await patchSlideStatus(args.draftId, args.slideIndex, {
      image: imageUrl,
      imageStatus: 'done',
      imageError: undefined,
      imagePromptUsed: prompt.slice(0, 4000),
    });
  } catch (e) {
    // S3-объект уже залит — это не критично; вернём ошибку с URL'ом.
    const message = e instanceof Error ? e.message : String(e);
    return fail('db_patch_failed', message);
  }

  return {
    ok: true,
    imageUrl,
    taskId: taskBytes.taskId,
    creditsConsumed: taskBytes.creditsConsumed,
    prompt,
  };
}

/**
 * Атомарно обновить один слайд в CarouselDraft.slides[index]. Делаем через
 * read-modify-write, чтобы не наступать на параллельные правки.
 *
 * Если slides пуст или index за пределами — patch игнорируется (silent).
 */
export async function patchSlideStatus(
  draftId: string,
  slideIndex: number,
  patch: Partial<SlideJson>,
): Promise<void> {
  const draft = await prisma.carouselDraft.findUnique({
    where: { id: draftId },
    select: { slides: true },
  });
  if (!draft) return;
  const slides = Array.isArray(draft.slides) ? (draft.slides as unknown as SlideJson[]) : [];
  if (slideIndex < 0 || slideIndex >= slides.length) return;
  const next = slides.slice();
  const current = next[slideIndex];
  // Удаляем undefined-ключи для чистоты JSON в БД.
  const merged: SlideJson = { ...current };
  for (const [k, v] of Object.entries(patch) as Array<[keyof SlideJson, unknown]>) {
    if (v === undefined) {
      delete merged[k];
    } else {
      // @ts-expect-error — assign по индексу
      merged[k] = v;
    }
  }
  next[slideIndex] = merged;
  await prisma.carouselDraft.update({
    where: { id: draftId },
    data: { slides: next as unknown as object },
  });
}

function fail(code: string, message: string): SlideImageGenError {
  return { ok: false, code, message };
}
