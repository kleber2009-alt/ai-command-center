import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserOrApiKey } from '@/lib/auth';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { prisma } from '@/lib/prisma';
import { BUCKET, keyFromPublicUrl, s3 } from '@/lib/storage';

export const runtime = 'nodejs';

const DOWNLOAD_TIMEOUT_MS = 60_000;

// Прокси готового монтажа с Content-Disposition: attachment (как /api/edits/[id]/download).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCurrentUserOrApiKey(req);
  if (!ctx) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const { id } = await params;
  const m = await prisma.montage.findFirst({ where: { id, userId: ctx.user.id } });
  if (!m) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (m.status !== 'completed' || !m.resultUrl) {
    return NextResponse.json({ error: 'montage_not_ready' }, { status: 409 });
  }

  const rangeHeader = req.headers.get('range') ?? undefined;
  const filename = `persona-montage-${m.style}-${m.id.slice(0, 6)}.mp4`;

  // Свой файл — читаем через S3-клиент (публичный URL может быть недоступен
  // изнутри контейнера web).
  const key = keyFromPublicUrl(m.resultUrl);
  if (key) {
    const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key, Range: rangeHeader }));
    const headers: Record<string, string> = {
      'Content-Type': obj.ContentType ?? 'video/mp4',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, max-age=0, no-store',
      'Accept-Ranges': 'bytes',
    };
    if (obj.ContentLength != null) headers['Content-Length'] = String(obj.ContentLength);
    if (obj.ContentRange) headers['Content-Range'] = obj.ContentRange;
    const body = obj.Body?.transformToWebStream();
    return new NextResponse(body ?? null, { status: obj.ContentRange ? 206 : 200, headers });
  }

  let src: Response;
  try {
    src = await fetch(m.resultUrl, {
      headers: rangeHeader ? { range: rangeHeader } : undefined,
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
  } catch (e) {
    return NextResponse.json({ error: 'fetch_failed', detail: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
  if (!src.ok && src.status !== 206) {
    return NextResponse.json({ error: `upstream_${src.status}` }, { status: 502 });
  }

  const headers: Record<string, string> = {
    'Content-Type': src.headers.get('content-type') ?? 'video/mp4',
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
