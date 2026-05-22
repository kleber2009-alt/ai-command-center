import { startAvatarWorker } from './avatar-generation.worker';
import { startCoverWorker } from './cover-generation.worker';
import { startHeygenWorker } from './heygen-video.worker';
import { startOmnihumanWorker } from './omnihuman-video.worker';

const workers = [
  startAvatarWorker(),
  startCoverWorker(),
  startHeygenWorker(),
  startOmnihumanWorker(),
];

console.log('[persona-studio:worker] started avatar + cover + heygen + omnihuman workers');

async function shutdown(reason: string) {
  console.log(`[persona-studio:worker] shutting down (${reason})…`);
  await Promise.all(workers.map((w) => w.close()));
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
