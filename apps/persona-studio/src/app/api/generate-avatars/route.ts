import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { chargeTokens, refundTokens, COSTS, InsufficientTokensError } from '@/lib/tokens';
import { avatarQueue } from '@/lib/queue';
import { AVATAR_STYLES, type AvatarStyle } from '@/lib/styles';
import { nicheBySlug } from '@/lib/niches';
import { buildAvatarPrompt } from '@/lib/prompts';

export const runtime = 'nodejs';

const SLOTS = 10;

const Body = z.object({
  uploadId: z.string().min(1),
  mode: z.enum(['default', 'niche', 'custom']).optional(),
  nicheSlug: z.string().min(1).optional(),
  customPrompts: z.array(z.string().min(4).max(1200)).min(1).max(SLOTS).optional(),
});

type AvatarSlot = {
  style: string;      // slug
  styleLabel: string;
  promptUsed: string; // полностью собранный identity-preserving prompt
};

function defaultSlots(): AvatarSlot[] {
  return AVATAR_STYLES.map((s) => ({
    style: s.slug,
    styleLabel: s.label,
    promptUsed: buildAvatarPrompt(s),
  }));
}

function nicheSlots(nicheSlug: string): AvatarSlot[] | null {
  const niche = nicheBySlug(nicheSlug);
  if (!niche) return null;
  return niche.prompts.slice(0, SLOTS).map((p) => {
    const style: AvatarStyle = {
      slug: `${niche.slug}/${p.slug}`,
      label: p.label,
      description: p.description,
      promptStyle: p.promptStyle,
      allowRigidPose: p.allowRigidPose,
    };
    return {
      style: style.slug,
      styleLabel: p.label,
      promptUsed: buildAvatarPrompt(style),
    };
  });
}

function customSlots(prompts: string[]): AvatarSlot[] {
  // Цикличное заполнение SLOTS, чтобы движок генерил полноценный батч.
  const out: AvatarSlot[] = [];
  for (let i = 0; i < SLOTS; i++) {
    const raw = prompts[i % prompts.length].trim();
    const style: AvatarStyle = {
      slug: `custom/${i + 1}`,
      label: `Custom ${i + 1}`,
      description: raw.slice(0, 80),
      promptStyle: raw,
    };
    out.push({
      style: style.slug,
      styleLabel: style.label,
      promptUsed: buildAvatarPrompt(style),
    });
  }
  return out;
}

export async function POST(req: NextRequest) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const user = ctx.user;

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'bad_body' }, { status: 400 });

  const upload = await prisma.upload.findFirst({
    where: { id: parsed.data.uploadId, userId: user.id },
  });
  if (!upload) return NextResponse.json({ error: 'upload_not_found' }, { status: 404 });
  if (upload.status !== 'ready') {
    return NextResponse.json({ error: 'upload_not_ready', status: upload.status }, { status: 409 });
  }

  const mode = parsed.data.mode ?? 'default';
  let slots: AvatarSlot[];
  if (mode === 'niche') {
    if (!parsed.data.nicheSlug) {
      return NextResponse.json({ error: 'niche_slug_required' }, { status: 400 });
    }
    const built = nicheSlots(parsed.data.nicheSlug);
    if (!built) return NextResponse.json({ error: 'unknown_niche' }, { status: 400 });
    slots = built;
  } else if (mode === 'custom') {
    const prompts = (parsed.data.customPrompts ?? []).map((p) => p.trim()).filter(Boolean);
    if (prompts.length === 0) {
      return NextResponse.json({ error: 'custom_prompts_required' }, { status: 400 });
    }
    slots = customSlots(prompts);
  } else {
    slots = defaultSlots();
  }

  try {
    await chargeTokens({
      userId: user.id,
      amount: COSTS.avatarGeneration,
      reason: `avatar-generation:${mode}`,
    });
  } catch (e) {
    if (e instanceof InsufficientTokensError) {
      return NextResponse.json(
        { error: 'insufficient_tokens', have: e.have, need: e.need },
        { status: 402 },
      );
    }
    throw e;
  }

  const generation = await prisma.avatarGeneration.create({
    data: {
      userId: user.id,
      uploadId: upload.id,
      status: 'pending',
      tokensCost: COSTS.avatarGeneration,
      avatars: {
        create: slots.map((s) => ({
          userId: user.id,
          imageUrl: '',
          style: s.style,
          styleLabel: s.styleLabel,
          status: 'pending',
          promptUsed: s.promptUsed,
        })),
      },
    },
    include: { avatars: true },
  });

  try {
    const job = await avatarQueue().add(
      'generate',
      { generationId: generation.id, userId: user.id },
      { jobId: generation.id },
    );
    await prisma.avatarGeneration.update({
      where: { id: generation.id },
      data: { jobId: job.id ?? generation.id },
    });
  } catch (e) {
    await refundTokens({
      userId: user.id,
      amount: COSTS.avatarGeneration,
      reason: 'avatar-generation:enqueue-failed',
      refId: generation.id,
    });
    await prisma.avatarGeneration.update({
      where: { id: generation.id },
      data: { status: 'failed', errorMsg: 'enqueue_failed' },
    });
    return NextResponse.json({ error: 'enqueue_failed' }, { status: 500 });
  }

  return NextResponse.json({
    id: generation.id,
    status: generation.status,
    avatarsPending: generation.avatars.length,
    tokensCharged: COSTS.avatarGeneration,
    mode,
  });
}

export async function GET(req: NextRequest) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const user = ctx.user;

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id_required' }, { status: 400 });

  const generation = await prisma.avatarGeneration.findFirst({
    where: { id, userId: user.id },
    include: { avatars: true },
  });
  if (!generation) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  return NextResponse.json(generation);
}
