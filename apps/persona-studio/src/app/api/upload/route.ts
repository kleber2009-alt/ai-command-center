import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { putObject, uploadKey } from "@/lib/storage";

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(req: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (r) {
    return r as Response;
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }

  if (!ALLOWED.has(file.type)) {
    return NextResponse.json(
      { error: "unsupported file type", got: file.type },
      { status: 415 }
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "file too large" }, { status: 413 });
  }

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const key = uploadKey(user.id, ext);
  const bytes = Buffer.from(await file.arrayBuffer());

  const { url } = await putObject(key, bytes, file.type);

  const upload = await prisma.upload.create({
    data: {
      userId: user.id,
      key,
      url,
      mimeType: file.type,
      bytes: file.size,
    },
  });

  return NextResponse.json({
    id: upload.id,
    url: upload.url,
    bytes: upload.bytes,
    mimeType: upload.mimeType,
  });
}
