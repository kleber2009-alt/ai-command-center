import { randomUUID } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import { ALLOWED_VIDEO_MIME, MAX_UPLOAD_BYTES } from '@vp/shared';
import { presignUpload } from '@vp/storage';
import { z } from 'zod';
import { protectedProcedure, router } from '../trpc.js';

export const uploadsRouter = router({
  // Issue a presigned PUT so the browser uploads straight to R2 (§5.1).
  presign: protectedProcedure
    .input(
      z.object({
        filename: z.string().min(1),
        contentType: z.enum(ALLOWED_VIDEO_MIME),
        sizeBytes: z.number().int().positive().max(MAX_UPLOAD_BYTES),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const ext = input.filename.split('.').pop()?.toLowerCase() ?? 'mp4';
      const key = `uploads/${ctx.userId}/${randomUUID()}.${ext}`;
      try {
        const url = await presignUpload(key, input.contentType);
        return { url, key };
      } catch (err) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: String(err) });
      }
    }),
});
