// POST /api/pipelines/:id/video — shoot the script with a look and a voice from
// the owner's HeyGen account. Creates a VideoGeneration (no local Avatar, no
// photo upload) on the heygen-video queue and links it. Same token contract as
// POST /api/videos (charge → enqueue, refund on enqueue/worker failure).
// Re-shooting resets the montage and the post of this branch.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { enforceRateLimit } from '@/lib/ratelimit';
import { prisma } from '@/lib/prisma';
import { refreshAppSettings } from '@/lib/app-settings';
import { findHeygenAvatar, findHeygenVoice } from '@/lib/heygen-account';
import { HeygenError } from '@/lib/heygen';
import { checkSimilarity } from '@/lib/studio/similarity';
import { findPipeline, pipelineView, startLookVideo } from '@/lib/pipeline/server';

export const runtime = 'nodejs';

const Body = z.object({
  heygenAvatarId: z.string().min(1).max(100),
  voiceId: z.string().min(1).max(100),
  script: z.string().trim().min(5).max(1500).optional(),
  aspect: z.enum(['9:16', '1:1', '16:9']).optional().default('9:16'),
  engine: z.enum(['avatar_v', 'avatar_iv']).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getCurrentUserOrApiKey(req);
    if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
    const limited = await enforceRateLimit(ctx, 'generate');
    if (limited) return limited;
    const userId = ctx.user.id;
    const { id } = await params;

    const p = await findPipeline(userId, id);
    if (!p) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    if (p.kind !== 'reel') return NextResponse.json({ error: 'bad_stage' }, { status: 409 });

    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: 'bad_body', issues: parsed.error.issues }, { status: 400 });
    }
    const data = parsed.data;

    if (p.videoGenerationId) {
      const v = await prisma.videoGeneration.findFirst({ where: { id: p.videoGenerationId }, select: { status: true } });
      if (v && (v.status === 'pending' || v.status === 'processing')) {
        return NextResponse.json({ error: 'generation_running' }, { status: 409 });
      }
    }

    const script = (data.script ?? p.script ?? '').trim();
    if (script.length < 5) return NextResponse.json({ error: 'no_script' }, { status: 400 });

    // The gate is re-checked when the text differs from the one already gated.
    let gate = p.gate;
    let similarity = p.similarity;
    if (script !== (p.script ?? '').trim() || !gate) {
      const sim = await checkSimilarity({ generatedText: script, sourceText: p.sourceText });
      gate = sim.gate;
      similarity = sim.similarity;
    }
    if (gate === 'block') {
      await prisma.pipeline.update({ where: { id: p.id }, data: { script, gate, similarity } });
      return NextResponse.json({ error: 'blocked_by_gate' }, { status: 409 });
    }

    await refreshAppSettings();
    const [look, voice] = await Promise.all([findHeygenAvatar(data.heygenAvatarId), findHeygenVoice(data.voiceId)]);
    if (!look) return NextResponse.json({ error: 'avatar_not_found', message: 'Аватар не найден в аккаунте HeyGen — обновите список.' }, { status: 404 });
    if (!look.engine || look.engine === 'avatar_iii') {
      return NextResponse.json({ error: 'avatar_not_ready', message: 'Этот аватар HeyGen не поддерживает Avatar IV/V — выберите другой.' }, { status: 409 });
    }
    const engine = data.engine && look.engines.includes(data.engine) ? data.engine : look.engine;

    const started = await startLookVideo({
      userId,
      look: { id: look.id, type: look.type, name: look.name, image: look.previewImage, engine },
      voiceId: data.voiceId,
      script,
      aspect: data.aspect,
      language: voice?.lang || 'ru',
    });
    if (!started.ok) return NextResponse.json(started.body, { status: started.status });

    const row = await prisma.pipeline.update({
      where: { id: p.id },
      data: {
        script,
        gate,
        similarity,
        heygenAvatarId: look.id,
        heygenAvatarName: look.name,
        heygenAvatarImage: look.previewImage,
        voiceId: data.voiceId,
        voiceName: voice?.name ?? p.voiceName,
        videoGenerationId: started.videoId,
        montageId: null,
        montageStyle: null,
        scheduledPostId: null,
        errorMsg: null,
      },
    });
    return NextResponse.json({ ok: true, videoId: started.videoId, cost: started.cost, pipeline: await pipelineView(row) });
  } catch (e) {
    if (e instanceof HeygenError && e.code === 'MISSING_KEY') {
      return NextResponse.json({ error: 'provider_not_configured' }, { status: 503 });
    }
    console.error('[api/pipelines/video] unhandled', e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
