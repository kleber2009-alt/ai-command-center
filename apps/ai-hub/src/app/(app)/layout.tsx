import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { CommandMenu } from "@/components/CommandMenu";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const user = session?.user as { id?: string; role?: string } | undefined;
  const isAdmin = user?.role === "admin";

  // First-login onboarding gate: send unfinished users through /onboard.
  if (user?.id) {
    const path = (await headers()).get("x-pathname") ?? "";
    if (!path.startsWith("/onboard")) {
      const [u] = await db.select({ done: users.onboardingCompletedAt })
        .from(users).where(eq(users.id, user.id)).limit(1);
      if (u && !u.done) redirect("/onboard");
    }
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar isAdmin={isAdmin} />
      <div className="flex-1 min-w-0 flex flex-col">
        <Topbar />
        <main className="flex-1 px-6 md:px-8 py-6 pb-24 md:pb-6 max-w-[1400px] w-full">{children}</main>
      </div>
      <MobileBottomNav />
      <CommandMenu />
    </div>
  );
}
