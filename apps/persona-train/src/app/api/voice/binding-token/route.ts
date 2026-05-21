import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne, normalizeOwnerHandle } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function rand(n: number): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  const arr = new Uint8Array(n);
  crypto.getRandomValues(arr);
  for (let i = 0; i < n; i++) out += alphabet[arr[i] % alphabet.length];
  return out;
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const owner = normalizeOwnerHandle(body.owner_handle as string | undefined);
  if (!owner) return NextResponse.json({ error: 'owner_required' }, { status: 400 });

  const voice = await queryOne<{ id: string }>(
    'select id from voices where owner_handle = $1 and archived_at is null limit 1',
    [owner],
  );
  if (!voice) return NextResponse.json({ error: 'no_active_voice' }, { status: 404 });

  const token = `${rand(3)}-${rand(3)}`;
  const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  await query(
    `insert into voice_binding_tokens (token, owner_handle, voice_id, expires_at)
     values ($1, $2, $3, $4)`,
    [token, owner, voice.id, expires],
  );

  return NextResponse.json({ ok: true, token, expires_at: expires });
}
