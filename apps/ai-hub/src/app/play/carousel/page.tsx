// Specialised /play/carousel — Instagram carousel studio (overrides generic /play/[slug]).
// Server component just hands off to the client studio.

import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { aiTools } from "@/lib/db/schema";
import { CarouselStudio } from "./CarouselStudio";

export const dynamic = "force-dynamic";

export default async function CarouselPage() {
  const [tool] = await db.select().from(aiTools).where(eq(aiTools.slug, "carousel")).limit(1);
  if (!tool || tool.status === "disabled") notFound();

  return (
    <CarouselStudio
      tokenCost={tool.tokenCost}
      provider={tool.provider}
      model={tool.model}
    />
  );
}
