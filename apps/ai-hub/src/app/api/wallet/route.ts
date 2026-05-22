import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-helpers";
import { getWallet } from "@/lib/wallet";

export const dynamic = "force-dynamic";

export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response!;
  const wallet = await getWallet(user.id);
  return NextResponse.json({ wallet });
}
