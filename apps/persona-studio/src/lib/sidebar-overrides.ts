import { prisma } from '@/lib/prisma';
import { SIDEBAR_SECTIONS } from '@/components/shell/sidebar-nav';

export type SidebarItemFlat = {
  key: string;
  label: string;
  href: string;
  sectionKey: string;
  sectionLabel: string;
};

export function flattenSidebar(): SidebarItemFlat[] {
  return SIDEBAR_SECTIONS.flatMap((s) =>
    s.items.map((i) => ({
      key: i.key,
      label: i.label,
      href: i.href,
      sectionKey: s.key,
      sectionLabel: s.label,
    })),
  );
}

export async function getHiddenSidebarKeys(): Promise<string[]> {
  try {
    const rows = await prisma.sidebarItemOverride.findMany({
      where: { hidden: true },
      select: { itemKey: true },
    });
    return rows.map((r) => r.itemKey);
  } catch {
    // table may not exist yet (pre-migration) — treat as no overrides
    return [];
  }
}

export async function getSidebarOverviewWithState(): Promise<
  (SidebarItemFlat & { hidden: boolean })[]
> {
  const [items, hidden] = await Promise.all([
    Promise.resolve(flattenSidebar()),
    getHiddenSidebarKeys(),
  ]);
  const set = new Set(hidden);
  return items.map((i) => ({ ...i, hidden: set.has(i.key) }));
}
