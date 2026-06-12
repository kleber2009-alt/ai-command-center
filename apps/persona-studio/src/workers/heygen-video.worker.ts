import { Worker } from 'bullmq';
import { prisma } from '@/lib/prisma';
import { connection, QUEUE_NAMES, omnihumanQueue, type HeygenVideoJob } from '@/lib/queue';
import { isEnabledEngine } from '@/lib/video-engines';
import { ELEVENLABS_VOICE_PRESETS } from '@/lib/elevenlabs-voices';
import {
  uploadTalkingPhoto,
  createVideoAvatarIV,
  waitForVideo,
  downloadBytes,
  HeygenError,
  uploadPhotoAvatarV3,
  createVideoV3AvatarV,
  waitForVideoV3,
  type Aspect,
  type HeygenModelVersion,
  type Quality,
} from '@/lib/heygen';
import { keyFor, uploadBuffer } from '@/lib/storage';
import { refundTokens } from '@/lib/tokens';

async function fetchBytes(url: string): Promise<{ bytes: Buffer; mime: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch_${res.status}`);
  const mime = res.headers.get('content-type') ?? 'image/jpeg';
  const ab = await res.arrayBuffer();
  return { bytes: Buffer.from(ab), mime };
}

export function startHeygenWorker() {
  const worker = new Worker<HeygenVideoJob>(
    QUEUE_NAMES.heygenVideo,
    async (job) => {
      const { videoId, userId } = job.data;

      const row = await prisma.videoGeneration.findUnique({
        where: { id: videoId },
        include: { avatar: true },
      });
      if (!row) throw new Error('video_missing');
      if (row.userId !== userId) throw new Error('user_mismatch');
      if (!row.avatar.imageUrl) throw new Error('avatar_no_image');
      if (!row.voiceId) throw new Error('voice_missing');
      if (!row.script || row.script.trim().length < 5) throw new Error('script_missing');

      await prisma.videoGeneration.update({
        where: { id: videoId },
        data: { status: 'processing' },
      });

      try {
        // На BullMQ-ретрае не запускаем новую генерацию в HeyGen, если уже
        // есть heygenJobId — продолжаем poll по существующему video_id.
        // Иначе одна VideoGeneration порождает до `attempts` HeyGen-видео.
        let heygenVideoId = row.heygenJobId;

        // Avatar V живёт на v3 endpoint, Avatar IV — на v2 (с use_avatar_iv_model).
        // Два полностью разных upload-и-create flow; см. heygen.ts.
        // effectiveVersion может сдвинуться на IV если Avatar V отказался от фото
        // (HeyGen quality-gate: stylized аватары часто не проходят cross-reference).
        let effectiveVersion: HeygenModelVersion = (row.heygenVersion as HeygenModelVersion) ?? 'V';

        const runIVPath = async (bytes: Buffer, mime: string): Promise<string> => {
          console.log(`[heygen-worker] ${videoId} (IV) uploading talking_photo…`);
          const asset = await uploadTalkingPhoto({ bytes, mime });
          console.log(`[heygen-worker] ${videoId} talking_photo_id=${asset.id}`);
          const id = await createVideoAvatarIV({
            talkingPhotoId: asset.id,
            voiceId: row.voiceId!,
            script: row.script!,
            aspect: (row.aspect as Aspect) ?? '9:16',
            quality: (row.quality as Quality) ?? '2k',
            background: row.background ?? '#000000',
            motionPrompt: row.motionPrompt ?? undefined,
          });
          console.log(`[heygen-worker] ${videoId} heygen_video_id=${id}`);
          return id;
        };

        if (!heygenVideoId) {
          const ref = await fetchBytes(row.avatar.imageUrl);

          if (effectiveVersion === 'V') {
            // 1) v3: upload bytes → asset → photo avatar
            console.log(`[heygen-worker] ${videoId} (V) uploading photo to v3…`);
            const v3 = await uploadPhotoAvatarV3({
              bytes: ref.bytes,
              mime: ref.mime,
              name: `pers-${userId}-${row.avatarId}`,
            });
            console.log(`[heygen-worker] ${videoId} v3 avatar_id=${v3.avatarId} engines=${v3.supportedEngines.join(',')}`);

            // Pre-flight: HeyGen возвращает список поддерживаемых движков.
            // Если avatar_v отсутствует — сразу fallback на IV, не тратя API call.
            if (!v3.supportedEngines.includes('avatar_v')) {
              console.warn(`[heygen-worker] ${videoId} avatar_v not in supported engines (${v3.supportedEngines.join(',') || 'empty'}), falling back to Avatar IV`);
              heygenVideoId = await runIVPath(ref.bytes, ref.mime);
              effectiveVersion = 'IV';
            } else {
              try {
                // 2) v3: create video with engine.type='avatar_v'
                heygenVideoId = await createVideoV3AvatarV({
                  avatarId: v3.avatarId,
                  voiceId: row.voiceId,
                  script: row.script,
                  aspect: (row.aspect as Aspect) ?? '9:16',
                  quality: (row.quality as Quality) ?? '2k',
                  background: row.background ?? undefined,
                });
                console.log(`[heygen-worker] ${videoId} v3 video_id=${heygenVideoId}`);
              } catch (e) {
                // Runtime fallback: HeyGen иногда отдаёт avatar_v в supported_api_engines,
                // но при создании видео реджектит «No cross-reference candidate» /
                // «no eligible instant avatar look». Это quality-gate, не баг payload.
                const isXRefReject = e instanceof HeygenError
                  && e.code === 'V3_VIDEO_HTTP_400'
                  && /cross-reference|instant avatar look/i.test(e.message);
                if (!isXRefReject) throw e;
                console.warn(`[heygen-worker] ${videoId} Avatar V rejected photo (${e.message.slice(0, 120)}), falling back to Avatar IV`);
                heygenVideoId = await runIVPath(ref.bytes, ref.mime);
                effectiveVersion = 'IV';
              }
            }
          } else {
            // Avatar IV — legacy v2 talking_photo flow
            heygenVideoId = await runIVPath(ref.bytes, ref.mime);
          }

          await prisma.videoGeneration.update({
            where: { id: videoId },
            data: {
              heygenJobId: heygenVideoId,
              // Перезаписываем версию если упали в fallback — иначе poll пойдёт по v3,
              // а video_id у нас v2-шный.
              ...(effectiveVersion !== (row.heygenVersion as HeygenModelVersion ?? 'V')
                ? { heygenVersion: effectiveVersion }
                : {}),
            },
          });
        } else {
          console.log(`[heygen-worker] ${videoId} resuming existing heygen_video_id=${heygenVideoId}`);
        }

        // 3) Poll until completed or failed (10 min max) — v3 uses /v3/videos/{id}.
        const result = effectiveVersion === 'V'
          ? await waitForVideoV3(heygenVideoId)
          : await waitForVideo(heygenVideoId);

        if (result.state !== 'completed') {
          const failMsg = result.state === 'failed' ? result.errorMessage : `unexpected state ${result.state}`;
          throw new HeygenError('HEYGEN_FAILED', failMsg);
        }

        // 4) Download mp4, re-host in our MinIO for stable URL
        console.log(`[heygen-worker] ${videoId} downloading mp4 from ${result.videoUrl.slice(0, 80)}…`);
        const dl = await downloadBytes(result.videoUrl);
        const ext = dl.mime.includes('mp4') ? 'mp4' : 'mp4';
        const key = keyFor('video', userId, ext);
        const stableUrl = await uploadBuffer({
          key,
          body: dl.bytes,
          contentType: dl.mime,
          cacheControl: 'public, max-age=86400',
        });

        await prisma.videoGeneration.update({
          where: { id: videoId },
          data: {
            videoUrl: stableUrl,
            status: 'completed',
            completedAt: new Date(),
          },
        });
        console.log(`[heygen-worker] ${videoId} done (${dl.bytes.length} bytes, ${result.duration ?? '?'}s)`);
        return { ok: true, bytes: dl.bytes.length };
      } catch (e) {
        const msg = e instanceof HeygenError ? `${e.code}: ${e.message}` : (e instanceof Error ? e.message : String(e));

        // HeyGen free-tier limits (photo-avatar count, video credits, voice quota)
        // shouldn't hard-fail the user. Re-route the job to OmniHuman (KIE — no
        // per-account limits) so it still completes. Voice provider differs
        // (HeyGen voice → ElevenLabs TTS), so substitute a safe multilingual
        // default voice for the OmniHuman TTS step. Keep the tokens (no refund).
        const isPlanLimit =
          e instanceof HeygenError &&
          /401028|exceeded your limit|photo avatar|insufficient credit|quota|upgrade your plan/i.test(
            `${e.code} ${e.message}`,
          );
        if (isPlanLimit && row.engine !== 'omnihuman-1.5' && isEnabledEngine('omnihuman-1.5')) {
          const fallbackVoice = ELEVENLABS_VOICE_PRESETS[0]?.voice_id ?? '';
          console.warn(`[heygen-worker] ${videoId} HeyGen limit (${msg.slice(0, 90)}) → OmniHuman fallback`);
          await prisma.videoGeneration.update({
            where: { id: videoId },
            data: {
              engine: 'omnihuman-1.5',
              heygenJobId: null,
              audioUrl: null,
              voiceId: fallbackVoice,
              status: 'processing',
              errorMsg: 'heygen limit → omnihuman fallback',
            },
          });
          await omnihumanQueue().add('generate', { videoId, userId }, { jobId: `omni-${videoId}` });
          return { ok: true, fallback: 'omnihuman' as const };
        }

        const maxAttempts = job.opts.attempts ?? 1;
        const isFinal = job.attemptsMade + 1 >= maxAttempts;
        if (isFinal) {
          await prisma.videoGeneration.update({
            where: { id: videoId },
            data: { status: 'failed', errorMsg: msg.slice(0, 500) },
          });
          await refundTokens({
            userId,
            amount: row.tokensCost,
            reason: 'heygen-video:failed',
            refId: videoId,
          });
        } else {
          // оставляем status=processing; следующий attempt продолжит poll по heygenJobId
          await prisma.videoGeneration.update({
            where: { id: videoId },
            data: { errorMsg: msg.slice(0, 500) },
          });
        }
        throw e;
      }
    },
    {
      connection: connection(),
      concurrency: 2,
    },
  );

  worker.on('failed', (job, err) => {
    console.error('[heygen-worker] job failed', job?.id, err?.message);
  });
  worker.on('completed', (job, result) => {
    console.log('[heygen-worker] job done', job.id, result);
  });

  return worker;
}
