import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

const DOWNLOAD_TIMEOUT_MS = 60_000;

function extFromMime(mime: string): string {
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('quicktime')) return 'mov';
  return 'mp4';
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const user = ctx.user;

  const { id } = await params;
  const edit = await prisma.videoEdit.findFirst({ where: { id, userId: user.id } });
  if (!edit) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (edit.status !== 'completed' || !edit.resultUrl) {
    return NextResponse.json({ error: 'edit_not_ready' }, { status: 409 });
  }

  const rangeHeader = req.headers.get('range') ?? undefined;

  let src: Response;
  try {
    src = await fetch(edit.resultUrl, {
      headers: rangeHeader ? { range: rangeHeader } : undefined,
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
  } catch (e) {
    return NextResponse.json(
      { error: 'fetch_failed', detail: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
  if (!src.ok && src.status !== 206) {
    return NextResponse.json({ error: `upstream_${src.status}` }, { status: 502 });
  }

  const mime = src.headers.get('content-type') ?? 'video/mp4';
  const ext = extFromMime(mime);
  const filename = `persona-studio-edit-${edit.template}-${edit.id.slice(0, 6)}.${ext}`;

  const headers: Record<string, string> = {
    'Content-Type': mime,
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'private, max-age=0, no-store',
    'Accept-Ranges': 'bytes',
  };
  const len = src.headers.get('content-length');
  if (len) headers['Content-Length'] = len;
  const cr = src.headers.get('content-range');
  if (cr) headers['Content-Range'] = cr;

  return new NextResponse(src.body, { status: src.status, headers });
}
