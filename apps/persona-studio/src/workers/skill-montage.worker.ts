import { createWriteStream } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { UnrecoverableError, Worker } from 'bullmq';
import { prisma } from '@/lib/prisma';
import { env } from '@/lib/env';
import { connection, QUEUE_NAMES, type MontageJob } from '@/lib/queue';
import { refundTokens } from '@/lib/tokens';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { BUCKET, keyFor, keyFromPublicUrl, s3, uploadBuffer } from '@/lib/storage';
import type { Word } from '@/lib/montage/edl';
import { montagePreset } from '@/lib/montage/presets';
import { DEFAULT_MONTAGE_OPTIONS, extractAudio, probe, renderMontage, type MontageOptions } from '@/lib/montage/render';
import { transcribeWords, TranscribeWordsError } from '@/lib/montage/transcribe-words';

// Монтаж по скиллу: скачать исходник → Whisper word-timestamps (кэш в
// Montage.transcript, чтобы ретрай не платил за распознавание повторно) →
// renderMontage (ffmpeg + libass) → S3. Ошибки входных данных — без ретраев.

const MAX_SOURCE_BYTES = 1024 * 1024 * 1024; // 1 ГБ

async function download(url: string, to: string) {
  // Свои файлы (загрузки, аватар-видео) читаем через S3-клиент: публичный URL
  // (S3_PUBLIC_URL) может быть недоступен изнутри контейнера воркера.
  const key = keyFromPublicUrl(url);
  if (key) {
    const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    if ((obj.ContentLength ?? 0) > MAX_SOURCE_BYTES) throw new UnrecoverableError('SOURCE_TOO_LARGE: исходник больше 1 ГБ');
    await pipeline(obj.Body as Readable, createWriteStream(to));
    return;
  }
  const res = await fetch(url, { signal: AbortSignal.timeout(600_000) });
  if (!res.ok || !res.body) throw new Error(`source_download_failed: HTTP ${res.status}`);
  const len = Number(res.headers.get('content-length') ?? 0);
  if (len > MAX_SOURCE_BYTES) throw new UnrecoverableError('SOURCE_TOO_LARGE: исходник больше 1 ГБ');
  await pipeline(Readable.fromWeb(res.body as unknown as WebReadableStream), createWriteStream(to));
}

export function startSkillMontageWorker() {
  const worker = new Worker<MontageJob>(
    QUEUE_NAMES.skillMontage,
    async (job) => {
      const { montageId, userId } = job.data;
      const row = await prisma.montage.findUnique({ where: { id: montageId } });
      if (!row) throw new UnrecoverableError('montage_missing');
      if (row.userId !== userId) throw new UnrecoverableError('user_mismatch');

      await prisma.montage.update({ where: { id: montageId }, data: { status: 'processing', errorMsg: null } });
      const dir = await mkdtemp(join(tmpdir(), 'montage-'));
      try {
        const preset = montagePreset(row.style);
        const options: MontageOptions = { ...DEFAULT_MONTAGE_OPTIONS, ...((row.options as Partial<MontageOptions>) ?? {}) };

        const src = join(dir, 'src.mp4');
        await download(row.sourceUrl, src);
        const pr = await probe(src, env.FFPROBE_PATH);
        if (!pr.hasAudio) throw new UnrecoverableError('NO_AUDIO: в исходнике нет звуковой дорожки');
        if (pr.duration > env.MONTAGE_MAX_SOURCE_SEC) {
          throw new UnrecoverableError(`SOURCE_TOO_LONG: ${Math.round(pr.duration)} c > ${env.MONTAGE_MAX_SOURCE_SEC} c`);
        }

        let words = Array.isArray(row.transcript) ? (row.transcript as unknown as Word[]) : null;
        const needWords = options.cutSilence || options.subtitles;
        if (!words && needWords) {
          const audio = join(dir, 'audio.mp3');
          await extractAudio(src, audio, env.FFMPEG_PATH);
          try {
            words = await transcribeWords(audio, 'ru');
          } catch (e) {
            if (e instanceof TranscribeWordsError && (e.code === 'NO_TRANSCRIBER' || e.code === 'AUDIO_TOO_LARGE')) {
              throw new UnrecoverableError(`${e.code}: ${e.message}`);
            }
            throw e;
          }
          await prisma.montage.update({ where: { id: montageId }, data: { transcript: words as unknown as object } });
        }

        const out = join(dir, 'out.mp4');
        const res = await renderMontage({
          src,
          workDir: dir,
          out,
          probe: pr,
          words: words ?? [],
          preset,
          options,
          hookTitle: row.hookTitle,
          ctaWord: row.ctaWord,
          bin: env.FFMPEG_PATH,
        });

        const url = await uploadBuffer({
          key: keyFor('video', userId, 'mp4'),
          body: await readFile(out),
          contentType: 'video/mp4',
          cacheControl: 'public, max-age=86400',
        });
        await prisma.montage.update({
          where: { id: montageId },
          data: { status: 'completed', resultUrl: url, durationSec: res.duration, completedAt: new Date(), errorMsg: null },
        });
        console.log(`[skill-montage] ${montageId} done style=${preset.id} ${pr.duration.toFixed(1)}s → ${res.duration.toFixed(1)}s, ${res.segments.length} cuts`);
        return { ok: true, duration: res.duration };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const isFinal = e instanceof UnrecoverableError || job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
        if (isFinal) {
          await prisma.montage.update({ where: { id: montageId }, data: { status: 'failed', errorMsg: msg.slice(0, 500) } });
          await refundTokens({ userId, amount: row.tokensCost, reason: 'skill-montage:failed', refId: montageId });
        } else {
          await prisma.montage.update({ where: { id: montageId }, data: { errorMsg: msg.slice(0, 500) } });
        }
        throw e;
      } finally {
        await rm(dir, { recursive: true, force: true }).catch(() => {});
      }
    },
    {
      connection: connection(),
      // ffmpeg грузит CPU целиком — по одному ролику на процесс воркера
      concurrency: 1,
      lockDuration: 600_000,
    },
  );

  worker.on('failed', (job, err) => {
    console.error('[skill-montage] job failed', job?.id, err?.message);
  });
  return worker;
}
