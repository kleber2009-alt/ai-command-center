import { prisma } from "@/lib/db";
import { coverKey, putObject, s3 } from "@/lib/storage";
import { refundTokens } from "@/lib/tokens";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { coverPrompt } from "@/prompts/cover";
import { imageBackend } from "./gemini";
import type { Readable } from "stream";

async function downloadFromR2(key: string) {
  const bucket = process.env.R2_BUCKET || "persona-studio";
  const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const stream = res.Body as Readable;
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(Buffer.from(c));
  return {
    bytes: Buffer.concat(chunks),
    mimeType: res.ContentType || "image/png",
  };
}

export async function runCoverGeneration(opts: {
  generationId: string;
  userId: string;
  avatarId: string;
  title: string;
  subtitle: string;
  cta: string;
}) {
  const { generationId, userId, avatarId, title, subtitle, cta } = opts;

  await prisma.generation.update({
    where: { id: generationId },
    data: { status: "RUNNING" },
  });

  const avatar = await prisma.avatar.findFirst({
    where: { id: avatarId, userId },
  });
  if (!avatar) {
    await markFailed(generationId, userId, "avatar not found");
    throw new Error("avatar not found");
  }

  try {
    const source = await downloadFromR2(avatar.imageKey);
    const backend = imageBackend();
    const out = await backend.editImage({
      sourceImage: source,
      prompt: coverPrompt({ title, subtitle, cta }),
    });

    const id = crypto.randomUUID();
    const key = coverKey(userId, id);
    const { url } = await putObject(key, out.bytes, out.mimeType);

    const cover = await prisma.cover.create({
      data: {
        id,
        userId,
        avatarId,
        generationId,
        imageUrl: url,
        imageKey: key,
        title,
        subtitle,
        cta,
      },
    });

    await prisma.generation.update({
      where: { id: generationId },
      data: { status: "SUCCEEDED", finishedAt: new Date() },
    });

    return cover;
  } catch (e) {
    await markFailed(generationId, userId, (e as Error).message);
    throw e;
  }
}

async function markFailed(generationId: string, userId: string, msg: string) {
  const gen = await prisma.generation.findUnique({
    where: { id: generationId },
  });
  await prisma.generation.update({
    where: { id: generationId },
    data: { status: "FAILED", finishedAt: new Date(), errorMessage: msg },
  });
  if (gen && gen.tokensSpent > 0) {
    await refundTokens(userId, gen.tokensSpent, "Cover failed", generationId);
  }
}
