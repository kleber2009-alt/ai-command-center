// GET  /api/admin/integrations — integration catalog + status (secrets masked)
// POST /api/admin/integrations — { key, value } set (empty value = remove)
// Admin only. Values are applied to this process immediately and picked up by
// the workers within 30 s (src/lib/app-settings.ts).

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentAdmin } from '@/lib/auth';
import { integrationStatus, isIntegrationKey, saveAppSetting } from '@/lib/app-settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  return NextResponse.json({ items: await integrationStatus() });
}

const Body = z.object({
  key: z.string().min(1).max(64),
  value: z.string().max(4000),
});

export async function POST(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'bad_body' }, { status: 400 });
  if (!isIntegrationKey(parsed.data.key)) return NextResponse.json({ error: 'unknown_key' }, { status: 400 });
  await saveAppSetting(parsed.data.key, parsed.data.value);
  return NextResponse.json({ ok: true, items: await integrationStatus() });
}
