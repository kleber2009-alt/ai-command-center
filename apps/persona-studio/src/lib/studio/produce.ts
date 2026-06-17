// Оркестрация PRODUCE (Мастер-ТЗ §4, стадии video → edit → done). Тяжёлые
// стадии переиспользуют существующие воркеры (HeyGen/OmniHuman + Submagic) —
// мы НЕ трогаем их код. Продвижение состояния — poll-driven: каждый
// GET /api/generations/:id зовёт advanceGeneration(), который синхронизирует
// статус связанных VideoGeneration/VideoEdit на Generation.

import { prisma } from '@/lib/prisma';
import { engineConfig, VIDEO_ENGINES, VIDEO_ENGINE_LIST, type VideoEngine } from '@/lib/video-engines';
import { STYLE_TEMPLATE_NAMES } from '@/lib/edit-templates';
import { chargeTokens, refundTokens, InsufficientTokensError, COSTS } from '@/lib/tokens';
import { queueForName, editQueue } from '@/lib/queue';

// Движок воркспейса по умолчанию — OmniHuman 1.5 (Мастер-ТЗ §0.2: аватар +
// липсинк к озвучке ElevenLabs). Если он почему-то выключен — откатываемся на
// первый включённый (HeyGen). Все они inputMode='script' → нужен script +
// voiceId + аватар, что и даёт персона.
export function defaultEngine(): VideoEngine {
  if (VIDEO_ENGINES['omnihuman-1.5']?.enabled) return 'omnihuman-1.5';
  return (VIDEO_ENGINE_LIST[0] as VideoEngine) ?? 'heygen-v5';
}

export const DEFAULT_MONTAGE_TEMPLATE = STYLE_TEMPLATE_NAMES[0] ?? 'Hormozi 1';

export type ProduceError =
  | { code: 'not_found' }
  | { code: 'bad_stage'; stage: string }
  | { code: 'blocked_by_gate' }
  | { code: 'no_script' }
  | { code: 'persona_required' }
  | { code: 'avatar_required' }
  | { code: 'voice_required' }
  | { code: 'insufficient_tokens'; have: number; need: number };

// HTTP-маппинг ошибок продюсинга. Живёт в lib (не в route.ts), т.к. Next.js
// запрещает не-handler экспорты из route-модулей.
export function produceErrorStatus(err: ProduceError): number {
  switch (err.code) {
    case 'not_found':
      return 404;
    case 'insufficient_tokens':
      return 402;
    case 'blocked_by_gate':
    case 'no_script':
    case 'persona_required':
    case 'avatar_required':
    case 'voice_required':
    case 'bad_stage':
      return 409;
    default:
      return 400;
  }
}

/**
 * Стадия «Видео»: из утверждённого сценария создаёт VideoGeneration и ставит
 * в очередь. Возвращает { ok, generation } или { ok:false, error }.
 */
export async function startVideoStage(opts: {
  userId: string;
  generationId: string;
}): Promise<{ ok: true } | { ok: false; error: ProduceError }> {
  const gen = await prisma.generation.findFirst({
    where: { id: opts.generationId, userId: opts.userId },
    include: { brief: { include: { persona: true } } },
  });
  if (!gen) return { ok: false, error: { code: 'not_found' } };
  if (gen.stage !== 'script') return { ok: false, error: { code: 'bad_stage', stage: gen.stage } };
  if (gen.gate === 'block') return { ok: false, error: { code: 'blocked_by_gate' } };
  if (!gen.script) return { ok: false, error: { code: 'no_script' } };

  const persona = gen.brief.persona;
  if (!persona) return { ok: false, error: { code: 'persona_required' } };
  if (!persona.avatarId) return { ok: false, error: { code: 'avatar_required' } };
  if (!persona.voiceId) return { ok: false, error: { code: 'voice_required' } };

  // Аватар должен быть готов.
  const avatar = await prisma.avatar.findFirst({
    where: { id: persona.avatarId, userId: opts.userId },
    select: { id: true, status: true, imageUrl: true },
  });
  if (!avatar || avatar.status !== 'done' || !avatar.imageUrl) {
    return { ok: false, error: { code: 'avatar_required' } };
  }

  const engine = defaultEngine();
  const cfg = engineConfig(engine);

  try {
    await chargeTokens({ userId: opts.userId, amount: cfg.cost, reason: `studio-video:${engine}` });
  } catch (e) {
    if (e instanceof InsufficientTokensError) {
      return { ok: false, error: { code: 'insufficient_tokens', have: e.have, need: e.need } };
    }
    throw e;
  }

  const video = await prisma.videoGeneration.create({
    data: {
      userId: opts.userId,
      avatarId: persona.avatarId,
      engine,
      script: gen.script,
      voiceId: persona.voiceId,
      language: gen.brief.lang,
      aspect: '9:16',
      quality: '2k',
      subtitles: true,
      heygenVersion: cfg.heygenVersion ?? 'V',
      status: 'pending',
      tokensCost: cfg.cost,
    },
  });

  try {
    await queueForName(cfg.queueName).add('generate', { videoId: video.id, userId: opts.userId }, { jobId: video.id });
  } catch {
    await refundTokens({ userId: opts.userId, amount: cfg.cost, reason: `studio-video:${engine}:enqueue-failed`, refId: video.id });
    await prisma.videoGeneration.update({ where: { id: video.id }, data: { status: 'failed', errorMsg: 'enqueue_failed' } });
    return { ok: false, error: { code: 'not_found' } };
  }

  await prisma.generation.update({
    where: { id: gen.id },
    data: {
      videoGenerationId: video.id,
      stage: 'video',
      status: 'processing',
      costCredits: { increment: cfg.cost },
    },
  });
  return { ok: true };
}

/**
 * Стадия «Монтаж» (опц.): из готового VideoGeneration создаёт VideoEdit.
 */
export async function startMontageStage(opts: {
  userId: string;
  generationId: string;
  template?: string;
}): Promise<{ ok: true } | { ok: false; error: ProduceError }> {
  const gen = await prisma.generation.findFirst({
    where: { id: opts.generationId, userId: opts.userId },
    include: { videoGeneration: { select: { id: true, status: true, videoUrl: true } } },
  });
  if (!gen) return { ok: false, error: { code: 'not_found' } };
  if (gen.stage !== 'video' || gen.status !== 'completed') {
    return { ok: false, error: { code: 'bad_stage', stage: `${gen.stage}/${gen.status}` } };
  }
  const vg = gen.videoGeneration;
  if (!vg || vg.status !== 'completed' || !vg.videoUrl) {
    return { ok: false, error: { code: 'bad_stage', stage: 'video_not_ready' } };
  }

  const cost = COSTS.submagicEdit;
  try {
    await chargeTokens({ userId: opts.userId, amount: cost, reason: 'studio-montage' });
  } catch (e) {
    if (e instanceof InsufficientTokensError) {
      return { ok: false, error: { code: 'insufficient_tokens', have: e.have, need: e.need } };
    }
    throw e;
  }

  const edit = await prisma.videoEdit.create({
    data: {
      userId: opts.userId,
      videoGenerationId: vg.id,
      template: opts.template || DEFAULT_MONTAGE_TEMPLATE,
      subtitlesEnabled: true,
      subtitleLanguage: 'ru',
      status: 'pending',
      tokensCost: cost,
    },
  });

  try {
    await editQueue().add('edit', { editId: edit.id, userId: opts.userId }, { jobId: edit.id });
  } catch {
    await refundTokens({ userId: opts.userId, amount: cost, reason: 'studio-montage:enqueue-failed', refId: edit.id });
    await prisma.videoEdit.update({ where: { id: edit.id }, data: { status: 'failed', errorMsg: 'enqueue_failed' } });
    return { ok: false, error: { code: 'not_found' } };
  }

  await prisma.generation.update({
    where: { id: gen.id },
    data: { videoEditId: edit.id, stage: 'edit', status: 'processing', costCredits: { increment: cost } },
  });
  return { ok: true };
}

/**
 * Финал без монтажа: видео становится итогом (finalUrl).
 */
export async function finalizeWithoutMontage(opts: { userId: string; generationId: string }) {
  const gen = await prisma.generation.findFirst({
    where: { id: opts.generationId, userId: opts.userId },
    include: { videoGeneration: { select: { status: true, videoUrl: true } } },
  });
  if (!gen) return { ok: false as const, error: { code: 'not_found' as const } };
  if (gen.stage !== 'video' || gen.videoGeneration?.status !== 'completed' || !gen.videoGeneration.videoUrl) {
    return { ok: false as const, error: { code: 'bad_stage' as const, stage: gen.stage } };
  }
  await prisma.generation.update({
    where: { id: gen.id },
    data: { finalUrl: gen.videoGeneration.videoUrl, stage: 'done', status: 'completed' },
  });
  return { ok: true as const };
}

/**
 * Poll-driven продвижение: синхронизирует статус связанных VideoGeneration/
 * VideoEdit на Generation. Идемпотентно. Зовётся из GET /api/generations/:id.
 */
export async function advanceGeneration(opts: { userId: string; generationId: string }): Promise<void> {
  const gen = await prisma.generation.findFirst({
    where: { id: opts.generationId, userId: opts.userId },
    include: {
      videoGeneration: { select: { status: true, videoUrl: true, errorMsg: true } },
      videoEdit: { select: { status: true, resultUrl: true, errorMsg: true } },
    },
  });
  if (!gen) return;

  if (gen.stage === 'video' && gen.status === 'processing' && gen.videoGeneration) {
    const vg = gen.videoGeneration;
    if (vg.status === 'completed' && vg.videoUrl) {
      await prisma.generation.update({ where: { id: gen.id }, data: { status: 'completed' } });
    } else if (vg.status === 'failed') {
      await prisma.generation.update({
        where: { id: gen.id },
        data: { stage: 'error', status: 'failed', errorMsg: vg.errorMsg ?? 'video_failed' },
      });
    }
    return;
  }

  if (gen.stage === 'edit' && gen.status === 'processing' && gen.videoEdit) {
    const ve = gen.videoEdit;
    if (ve.status === 'completed' && ve.resultUrl) {
      await prisma.generation.update({
        where: { id: gen.id },
        data: { finalUrl: ve.resultUrl, stage: 'done', status: 'completed' },
      });
    } else if (ve.status === 'failed') {
      // Видео осталось — откатываем стадию на video/completed, монтаж можно повторить.
      await prisma.generation.update({
        where: { id: gen.id },
        data: { stage: 'video', status: 'completed', errorMsg: ve.errorMsg ?? 'montage_failed' },
      });
    }
  }
}
