import { NextRequest, NextResponse } from 'next/server';
import { handleUpdate, isConfigured } from '@/lib/tg-bot';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const WEBHOOK_SECRET = process.env.TG_WEBHOOK_SECRET;

export async function POST(req: NextRequest) {
  if (!isConfigured()) {
    return NextResponse.json({ error: 'bot_not_configured' }, { status: 503 });
  }
  if (WEBHOOK_SECRET) {
    const incoming = req.headers.get('x-telegram-bot-api-secret-token');
    if (incoming !== WEBHOOK_SECRET) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
  }

  let update: Record<string, unknown>;
  try {
    update = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  // Fire-and-don't-block — Telegram retries on non-200, so we always
  // respond fast; errors are logged inside handleUpdate.
  handleUpdate(update).catch((e) => {
    console.error('[tg-webhook] handler error:', (e as Error).message);
  });

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ ok: true, configured: isConfigured() });
}
