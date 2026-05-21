import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { aiTools } from "@/lib/db/schema";
import { Playground } from "./Playground";

export const dynamic = "force-dynamic";

export default async function PlayPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ prompt?: string }>;
}) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const [tool] = await db.select().from(aiTools).where(eq(aiTools.slug, slug)).limit(1);
  if (!tool || tool.status === "disabled") notFound();

  return (
    <Playground
      slug={tool.slug}
      name={tool.name}
      description={tool.description ?? ""}
      tokenCost={tool.tokenCost}
      provider={tool.provider}
      model={tool.model}
      inputSchema={tool.inputSchema as Record<string, unknown>}
      initialPrompt={sp.prompt ?? ""}
    />
  );
}
