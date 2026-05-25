import { Worker } from 'bullmq';
import { prisma } from '@/lib/prisma';
import { connection, QUEUE_NAMES, type EditJob } from '@/lib/queue';
import { refundTokens } from '@/lib/tokens';
import {
  createProject,
  waitForProject,
  downloadBytes,
  SubmagicError,
} from '@/lib/submagic';
import { keyFor, uploadBuffer } from '@/lib/storage';
import { getTemplate } from '@/lib/edit-templates';

export function startSubmagicEditWorker() {
  const worker = new Worker<EditJob>(
    QUEUE_NAMES.submagicEdit,
    async (job) => {
      const { editId, userId } = job.data;

      const row = await prisma.videoEdit.findUnique({
        where: { id: editId },
        include: { videoGeneration: true },
      });
      if (!row) throw new Error('edit_missing');
      if (row.userId !== userId) throw new Error('user_mismatch');
      if (!row.videoGeneration.videoUrl || row.videoGeneration.status !== 'completed') {
        throw new Error('source_video_not_ready');
      }

      // `row.template` теперь хранит точное имя Submagic-шаблона (например
      // "Hormozi 2"). Legacy-строки старых slug-форматов резолвим через
      // getTemplate() для backward-compat.
      const legacy = getTemplate(row.template);
      const submagicTemplate = legacy?.submagicTemplate ?? row.template;

      await prisma.videoEdit.update({
        where: { id: editId },
        data: { status: 'processing' },
      });

      try {
        let projectId = row.submagicProjectId;
        if (!projectId) {
          const project = await createProject({
            videoUrl: row.videoGeneration.videoUrl,
            templateName: submagicTemplate,
            language: row.subtitleLanguage,
            subtitlesEnabled: row.subtitlesEnabled,
            brollsEnabled: row.brollsEnabled,
            projectName: `persona-${userId.slice(0, 6)}-${row.id.slice(0, 6)}`,
          });
          projectId = project.id;
          await prisma.videoEdit.update({
            where: { id: editId },
            data: { submagicProjectId: projectId },
          });
          console.log(`[submagic-edit] ${editId} project=${projectId} template=${submagicTemplate} brolls=${row.brollsEnabled}`);
        } else {
          console.log(`[submagic-edit] ${editId} resuming project=${projectId}`);
        }

        const finished = await waitForProject(projectId);
        if (!finished.downloadUrl) {
          throw new SubmagicError('SUBMAGIC_NO_URL', `completed but no downloadUrl for ${projectId}`);
        }

        const dl = await downloadBytes(finished.downloadUrl);
        const key = keyFor('video', userId, 'mp4');
        const stableUrl = await uploadBuffer({
          key,
          body: dl.bytes,
          contentType: dl.mime,
          cacheControl: 'public, max-age=86400',
        });

        await prisma.videoEdit.update({
          where: { id: editId },
          data: {
            resultUrl: stableUrl,
            status: 'completed',
            completedAt: new Date(),
          },
        });
        console.log(`[submagic-edit] ${editId} done (${dl.bytes.length} bytes)`);
        return { ok: true, bytes: dl.bytes.length };
      } catch (e) {
        const msg = e instanceof SubmagicError ? `${e.code}: ${e.message}` : (e instanceof Error ? e.message : String(e));
        const maxAttempts = job.opts.attempts ?? 1;
        const isFinal = job.attemptsMade + 1 >= maxAttempts;
        if (isFinal) {
          await prisma.videoEdit.update({
            where: { id: editId },
            data: { status: 'failed', errorMsg: msg.slice(0, 500) },
          });
          await refundTokens({
            userId,
            amount: row.tokensCost,
            reason: 'submagic-edit:failed',
            refId: editId,
          });
        } else {
          await prisma.videoEdit.update({
            where: { id: editId },
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
    console.error('[submagic-edit] job failed', job?.id, err?.message);
  });
  worker.on('completed', (job, result) => {
    console.log('[submagic-edit] job done', job.id, result);
  });

  return worker;
}
