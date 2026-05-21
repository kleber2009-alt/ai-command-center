import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { aiTools } from "@/lib/db/schema";
import { ToolRunner } from "./ToolRunner";

export const dynamic = "force-dynamic";

export default async function ToolPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [tool] = await db.select().from(aiTools).where(eq(aiTools.slug, slug)).limit(1);
  if (!tool || tool.status === "disabled") notFound();

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <div className="text-sm text-muted uppercase tracking-wider">{tool.category}</div>
        <h1 className="text-3xl font-semibold mt-1">{tool.name}</h1>
        {tool.description && <p className="text-muted mt-2">{tool.description}</p>}
        <div className="text-sm text-muted mt-3">
          Стоимость: <span className="text-text font-medium">{tool.tokenCost} токенов</span>
        </div>
      </div>
      <ToolRunner slug={tool.slug} schema={tool.inputSchema} />
    </div>
  );
}
