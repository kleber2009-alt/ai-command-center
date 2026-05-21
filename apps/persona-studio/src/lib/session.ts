import { getServerSession } from "next-auth";
import { authOptions } from "./auth";

export async function requireUser() {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string; email?: string | null } | undefined;
  if (!user?.id) {
    throw new Response("Unauthorized", { status: 401 });
  }
  return user as { id: string; email: string | null };
}

export async function maybeUser() {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string; email?: string | null } | undefined;
  return user?.id ? (user as { id: string; email: string | null }) : null;
}
