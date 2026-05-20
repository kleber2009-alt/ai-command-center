import { prisma } from "@/lib/db";
import { avatarKey, putObject, s3 } from "@/lib/storage";
import { refundTokens } from "@/lib/tokens";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { avatarPrompt } from "@/prompts/avatar";
import { AVATAR_STYLES } from "@/prompts/styles";
import { imageBackend } from "./gemini";
import type { Readable } from "stream";

async function downloadFromR2(key: string): Promise<{ bytes: Buffer; mimeType: string }> {
  const bucket = process.env.R2_BUCKET || "persona-studio";
  const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const stream = res.Body as Readable;
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(Buffer.from(c));
  return {
    bytes: Buffer.concat(chunks),
    mimeType: res.ContentType || "image/jpeg",
  };
}

export async function runAvatarGeneration(generationId: string) {
  const gen = await prisma.generation.findUnique({
    where: { id: generationId },
    include: { upload: true },
  });
  if (!gen || !gen.upload) throw new Error("generation or upload missing");

  await prisma.generation.update({
    where: { id: generationId },
    data: { status: "RUNNING" },
  });

  let source: { bytes: Buffer; mimeType: string };
  try {
    source = await downloadFromR2(gen.upload.key);
  } catch (e) {
    await markFailed(generationId, gen.userId, gen.tokensSpent, `download failed: ${(e as Error).message}`);
    throw e;
  }

  const backend = imageBackend();
  const created: { id: string; imageUrl: string; style: string }[] = [];

  try {
    for (let i = 0; i < AVATAR_STYLES.length; i++) {
      const style = AVATAR_STYLES[i];
      const prompt = avatarPrompt(style);
      const out = await backend.editImage({ sourceImage: source, prompt });

      const key = avatarKey(gen.userId, gen.id, i);
      const { url } = await putObject(key, out.bytes, out.mimeType);

      const row = await prisma.avatar.create({
        data: {
          userId: gen.userId,
          generationId: gen.id,
          uploadId: gen.uploadId,
          imageUrl: url,
          imageKey: key,
          style,
        },
      });
      created.push({ id: row.id, imageUrl: url, style });
    }
  } catch (e) {
    await markFailed(generationId, gen.userId, gen.tokensSpent, (e as Error).message);
    throw e;
  }

  await prisma.generation.update({
    where: { id: generationId },
    data: { status: "SUCCEEDED", finishedAt: new Date() },
  });

  return created;
}

async function markFailed(
  generationId: string,
  userId: string,
  tokensSpent: number,
  errorMessage: string
) {
  await prisma.generation.update({
    where: { id: generationId },
    data: { status: "FAILED", finishedAt: new Date(), errorMessage },
  });
  if (tokensSpent > 0) {
    await refundTokens(userId, tokensSpent, "Generation failed", generationId);
  }
}
