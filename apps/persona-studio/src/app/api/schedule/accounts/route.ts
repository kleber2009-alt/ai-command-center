// GET  /api/schedule/accounts — list connected channels (no secrets leaked)
// POST /api/schedule/accounts — connect a Telegram channel by chatId
//
// Instagram connect goes through OAuth (accounts/instagram/start + callback),
// not this endpoint. Here we only handle Telegram: validate the chat exists and
// that our bot is an admin, then upsert the SocialAccount.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getChat, assertBotIsAdmin } from '@/lib/publish/telegram-channel';
import { TelegramError } from '@/lib/telegram-tma';

export const runtime = 'nodejs';

const Body = z.object({
  platform: z.literal('telegram'),
  chatId: z.string().min(2).max(128), // -100… или @channelusername
});

export async function GET(req: NextRequest) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const accounts = await prisma.socialAccount.findMany({
    where: { userId: ctx.user.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      platform: true,
      displayName: true,
      externalId: true,
      status: true,
      tokenExpiresAt: true,
      createdAt: true,
    },
  });
  return NextResponse.json({ accounts });
}

export async function POST(req: NextRequest) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad_body', issues: parsed.error.issues }, { status: 400 });
  }
  const { chatId } = parsed.data;

  try {
    const chat = await getChat(chatId);
    await assertBotIsAdmin(chatId);

    const displayName = chat.title
      ? chat.title
      : chat.username
        ? `@${chat.username}`
        : `chat ${chat.id}`;
    const externalId = String(chat.id);

    const account = await prisma.socialAccount.upsert({
      where: {
        userId_platform_externalId: { userId: ctx.user.id, platform: 'telegram', externalId },
      },
      create: {
        userId: ctx.user.id,
        platform: 'telegram',
        displayName,
        externalId,
        status: 'active',
        meta: { channelTitle: chat.title ?? null, username: chat.username ?? null },
      },
      update: { displayName, status: 'active' },
      select: { id: true, platform: true, displayName: true, externalId: true, status: true },
    });

    return NextResponse.json({ ok: true, account }, { status: 201 });
  } catch (e) {
    if (e instanceof TelegramError) {
      const status = e.code === 'BOT_NOT_ADMIN' ? 409 : 400;
      return NextResponse.json({ error: e.code, message: e.message }, { status });
    }
    return NextResponse.json({ error: 'connect_failed', message: String(e) }, { status: 500 });
  }
}
