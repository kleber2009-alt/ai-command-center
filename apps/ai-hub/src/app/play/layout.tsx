import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { CommandMenu } from "@/components/CommandMenu";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function PlayLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const user = session?.user as { role?: string } | undefined;
  const isAdmin = user?.role === "admin";

  return (
    <div className="flex min-h-screen">
      <Sidebar isAdmin={isAdmin} />
      <div className="flex-1 min-w-0 flex flex-col">
        <Topbar />
        <main className="flex-1 pb-24 md:pb-0">{children}</main>
      </div>
      <MobileBottomNav />
      <CommandMenu />
    </div>
  );
}
