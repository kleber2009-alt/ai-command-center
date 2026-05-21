// requireUser wrapper for Route Handlers. Returns a NextResponse 401 when
// no session is present, so the handler can `return response`.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function requireUser() {
  const session = await auth();
  const u = session?.user as { id?: string; email?: string; role?: string } | undefined;
  if (!u?.id) {
    return { user: null, response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }
  return {
    user: { id: u.id, email: u.email ?? "", role: u.role ?? "user" },
    response: null,
  };
}
