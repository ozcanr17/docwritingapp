import { PrismaClient } from "@reqtrack/database";
import { Queue, Worker } from "bullmq";
import pino from "pino";
import { z } from "zod";
import { compactSnapshots, runPurge } from "./purge";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  LOG_LEVEL: z.string().default("info"),
  TRASH_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
  SNAPSHOT_KEEP_LATEST: z.coerce.number().int().positive().default(5),
});

const env = envSchema.parse(process.env);
const logger = pino({ level: env.LOG_LEVEL });
const prisma = new PrismaClient();

const QUEUE_NAME = "lifecycle";

async function main(): Promise<void> {
  const redisUrl = new URL(env.REDIS_URL);
  const connection = {
    host: redisUrl.hostname,
    port: Number(redisUrl.port || 6379),
    maxRetriesPerRequest: null,
  };
  const queue = new Queue(QUEUE_NAME, { connection });

  await queue.upsertJobScheduler("purge-expired", { pattern: "0 3 * * *" }, { name: "purge" });
  await queue.upsertJobScheduler("compact-snapshots", { pattern: "30 3 * * *" }, { name: "compact" });

  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      if (job.name === "purge") {
        const result = await runPurge(prisma, env.TRASH_RETENTION_DAYS);
        logger.info(result, "purge completed");
        return result;
      }
      if (job.name === "compact") {
        const removed = await compactSnapshots(prisma, env.SNAPSHOT_KEEP_LATEST);
        logger.info({ removed }, "snapshot compaction completed");
        return { removed };
      }
      return null;
    },
    { connection },
  );

  worker.on("failed", (job, error) => {
    logger.error({ jobId: job?.id, error: error.message }, "job failed");
  });

  logger.info("worker started");
}

if (require.main === module) {
  void main();
}
