import { PrismaClient } from "@docsys/database";
import { Queue, Worker } from "bullmq";
import { createServer } from "http";
import pino from "pino";
import { z } from "zod";
import { runExport } from "./export";
import { compactSnapshots, runPurge } from "./purge";
import { StorageConfig } from "./storage";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  LOG_LEVEL: z.string().default("info"),
  WORKER_HEALTH_PORT: z.coerce.number().int().positive().default(3003),
  TRASH_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
  SNAPSHOT_KEEP_LATEST: z.coerce.number().int().positive().default(5),
  S3_ENDPOINT: z.string().url().default("http://localhost:9000"),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().default("docsys"),
  S3_ACCESS_KEY: z.string().default("minioadmin"),
  S3_SECRET_KEY: z.string().default("minioadmin"),
});

const env = envSchema.parse(process.env);
const logger = pino({ level: env.LOG_LEVEL });
const prisma = new PrismaClient();

const storageConfig: StorageConfig = {
  endpoint: env.S3_ENDPOINT,
  accessKey: env.S3_ACCESS_KEY,
  secretKey: env.S3_SECRET_KEY,
  bucket: env.S3_BUCKET,
  region: env.S3_REGION,
};

const QUEUE_NAME = "lifecycle";
const EXPORT_QUEUE_NAME = "docsys-exports";

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

  const exportWorker = new Worker(
    EXPORT_QUEUE_NAME,
    async (job) => {
      const exportJobId = (job.data as { exportJobId: string }).exportJobId;
      try {
        await runExport(prisma, storageConfig, exportJobId, async (progress) => {
          await job.updateProgress(progress);
        });
        logger.info({ exportJobId }, "export completed");
      } catch (error) {
        await prisma.exportJob.update({
          where: { id: exportJobId },
          data: { status: "failed", errorMessage: (error as Error).message, finishedAt: new Date() },
        });
        throw error;
      }
    },
    { connection },
  );

  exportWorker.on("failed", (job, error) => {
    logger.error({ jobId: job?.id, error: error.message }, "export job failed");
  });

  const health = createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
  });
  health.listen(env.WORKER_HEALTH_PORT, () => logger.info({ port: env.WORKER_HEALTH_PORT }, "worker health endpoint"));

  logger.info("worker started");
}

if (require.main === module) {
  void main();
}
