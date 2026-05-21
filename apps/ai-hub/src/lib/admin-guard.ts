// requireAdmin — used in both Server Components and Route Handlers.
// Returns user OR throws/redirects.

import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function requireAdminPage() {
  const session = await auth();
  const user = session?.user as { id?: string; email?: string; role?: string } | undefined;
  if (!user?.id) redirect("/login?next=/admin");
  if (user.role !== "admin") redirect("/dashboard");
  return { id: user.id, email: user.email!, role: user.role };
}

export async function requireAdminApi() {
  const session = await auth();
  const user = session?.user as { id?: string; email?: string; role?: string } | undefined;
  if (!user?.id) {
    return { user: null, response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }
  if (user.role !== "admin") {
    return { user: null, response: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }
  return {
    user: { id: user.id, email: user.email!, role: user.role },
    response: null,
  };
}
