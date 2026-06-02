import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { getCurrentAdmin } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { flattenSidebar, getSidebarOverviewWithState } from '@/lib/sidebar-overrides';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  const items = await getSidebarOverviewWithState();
  return NextResponse.json({ items });
}

const Body = z.object({
  itemKey: z.string().min(1).max(120),
  hidden: z.boolean(),
});

export async function POST(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad_body', issues: parsed.error.issues }, { status: 400 });
  }
  const { itemKey, hidden } = parsed.data;

  const known = flattenSidebar().some((i) => i.key === itemKey);
  if (!known) {
    return NextResponse.json({ error: 'unknown_item_key' }, { status: 400 });
  }

  if (hidden) {
    await prisma.sidebarItemOverride.upsert({
      where: { itemKey },
      create: { itemKey, hidden: true },
      update: { hidden: true },
    });
  } else {
    await prisma.sidebarItemOverride.deleteMany({ where: { itemKey } });
  }

  // refresh layout so the sidebar updates without a hard reload
  revalidatePath('/', 'layout');

  return NextResponse.json({ ok: true, itemKey, hidden });
}
