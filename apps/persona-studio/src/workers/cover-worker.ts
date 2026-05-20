import { QUEUES, Worker, connection, type CoverJobData } from "@/lib/queue";
import { runCoverGeneration } from "@/services/cover-generator";

const worker = new Worker<CoverJobData>(
  QUEUES.COVER,
  async (job) => {
    await runCoverGeneration(job.data);
  },
  { connection: connection(), concurrency: 4 }
);

worker.on("ready", () => console.log("[cover-worker] ready"));
worker.on("failed", (job, err) =>
  console.error("[cover-worker] failed", job?.id, err)
);
worker.on("completed", (job) =>
  console.log("[cover-worker] completed", job.id)
);
