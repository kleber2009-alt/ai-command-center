import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

const DOWNLOAD_TIMEOUT_MS = 30_000;

function extFromMime(mime: string): string {
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  return 'jpg';
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const user = ctx.user;

  const { id } = await params;
  const cover = await prisma.cover.findFirst({ where: { id, userId: user.id } });
  if (!cover) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (cover.status !== 'completed' || !cover.imageUrl) {
    return NextResponse.json({ error: 'cover_not_ready' }, { status: 409 });
  }

  let src: Response;
  try {
    src = await fetch(cover.imageUrl, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  } catch (e) {
    return NextResponse.json(
      { error: 'fetch_failed', detail: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
  if (!src.ok) {
    return NextResponse.json({ error: `upstream_${src.status}` }, { status: 502 });
  }

  const mime = src.headers.get('content-type') ?? 'image/jpeg';
  const ext = extFromMime(mime);
  const filename = `persona-studio-cover-${cover.style}-${cover.id.slice(0, 6)}.${ext}`;

  return new NextResponse(src.body, {
    status: 200,
    headers: {
      'Content-Type': mime,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, max-age=0, no-store',
    },
  });
}
