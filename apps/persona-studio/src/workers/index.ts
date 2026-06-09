import { startAvatarWorker } from './avatar-generation.worker';
import { startCoverWorker } from './cover-generation.worker';
import { startHeygenWorker } from './heygen-video.worker';
import { startOmnihumanWorker } from './omnihuman-video.worker';
import { startSubmagicEditWorker } from './submagic-edit.worker';
import { startSlideImageWorker } from './slide-image.worker';
import { startResearchCronWorker } from './research-cron.worker';
import { startPostPublishWorker } from './post-publish.worker';
import { startScheduleCronWorker } from './schedule-cron.worker';

// Worker grouping (PS-13): run subsets in separate processes/containers so a
// crash in one group doesn't take down the others. Selected via WORKER_GROUP:
//   - 'generation' — avatar/cover/video/montage/slide (latency-critical,
//     token-charged, user-facing path).
//   - 'cron'       — research cron, scheduled-post sweep, publish (background).
//   - 'all'        — everything in one process (default; local dev & back-compat).
type WorkerGroup = 'all' | 'generation' | 'cron';
const GROUP = (process.env.WORKER_GROUP ?? 'all') as WorkerGroup;

const generationWorkers = () => [
  startAvatarWorker(),
  startCoverWorker(),
  startHeygenWorker(),
  startOmnihumanWorker(),
  startSubmagicEditWorker(),
  startSlideImageWorker(),
];

const cronWorkers = () => [
  startResearchCronWorker(),
  startPostPublishWorker(),
  startScheduleCronWorker(),
];

const workers =
  GROUP === 'generation'
    ? generationWorkers()
    : GROUP === 'cron'
      ? cronWorkers()
      : [...generationWorkers(), ...cronWorkers()];

console.log(`[persona-studio:worker] group=${GROUP} — started ${workers.length} workers`);
async function shutdown(reason: string) {
  console.log(`[persona-studio:worker] shutting down (${reason})…`);
  await Promise.all(workers.map((w) => w.close()));
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
