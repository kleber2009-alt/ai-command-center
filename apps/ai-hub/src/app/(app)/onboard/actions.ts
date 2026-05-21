"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export async function completeOnboarding(formData: FormData) {
  const session = await auth();
  const user = session?.user as { id?: string } | undefined;
  if (!user?.id) redirect("/login");

  const niche  = (formData.get("niche") as string | null) ?? "other";
  const prompt = (formData.get("prompt") as string | null) ?? "";
  const action = (formData.get("action") as string | null) ?? "dashboard";

  await db.update(users).set({
    niche,
    onboardingCompletedAt: new Date(),
  }).where(eq(users.id, user.id));

  if (action === "play") {
    redirect(`/play/nano-banana-2?prompt=${encodeURIComponent(prompt)}`);
  }
  redirect("/dashboard");
}
