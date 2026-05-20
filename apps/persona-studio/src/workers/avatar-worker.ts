import { QUEUES, Worker, connection, type AvatarJobData } from "@/lib/queue";
import { runAvatarGeneration } from "@/services/avatar-generator";

const worker = new Worker<AvatarJobData>(
  QUEUES.AVATAR,
  async (job) => {
    const { generationId } = job.data;
    await runAvatarGeneration(generationId);
  },
  { connection: connection(), concurrency: 2 }
);

worker.on("ready", () => console.log("[avatar-worker] ready"));
worker.on("failed", (job, err) =>
  console.error("[avatar-worker] failed", job?.id, err)
);
worker.on("completed", (job) =>
  console.log("[avatar-worker] completed", job.id)
);
