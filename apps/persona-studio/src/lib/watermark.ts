// Free-plan watermarking for generated images (avatars, covers).
//
// Off by default — enable with WATERMARK_FREE_PLAN=true. Applies only to users
// who have never paid (lib/plan.ts hasEverPaid), so paying customers'
// outputs are never marked even though their User.plan stays 'free'. Fails open
// (returns the original bytes) on any error so generation is never broken.
import sharp from 'sharp';
import { hasEverPaid } from './plan';
import { shouldWatermark } from './watermark-gate';

async function applyWatermark(bytes: Buffer): Promise<Buffer> {
  const img = sharp(bytes);
  const meta = await img.metadata();
  const w = meta.width ?? 1024;
  const h = meta.height ?? 1024;
  const fontSize = Math.max(18, Math.round(w * 0.035));
  const pad = Math.round(fontSize * 0.7);
  const stroke = Math.max(1, Math.round(fontSize / 14));
  const svg = Buffer.from(
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">` +
      `<text x="${w - pad}" y="${h - pad}" text-anchor="end" ` +
      `font-family="Arial, Helvetica, sans-serif" font-weight="600" font-size="${fontSize}" ` +
      `fill="#ffffff" fill-opacity="0.78" stroke="#000000" stroke-opacity="0.35" ` +
      `stroke-width="${stroke}" paint-order="stroke">Persona Studio</text></svg>`,
  );
  // Composite preserves the input format (no explicit .jpeg()/.png() call).
  return img.composite([{ input: svg, top: 0, left: 0 }]).toBuffer();
}

/**
 * Watermark `bytes` when free-plan watermarking is enabled and the user hasn't
 * paid. Otherwise (or on error) returns the original bytes unchanged. The
 * image format/mime is preserved.
 */
export async function maybeWatermark(bytes: Buffer, _mime: string, userId: string): Promise<Buffer> {
  const enabled = process.env.WATERMARK_FREE_PLAN === 'true';
  if (!enabled) return bytes;
  try {
    const paid = await hasEverPaid(userId);
    if (!shouldWatermark(enabled, paid)) return bytes;
    return await applyWatermark(bytes);
  } catch (e) {
    console.warn('[watermark] failed, using original:', e instanceof Error ? e.message : e);
    return bytes;
  }
}
