// GET  /api/admin/integrations — integration catalog + status (secrets masked)
// POST /api/admin/integrations — { key, value } set (empty value = remove),
//                                 or { bulk } — pasted text, keys auto-detected
// Admin only. Values are applied to this process immediately and picked up by
// the workers within 30 s (src/lib/app-settings.ts).

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentAdmin } from '@/lib/auth';
import { INTEGRATIONS, integrationStatus, isIntegrationKey, saveAppSetting } from '@/lib/app-settings';
import { extractKeys } from '@/lib/key-import';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  return NextResponse.json({ items: await integrationStatus() });
}

const Body = z.union([
  z.object({ key: z.string().min(1).max(64), value: z.string().max(4000) }),
  z.object({ bulk: z.string().min(1).max(50_000) }),
]);

const NEEDS_RESTART = new Set(INTEGRATIONS.filter((i) => i.restart).map((i) => i.key));

export async function POST(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'bad_body' }, { status: 400 });

  const updates: Record<string, string> =
    'bulk' in parsed.data ? extractKeys(parsed.data.bulk) : { [parsed.data.key]: parsed.data.value };
  for (const key of Object.keys(updates)) {
    if (!isIntegrationKey(key)) return NextResponse.json({ error: 'unknown_key' }, { status: 400 });
  }
  for (const [key, value] of Object.entries(updates)) await saveAppSetting(key, value);

  // Sign-in providers (SMTP, Google) are built when auth.ts loads: restart the
  // web container (docker restart policy brings it back in a few seconds).
  const restart = Object.keys(updates).some((k) => NEEDS_RESTART.has(k)) && process.env.NODE_ENV === 'production';
  if (restart) setTimeout(() => process.exit(0), 1500).unref?.();

  return NextResponse.json({ ok: true, saved: Object.keys(updates), restart, items: await integrationStatus() });
}
