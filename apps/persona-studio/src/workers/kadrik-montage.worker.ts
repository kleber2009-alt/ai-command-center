import { createWriteStream } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { UnrecoverableError, Worker } from 'bullmq';
import { prisma } from '@/lib/prisma';
import { env } from '@/lib/env';
import { connection, QUEUE_NAMES, type MontageJob } from '@/lib/queue';
import { refundTokens } from '@/lib/tokens';
import { keyFor, uploadBuffer } from '@/lib/storage';
import { findKadrikStyle } from '@/lib/montage/kadrik-styles';
import { createKadrikJob, getKadrikJob, KadrikError, kadrikProgress, kadrikResult, type KadrikJob } from '@/lib/montage/kadrik';

// Монтаж по стилю Студии Кадрика: задача уходит в бот (он монтирует скиллом
// через Claude Code), воркер ждёт её и забирает результат в S3. Id задачи бота
// хранится в Montage.externalId — ретрай продолжает ждать ту же задачу, а не
// заказывает монтаж заново.

// бот после перезапуска на минуту помечает оборванную задачу ошибкой и сам её
// продолжает — ошибку считаем окончательной, только если она держится дольше
const FAIL_GRACE_MS = 3 * 60_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Opts = { link?: string; script?: string; wish?: string };

export function startKadrikMontageWorker() {
  const worker = new Worker<MontageJob>(
    QUEUE_NAMES.kadrikMontage,
    async (job) => {
      const { montageId, userId } = job.data;
      const row = await prisma.montage.findUnique({ where: { id: montageId } });
      if (!row) throw new UnrecoverableError('montage_missing');
      if (row.userId !== userId) throw new UnrecoverableError('user_mismatch');
      if (row.status === 'completed' || row.status === 'failed') return { ok: row.status === 'completed' };
      const style = findKadrikStyle(row.style);
      if (!style) throw new UnrecoverableError(`UNKNOWN_STYLE: ${row.style}`);

      const dir = await mkdtemp(join(tmpdir(), 'kadrik-'));
      try {
        let extId = row.externalId;
        if (!extId) {
          const o = (row.options ?? {}) as Opts;
          const created = await createKadrikJob({
            skill: style.id,
            source: style.inp === 'video' ? row.sourceUrl : undefined,
            name: style.inp === 'video' ? `persona-${row.id}${extname(new URL(row.sourceUrl).pathname) || '.mp4'}` : undefined,
            link: o.link,
            script: o.script,
            code: row.ctaWord ?? undefined,
            wish: o.wish,
            ref: row.id,
          }).catch((e) => {
            throw e instanceof KadrikError && e.final ? new UnrecoverableError(`${e.code}: ${e.message}`) : e;
          });
          extId = created.id;
          await prisma.montage.update({
            where: { id: montageId },
            data: { externalId: extId, status: 'processing', progress: kadrikProgress(created), errorMsg: null },
          });
        } else {
          await prisma.montage.update({ where: { id: montageId }, data: { status: 'processing' } });
        }

        // ждём: бот недоступен (Mac спит, туннель упал) — не ошибка, просто ждём дальше до дедлайна
        const deadline = row.createdAt.getTime() + env.KADRIK_MAX_WAIT_MS;
        let last: KadrikJob | null = null;
        let failedSince = 0;
        let progress = '';
        for (;;) {
          if (Date.now() > deadline) throw new UnrecoverableError(`KADRIK_TIMEOUT: монтаж не закончился за ${Math.round(env.KADRIK_MAX_WAIT_MS / 3600_000)} ч`);
          try {
            last = await getKadrikJob(extId);
          } catch (e) {
            if (e instanceof KadrikError && e.final) throw new UnrecoverableError(`${e.code}: ${e.message}`);
            console.warn('[kadrik-montage] poll', montageId, e instanceof Error ? e.message : e);
            await sleep(env.KADRIK_POLL_INTERVAL_MS * 2);
            continue;
          }
          if (last.status === 'completed' && last.result) break;
          if (last.status === 'failed') {
            failedSince ||= Date.now();
            if (Date.now() - failedSince > FAIL_GRACE_MS) throw new UnrecoverableError(`KADRIK_FAILED: ${last.line || 'монтаж не завершён'}`);
          } else {
            failedSince = 0;
          }
          const p = kadrikProgress(last);
          if (p !== progress) {
            progress = p;
            await prisma.montage.update({ where: { id: montageId }, data: { progress: p } });
          }
          await job.updateProgress(last.stage * 20);
          await sleep(env.KADRIK_POLL_INTERVAL_MS);
        }

        const res = await kadrikResult(extId);
        const ext = (extname(res.name).slice(1) || 'mp4').toLowerCase();
        const file = join(dir, `result.${ext}`);
        await pipeline(Readable.fromWeb(res.body as unknown as WebReadableStream), createWriteStream(file));
        const isVideo = ['mp4', 'mov', 'm4v', 'webm'].includes(ext);
        const url = await uploadBuffer({
          key: keyFor('video', userId, ext),
          body: await readFile(file),
          contentType: isVideo ? 'video/mp4' : res.contentType,
          cacheControl: 'public, max-age=86400',
        });
        await prisma.montage.update({
          where: { id: montageId },
          data: {
            status: 'completed',
            resultUrl: url,
            format: isVideo ? row.format : 'text',
            progress: last.report.slice(-1500) || null,
            completedAt: new Date(),
            errorMsg: null,
          },
        });
        console.log(`[kadrik-montage] ${montageId} done style=${style.id} kadrik=${extId} → ${res.name}`);
        return { ok: true };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const isFinal = e instanceof UnrecoverableError || job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
        if (isFinal) {
          await prisma.montage.update({ where: { id: montageId }, data: { status: 'failed', errorMsg: msg.slice(0, 500) } });
          await refundTokens({ userId, amount: row.tokensCost, reason: 'kadrik-montage:failed', refId: montageId });
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
      // воркер только ждёт бота — монтирует сам Кадрик, по одной задаче за раз
      concurrency: 8,
      lockDuration: 600_000,
    },
  );

  worker.on('failed', (job, err) => {
    console.error('[kadrik-montage] job failed', job?.id, err?.message);
  });
  return worker;
}
